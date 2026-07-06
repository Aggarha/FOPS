"""
FOPS Discovery Engine — Enterprise Music Intelligence Platform (v1).

Provides:
  1. Multi-variant YouTube search with match intelligence
  2. Canonical source detection (Official > VEVO > Topic > Verified)
  3. Match type classification (Official, VEVO, Reupload, Slowed, etc.)
  4. Confidence scoring per result
  5. Uploader/channel intelligence
  6. Batch processing support
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional, Callable

import yt_dlp

logger = logging.getLogger("services.discovery_engine")

# ── constants ────────────────────────────────────────────────────────────────
MAX_VARIANTS = 12
RESULTS_PER_VARIANT = 25
MAX_TOTAL_RESULTS = 200


# ── Query variant generation ─────────────────────────────────────────────────

def _generate_variants(artist: str, song: str) -> list[str]:
    """Generate diverse search queries to maximise recall."""
    a, s = artist.strip(), song.strip()
    variants = [
        f"{a} {s}",
        f"{s} {a}",
        f"{a} {s} official",
        f"{a} {s} official video",
        f"{a} {s} official music video",
        f"{a} {s} lyrics",
        f"{a} {s} audio",
        f"{a} {s} vevo",
        f"{s} official",
        f"{a} {s} clip",
        f"{a} {s} موسيقى",         # Arabic music suffix
        f"{a} {s} أغنية",           # Arabic song suffix
    ]
    # Deduplicate while preserving order
    seen = set()
    result = []
    for v in variants:
        k = v.lower()
        if k not in seen:
            seen.add(k)
            result.append(v)
    return result[:MAX_VARIANTS]


# ── Match type classifier ─────────────────────────────────────────────────────

def classify_match_type(title: str, channel: str, url: str = "", duration: int = 0) -> str:
    t = (title or "").lower()
    c = (channel or "").lower()
    u = (url or "").lower()

    if "vevo" in c:
        return "VEVO"
    if " - topic" in c:
        return "Topic"
    if "/shorts/" in u or (duration and 0 < duration < 62):
        return "Shorts"
    if any(x in t for x in ["official video", "official music video", "official mv", "official clip", "official audio"]):
        return "Official"
    if any(x in t for x in ["lyrics", "lyric video", "with lyrics"]):
        return "Lyrics"
    if any(x in t for x in ["slowed", "slowed + reverb", "slow version"]):
        return "Slowed"
    if any(x in t for x in ["sped up", "speed up", "nightcore", "fast version"]):
        return "Sped Up"
    if any(x in t for x in ["remix", "bootleg", "mashup", "edit"]):
        return "Remix"
    if any(x in t for x in ["live", "concert", "live at", "live performance", "concert version"]):
        return "Live"
    if any(x in t for x in ["reaction", "reacts", "reacting to"]):
        return "Reaction"
    if any(x in t for x in ["cover", "acoustic", "piano cover", "guitar cover"]):
        return "Cover"
    if any(x in t for x in ["clip", "snippet", "preview", "teaser", "short version"]):
        return "Clip"
    return "Reupload"


# ── Confidence scorer ────────────────────────────────────────────────────────

def _compute_confidence(
    title: str,
    channel: str,
    views: Optional[int],
    artist: str,
    song: str,
    match_type: str,
    is_official_channel: bool = False,
) -> float:
    """Score 0–100 for how well this result matches the target."""
    score = 0.0
    t_lower = (title or "").lower()
    a_lower = (artist or "").lower()
    s_lower = (song or "").lower()
    c_lower = (channel or "").lower()

    # Title match
    if a_lower in t_lower and s_lower in t_lower:
        score += 40.0
    elif s_lower in t_lower:
        score += 25.0
    elif a_lower in t_lower:
        score += 15.0

    # Channel/artist match
    if a_lower in c_lower:
        score += 20.0
    elif any(word in c_lower for word in a_lower.split() if len(word) > 3):
        score += 10.0

    # Match type bonus
    type_bonuses = {
        "Official": 25, "VEVO": 22, "Topic": 20,
        "Lyrics": 10, "Live": 8, "Remix": 5,
        "Cover": 3, "Slowed": 3, "Sped Up": 3,
        "Reupload": 2, "Reaction": 0, "Shorts": 2,
    }
    score += type_bonuses.get(match_type, 0)

    # Official channel boost
    if is_official_channel:
        score += 10.0

    # Views signal (log scale)
    if views:
        import math
        score += min(5.0, math.log10(max(views, 1)) * 0.5)

    return round(min(score, 100.0), 1)


def _is_official_channel(channel: str, title: str) -> bool:
    c = (channel or "").lower()
    t = (title or "").lower()
    return (
        "vevo" in c or
        " - topic" in c or
        "official" in c or
        "records" in c or
        "music" in c or
        "official" in t
    )


# ── Core search function ─────────────────────────────────────────────────────

def _search_variant(variant: str, max_per: int = RESULTS_PER_VARIANT) -> list[dict]:
    """Search YouTube for one variant query. Returns raw entry list."""
    from services.ytdlp_service import get_hardened_opts
    opts = get_hardened_opts({
        "extract_flat": True,
        "noplaylist": True,
        "socket_timeout": 15,
        "ignoreerrors": True,
    })
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{max_per}:{variant}", download=False)
            if not info:
                return []
            return [e for e in (info.get("entries") or []) if e and e.get("id")]
    except Exception as e:
        logger.debug("variant search error '%s': %s", variant, e)
        return []


def search_youtube(
    artist: str,
    song: str,
    max_results: int = 50,
    log_callback: Optional[Callable[[str], None]] = None,
    isrc: Optional[str] = None,
    upc: Optional[str] = None,
) -> dict:
    """Full discovery search for one artist+song pair.

    Returns:
        {
            success, artist, song, variants_used, total_candidates,
            results: [{video_id, title, url, channel, channel_url,
                       views, duration, upload_date, thumbnail,
                       match_type, confidence, is_official,
                       is_short, subscribers}],
            canonical: {best official/VEVO result} | None,
            elapsed_seconds,
        }
    """
    start = datetime.now()
    results_by_id: dict = {}

    def _log(msg: str):
        logger.info(msg)
        if log_callback:
            try:
                log_callback(msg)
            except Exception:
                pass

    _log(f"discovery: searching '{artist} — {song}'")
    variants = _generate_variants(artist, song)
    _log(f"discovery: generated {len(variants)} variants")

    # Run variants concurrently
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_search_variant, v): v for v in variants}
        for future in as_completed(futures):
            v = futures[future]
            try:
                entries = future.result()
            except Exception:
                entries = []
            for entry in entries:
                vid_id = entry.get("id")
                if not vid_id or vid_id in results_by_id:
                    continue
                results_by_id[vid_id] = entry

    _log(f"discovery: {len(results_by_id)} unique candidates")

    # Enrich and score
    results = []
    for entry in results_by_id.values():
        vid_id = entry["id"]
        title = entry.get("title") or ""
        channel = entry.get("channel") or entry.get("uploader") or ""
        channel_url = entry.get("channel_url") or entry.get("uploader_url") or ""
        views = entry.get("view_count")
        duration = entry.get("duration") or 0
        upload_date = entry.get("upload_date") or ""
        thumb = entry.get("thumbnail") or f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg"
        subscribers = entry.get("channel_follower_count")

        url = f"https://www.youtube.com/watch?v={vid_id}"
        is_short = "/shorts/" in url or (duration and 0 < duration < 62)
        match_type = classify_match_type(title, channel, url, duration)
        is_official = _is_official_channel(channel, title)

        confidence = _compute_confidence(
            title, channel, views, artist, song, match_type, is_official
        )

        results.append({
            "video_id": vid_id,
            "searched_artist": artist,
            "searched_song": song,
            "title": title,
            "url": url,
            "channel": channel,
            "channel_url": channel_url,
            "subscribers": subscribers,
            "views": views,
            "duration": duration,
            "duration_formatted": _fmt_dur(duration),
            "upload_date": _fmt_date(upload_date),
            "thumbnail": thumb,
            "match_type": match_type,
            "confidence": confidence,
            "is_official": is_official,
            "is_short": bool(is_short),
            "platform": "YouTube",
        })

    # Sort by confidence desc
    results.sort(key=lambda x: x["confidence"], reverse=True)
    results = results[:max_results]

    # Canonical detection: best Official/VEVO/Topic with highest views
    canonical = _detect_canonical(results)
    if canonical:
        _log(f"discovery: canonical → '{canonical['title']}' ({canonical['match_type']}, {canonical['views']} views)")
    else:
        _log("discovery: no canonical source found")

    elapsed = round((datetime.now() - start).total_seconds(), 2)
    _log(f"discovery: done in {elapsed}s — {len(results)} results")

    return {
        "success": len(results) > 0,
        "artist": artist,
        "song": song,
        "variants_used": len(variants),
        "total_candidates": len(results_by_id),
        "results": results,
        "canonical": canonical,
        "elapsed_seconds": elapsed,
    }


def _detect_canonical(results: list[dict]) -> Optional[dict]:
    """Pick the most authoritative source from result list."""
    if not results:
        return None

    priority_order = ["VEVO", "Official", "Topic", "Lyrics", "Live", "Reupload"]

    for match_type in priority_order:
        candidates = [r for r in results if r["match_type"] == match_type]
        if candidates:
            # Highest views wins within each type
            candidates.sort(key=lambda x: (x.get("views") or 0), reverse=True)
            return candidates[0]

    # Fallback: highest confidence overall
    return results[0] if results else None


def _fmt_dur(s) -> str:
    if not s:
        return ""
    try:
        s = int(s)
    except Exception:
        return ""
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def _fmt_date(d: str) -> str:
    """Convert YYYYMMDD to YYYY-MM-DD."""
    if not d or len(d) != 8:
        return d or ""
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}"


# ── Batch search ─────────────────────────────────────────────────────────────

def batch_search(
    items: list[dict],
    max_results_per: int = 30,
    max_threads: int = 3,
    log_callback: Optional[Callable[[str], None]] = None,
) -> list[dict]:
    """Search multiple artist+song pairs concurrently.

    Args:
        items: List of {artist, song, isrc?, upc?} dicts.
        max_results_per: Max results per item.
        max_threads: Concurrency level.
        log_callback: Progress logging.

    Returns:
        List of search result dicts, one per item.
    """
    def _log(msg):
        logger.info(msg)
        if log_callback:
            try:
                log_callback(msg)
            except Exception:
                pass

    _log(f"batch_search: {len(items)} items, {max_threads} threads")
    results = [None] * len(items)

    def _run(idx: int, item: dict):
        artist = item.get("artist", "")
        song = item.get("song", "")
        _log(f"batch_search [{idx+1}/{len(items)}]: '{artist} — {song}'")
        return idx, search_youtube(
            artist=artist,
            song=song,
            max_results=max_results_per,
            isrc=item.get("isrc"),
            upc=item.get("upc"),
            log_callback=log_callback,
        )

    with ThreadPoolExecutor(max_workers=max_threads) as pool:
        futures = [pool.submit(_run, i, item) for i, item in enumerate(items)]
        for future in as_completed(futures):
            try:
                idx, result = future.result()
                results[idx] = result
            except Exception as e:
                logger.error("batch_search item error: %s", e)

    return [r for r in results if r is not None]
