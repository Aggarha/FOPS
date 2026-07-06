"""
FOPS Channel Scraper — Enterprise YouTube Channel Crawler (v3).

Supports ALL URL formats:
  - https://youtube.com/@Rotana
  - https://youtube.com/c/Rotana
  - https://youtube.com/channel/UCXXXX
  - https://youtube.com/user/Rotana
  - @Rotana (bare handle)
  - UCXXXX (bare channel ID)

Features:
  - Unlimited scraping (max_results=0 means no cap)
  - Videos + Shorts + Live/Streams detection
  - Rich metadata: views, duration, upload date, thumbnails
  - Match type auto-classification
  - Subscriber count extraction
  - Activity log integration via log_callback
"""

import json
import logging
import re
from datetime import datetime
from typing import Optional, Callable

logger = logging.getLogger("tools.channel_scraper")


# ── URL normalisation ────────────────────────────────────────────────────────

def normalise_channel_input(raw: str) -> str:
    """Convert any channel identifier to a crawlable YouTube URL."""
    if not raw:
        raise ValueError("Empty channel input")
    s = raw.strip()

    if s.startswith("http://") or s.startswith("https://"):
        s = re.sub(r"https?://(?:www\.)?youtube\.com", "https://www.youtube.com", s)
        return s

    if s.startswith("@"):
        return f"https://www.youtube.com/{s}"

    if re.match(r"^UC[A-Za-z0-9_-]{20,}$", s):
        return f"https://www.youtube.com/channel/{s}"

    return f"https://www.youtube.com/@{s}"


# ── Match type classifier ────────────────────────────────────────────────────

def classify_match_type(title: str, channel: str, url: str = "", duration: int = 0) -> str:
    t = (title or "").lower()
    c = (channel or "").lower()
    u = (url or "").lower()

    if "/shorts/" in u:
        return "Shorts"
    if "vevo" in c:
        return "VEVO"
    if " - topic" in c:
        return "Topic"
    if any(x in t for x in ["official video", "official music video", "official mv", "official clip"]):
        return "Official"
    if any(x in t for x in ["lyrics", "lyric video", "with lyrics"]):
        return "Lyrics"
    if any(x in t for x in ["slowed", "slowed + reverb"]):
        return "Slowed"
    if any(x in t for x in ["sped up", "speed up", "nightcore"]):
        return "Sped Up"
    if any(x in t for x in ["remix", "bootleg", "mashup"]):
        return "Remix"
    if any(x in t for x in ["live", "concert", "live at", "live performance"]):
        return "Live"
    if any(x in t for x in ["reaction", "reacts to", "reacting"]):
        return "Reaction"
    if any(x in t for x in ["cover", "acoustic", "piano cover"]):
        return "Cover"
    if any(x in t for x in ["clip", "snippet", "preview", "teaser", "trailer"]):
        return "Clip"
    if duration and 0 < duration < 62:
        return "Shorts"
    return "Upload"


def _fmt_duration(seconds) -> str:
    if not seconds:
        return ""
    try:
        s = int(seconds)
    except Exception:
        return str(seconds)
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    if h:
        return f"{h}:{m:02d}:{sec:02d}"
    return f"{m}:{sec:02d}"


def _entries_from_info(info: dict) -> list:
    """Recursively flatten entries from yt-dlp info dict."""
    entries = []
    for e in (info.get("entries") or []):
        if not e:
            continue
        if e.get("_type") == "playlist":
            entries.extend(_entries_from_info(e))
        else:
            entries.append(e)
    return entries


def _yt_extract(url: str, max_results: int = 0) -> Optional[dict]:
    """Run yt-dlp extract_flat and return info dict or None."""
    import yt_dlp
    from services.ytdlp_service import get_hardened_opts
    opts = get_hardened_opts({
        "extract_flat": True,
        "ignoreerrors": True,
        "socket_timeout": 30,
        "retries": 3,
    })
    if max_results > 0:
        opts["playlistend"] = max_results
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as e:
        logger.debug("_yt_extract error for %s: %s", url, e)
        return None


# ── Main function ────────────────────────────────────────────────────────────

def get_channel_videos(
    channel_url: str,
    max_results: int = 0,
    metadata_enrichment: bool = True,
    include_shorts: bool = True,
    include_live: bool = True,
    log_callback: Optional[Callable[[str], None]] = None,
) -> dict:
    """Extract all videos from a YouTube channel.

    Args:
        channel_url: Any supported YouTube channel identifier.
        max_results: Cap on total videos. 0 = unlimited.
        metadata_enrichment: Kept for API compatibility (always True now).
        include_shorts: Include Shorts section.
        include_live: Include Streams/Live section.
        log_callback: Optional callable(str) for live progress logging.

    Returns:
        {success, channel{id,name,url,subscribers,video_count},
         videos[...], total_collected, elapsed_seconds, error}
    """
    start = datetime.now()
    videos_by_id: dict = {}
    channel_info: dict = {}

    def _log(msg: str):
        logger.info(msg)
        if log_callback:
            try:
                log_callback(msg)
            except Exception:
                pass

    try:
        url = normalise_channel_input(channel_url)
    except ValueError as e:
        return {"success": False, "channel": {}, "videos": [],
                "total_collected": 0, "elapsed_seconds": 0.0, "error": str(e)}

    _log(f"channel_scraper: resolved → {url}")

    # Fetch channel root for metadata
    root = _yt_extract(url, max_results=1)
    if root:
        channel_info = {
            "id": root.get("channel_id") or root.get("id", ""),
            "name": (root.get("channel") or root.get("uploader") or root.get("title", "")).strip(),
            "url": root.get("channel_url") or root.get("uploader_url") or url,
            "subscribers": root.get("channel_follower_count"),
            "video_count": root.get("playlist_count", 0),
        }
        _log(f"channel_scraper: '{channel_info['name']}' ~{channel_info['video_count']} videos")

    # Build section list
    sections = [("videos", url + "/videos")]
    if include_shorts:
        sections.append(("shorts", url + "/shorts"))
    if include_live:
        sections.append(("streams", url + "/streams"))

    for section_name, section_url in sections:
        _log(f"channel_scraper: crawling /{section_name}…")
        remaining = (max_results - len(videos_by_id)) if max_results > 0 else 0
        info = _yt_extract(section_url, max_results=remaining)
        if not info:
            _log(f"channel_scraper: /{section_name} — no response")
            continue

        entries = _entries_from_info(info)
        added = 0

        for entry in entries:
            vid_id = entry.get("id") or entry.get("video_id")
            if not vid_id or vid_id in videos_by_id:
                continue

            title = entry.get("title") or ""
            duration = entry.get("duration") or 0
            ch_name = (entry.get("channel") or entry.get("uploader") or
                       channel_info.get("name", ""))
            ch_url = (entry.get("channel_url") or entry.get("uploader_url") or
                      channel_info.get("url", ""))

            is_short = (section_name == "shorts" or
                        "/shorts/" in (entry.get("url") or "") or
                        (duration and 0 < duration < 62))
            is_live = section_name == "streams" or bool(entry.get("was_live"))

            thumb = (entry.get("thumbnail") or
                     f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg")

            match_type = classify_match_type(
                title, ch_name,
                entry.get("url") or f"https://www.youtube.com/watch?v={vid_id}",
                duration
            )

            videos_by_id[vid_id] = {
                "video_id": vid_id,
                "title": title,
                "url": f"https://www.youtube.com/watch?v={vid_id}",
                "duration": duration,
                "duration_formatted": _fmt_duration(duration),
                "views": entry.get("view_count"),
                "upload_date": entry.get("upload_date"),
                "channel": ch_name,
                "channel_url": ch_url,
                "thumbnail": thumb,
                "match_type": match_type,
                "is_short": bool(is_short),
                "is_live": bool(is_live),
                "tags": entry.get("tags") or [],
            }
            added += 1

            if max_results > 0 and len(videos_by_id) >= max_results:
                break

        _log(f"channel_scraper: /{section_name} +{added} (total {len(videos_by_id)})")

        if max_results > 0 and len(videos_by_id) >= max_results:
            _log(f"channel_scraper: reached cap {max_results}")
            break

    videos = list(videos_by_id.values())
    elapsed = round((datetime.now() - start).total_seconds(), 2)

    if not channel_info:
        channel_info = {"id": "", "name": "", "url": url,
                        "subscribers": None, "video_count": len(videos)}
    channel_info["video_count"] = len(videos)

    success = len(videos) > 0
    _log(f"channel_scraper: done — {len(videos)} videos in {elapsed}s")

    return {
        "success": success,
        "channel": channel_info,
        "videos": videos,
        "total_collected": len(videos),
        "elapsed_seconds": elapsed,
        "error": None if success else "No videos found — check channel URL",
    }


def export_to_csv(videos: list, channel_name: str = "channel") -> str:
    if not videos:
        return ""
    import csv, io
    buf = io.StringIO()
    fields = ["video_id", "title", "url", "duration_formatted", "views",
              "upload_date", "channel", "match_type", "is_short", "is_live"]
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    w.writerows(videos)
    return buf.getvalue()


def export_to_json(result: dict) -> str:
    return json.dumps(result, indent=2, default=str)
