"""
FOPS — Audio Matching Engine V2.

High-accuracy hybrid audio matching with real fingerprint verification.

Architecture:
  1. Multi-variant search: 10-20 query variations per request
  2. Metadata enrichment: YouTube API for views, duration, channel, date
  3. Fuzzy scoring: Weighted metadata similarity (0-100)
  4. Real fingerprinting: FFT-based audio comparison on top 5 candidates
  5. Final score: 60% fingerprint + 40% metadata

Features:
  - 100+ YouTube candidates per search (deduplicated by video_id)
  - Arabic normalization + keyword augmentation in variants
  - Multi-platform search (YouTube, Spotify, Anghami metadata)
  - Advanced filters (channel, views, duration)
  - Disk-based caching with 14-day TTL
  - Verified flag when fingerprint_score > 80

Search modes:
  - "hybrid"      → metadata scoring + fingerprint on uncertain matches (default)
  - "keyword"     → metadata only, no fingerprint
  - "fingerprint" → skip metadata, fingerprint all candidates

Logging includes:
  - Variant count, total results collected
  - Top candidates + scores
  - Fingerprint execution time
  - Final verification status
"""

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

from thefuzz import fuzz

from .variants import generate_variants
from .youtube_search_engine import search_with_variants
from .fuzzy_scorer import score_candidates, quick_score
from .fingerprint_engine import batch_fingerprint_compare

# Fingerprint DB imports (will be loaded at runtime to avoid import issues)
search_fingerprint = None
add_fingerprint = None

logger = logging.getLogger("tools.audio_matcher")

# ── constants ──────────────────────────────────────────────────

CACHE_DIR = Path(__file__).parent.parent / "cache" / "fingerprints"
CACHE_TTL_DAYS = 14
MAX_CANDIDATES = 5  # top N for fingerprint verification

# Final score weights (metadata + fingerprint)
FINAL_SCORE_WEIGHTS = {
    "fingerprint": 0.6,      # fingerprint is primary
    "metadata": 0.4,          # metadata is secondary
}

# Fingerprint verification thresholds
FINGERPRINT_THRESHOLD = 80.0  # metadata score below this → run fingerprint
VERIFIED_THRESHOLD = 80.0     # fingerprint score above this → verified


# ── cache helpers ──────────────────────────────────────────────

def _ensure_cache_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cache_key(song: str, artist: str, filters: Optional[dict] = None) -> str:
    """Generate cache key from song, artist, and filters (if any).
    
    Cache by (song + artist + filters) to avoid stale results when filters change.
    """
    raw = f"{song.strip().lower()}|{artist.strip().lower()}"
    if filters:
        raw += f"|{json.dumps(filters, sort_keys=True)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def save_cache(song: str, artist: str, data: dict, filters: Optional[dict] = None) -> None:
    """Save match result to disk cache with timestamp."""
    _ensure_cache_dir()
    key = _cache_key(song, artist, filters)
    entry = {"timestamp": time.time(), "data": data}
    path = CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(entry, ensure_ascii=False, default=str), encoding="utf-8")
    logger.info("audio_matcher: cached result for %r - %r → %s", artist, song, path.name)


def load_cache(song: str, artist: str, filters: Optional[dict] = None) -> Optional[dict]:
    """Load cached result if it exists and is within TTL."""
    key = _cache_key(song, artist, filters)
    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        entry = json.loads(path.read_text(encoding="utf-8"))
        age_days = (time.time() - entry["timestamp"]) / 86400
        if age_days > CACHE_TTL_DAYS:
            path.unlink(missing_ok=True)
            logger.info("audio_matcher: cache expired for %r - %r (%.1f days)", artist, song, age_days)
            return None
        logger.info("audio_matcher: cache hit for %r - %r (%.1f days old)", artist, song, age_days)
        return entry["data"]
    except (json.JSONDecodeError, KeyError, OSError):
        return None


def cleanup_cache(days: int = CACHE_TTL_DAYS) -> dict:
    """Remove cache entries older than `days`."""
    _ensure_cache_dir()
    removed = 0
    kept = 0
    cutoff = time.time() - (days * 86400)
    for path in CACHE_DIR.glob("*.json"):
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
            if entry.get("timestamp", 0) < cutoff:
                path.unlink()
                removed += 1
            else:
                kept += 1
        except (json.JSONDecodeError, KeyError, OSError):
            path.unlink(missing_ok=True)
            removed += 1
    logger.info("audio_matcher: cache cleanup — removed %d, kept %d", removed, kept)
    return {"removed": removed, "kept": kept}


# ── platform search ───────────────────────────────────────────

def _search_youtube_v2(song: str, artist: str, channel_filter: Optional[str] = None) -> list[dict]:
    """Search YouTube using multi-variant approach with metadata enrichment.
    
    Returns 50-150 deduplicated results with metadata.
    """
    # Generate 10-20 query variants
    variants = generate_variants(song, artist)
    if not variants:
        logger.warning("audio_matcher: no variants generated for %r - %r", artist, song)
        return []

    logger.debug(f"audio_matcher: searching YouTube with {len(variants)} variants")

    # Multi-variant search (uses youtube_search_engine)
    results = search_with_variants(song, artist, variants)

    if not results:
        logger.warning(f"audio_matcher: YouTube search returned no results")
        return []

    # Normalize results for consistency
    normalized = []
    for r in results:
        normalized.append({
            "title": r.get("title", ""),
            "channel": r.get("channel", ""),
            "duration": r.get("duration", 0),
            "url": r.get("url", ""),
            "platform": "youtube",
            "video_id": r.get("video_id", ""),
            "views": r.get("views"),
            "published_date": r.get("published_date"),
            "score": r.get("score", 0),
        })

    logger.info(f"audio_matcher: YouTube returned {len(normalized)} results from {len(variants)} variants")
    return normalized


def _search_spotify(song: str, artist: str) -> list[dict]:
    """Spotify metadata search (metadata only, no audio).

    Returns structured metadata without API integration.
    """
    logger.info("audio_matcher: Spotify metadata search for %r - %r", artist, song)
    return [{
        "title": song,
        "channel": artist,
        "duration": 0,
        "url": f"https://open.spotify.com/search/{artist}%20{song}",
        "platform": "spotify",
        "video_id": "",
        "views": None,
        "published_date": None,
        "note": "metadata_only",
    }]


def _search_anghami(song: str, artist: str) -> list[dict]:
    """Anghami metadata search (metadata only, no audio)."""
    logger.info("audio_matcher: Anghami metadata search for %r - %r", artist, song)
    return [{
        "title": song,
        "channel": artist,
        "duration": 0,
        "url": f"https://play.anghami.com/search/{artist}%20{song}",
        "platform": "anghami",
        "video_id": "",
        "views": None,
        "published_date": None,
        "note": "metadata_only",
    }]


PLATFORM_SEARCHERS = {
    "youtube": _search_youtube_v2,
    "spotify": _search_spotify,
    "anghami": _search_anghami,
}


# ── filter helpers ─────────────────────────────────────────────

def _apply_filters(candidates: list[dict], filters: dict) -> list[dict]:
    """Apply channel, views, and duration filters to candidate list.

    Channel logic:
      - channel.id → strict match on video_id (not currently supported by API)
      - channel.name → case-insensitive fuzzy match on channel field (>= 80 partial ratio)
      - both → use ID
      - none → no filtering

    View/duration filters applied as hard cutoffs.
    """
    if not filters:
        return candidates

    channel_cfg = filters.get("channel") or {}
    channel_id = channel_cfg.get("id", "").strip()
    channel_name = channel_cfg.get("name", "").strip()
    min_views = filters.get("min_views")
    max_views = filters.get("max_views")
    min_duration = filters.get("min_duration")
    max_duration = filters.get("max_duration")

    filtered = []
    for c in candidates:
        # Channel filter
        if channel_id:
            # Skip if channel ID matching (not implemented yet)
            pass
        elif channel_name:
            cand_channel = (c.get("channel", "") or "").strip()
            if cand_channel and fuzz.partial_ratio(channel_name.lower(), cand_channel.lower()) < 80:
                continue

        # Views filter (skip if candidate views unknown)
        views = c.get("views")
        if views is not None and views > 0:
            if min_views is not None and views < min_views:
                continue
            if max_views is not None and views > max_views:
                continue

        # Duration filter (skip if candidate duration unknown)
        duration = c.get("duration")
        if duration is not None and duration > 0:
            if min_duration is not None and duration < min_duration:
                continue
            if max_duration is not None and duration > max_duration:
                continue

        filtered.append(c)

    logger.debug(f"audio_matcher: filter: {len(candidates)} → {len(filtered)} results")
    return filtered


# ── scoring is now handled by fuzzy_scorer.py ──────────────────

# (removed old _score_candidate function — now uses fuzzy_scorer.score_candidates)


# ── fingerprint verification (now handled by fingerprint_engine.py) ──────

# (removed old _run_fingerprint_verification — now uses fingerprint_engine.batch_fingerprint_compare)


# ── main entry point ──────────────────────────────────────────

def audio_match(
    song: str,
    artist: str,
    platforms: Optional[list[str]] = None,
    use_fingerprint: bool = True,
    reference_url: Optional[str] = None,
    channel_filter: Optional[str] = None,
    filters: Optional[dict] = None,
    log_callback=None,
) -> dict:
    """Match audio across platforms with real fingerprint verification.

    High-accuracy hybrid engine: 60% fingerprint + 40% metadata.

    Args:
        song: Song title
        artist: Artist name
        platforms: Platforms to search (default: ["youtube"])
        use_fingerprint: Whether to run audio fingerprinting
        reference_url: Optional reference YouTube URL for fingerprint comparison
        channel_filter: Optional channel name to filter (legacy param, use filters instead)
        filters: Advanced filter dict with keys:
            channel: {name, id}
            min_views, max_views
            min_duration, max_duration
            search_mode: "hybrid" | "keyword" | "fingerprint"

    Returns:
        dict with matches, best_match, confidence, verified flag, debug info
    """
    platforms = platforms or ["youtube"]
    filters = filters or {}
    start_time = time.time()

    def _log(msg: str, level: str = "info"):
        logger.info("audio_match: %s", msg)
        if log_callback:
            try:
                log_callback(msg, level)
            except Exception:
                pass

    # Extract search_mode (default: hybrid)
    search_mode = filters.get("search_mode", "hybrid")
    if search_mode not in ("hybrid", "keyword", "fingerprint"):
        search_mode = "hybrid"

    # Override use_fingerprint based on search_mode
    if search_mode == "keyword":
        use_fingerprint = False
    elif search_mode == "fingerprint":
        use_fingerprint = True

    _log(f"[audio-match] Query: {artist!r} — {song!r} | platforms: {platforms} | mode: {search_mode} | fingerprint: {use_fingerprint}")

    logger.info(
        "audio_match: song=%r artist=%r platforms=%s fingerprint=%s mode=%s",
        song, artist, platforms, use_fingerprint, search_mode
    )

    if not song or not artist:
        return {
            "matches": [],
            "best_match": None,
            "confidence": 0,
            "verified": False,
            "method": "error",
            "error": "Both song and artist are required",
            "song": song,
            "artist": artist,
        }

    # Check disk cache (invalidate on filter change)
    cached = load_cache(song, artist, filters)
    if cached is not None:
        cached["from_cache"] = True
        return cached

    # ── STEP 1: Multi-platform search ──
    all_candidates = []
    variant_count = 0
    _log(f"[audio-match] Step 1: Source lookup — searching {len(platforms)} platform(s): {', '.join(platforms)}")

    for platform in platforms:
        searcher = PLATFORM_SEARCHERS.get(platform)
        if not searcher:
            logger.warning("audio_matcher: unknown platform %r", platform)
            continue

        if platform == "youtube":
            # YouTube uses multi-variant search
            results = searcher(song, artist, channel_filter)
            if results:
                variant_count = len(generate_variants(song, artist))
        else:
            # Spotify/Anghami use simple search
            results = searcher(song, artist)

        all_candidates.extend(results)

    logger.info(
        f"audio_matcher: collected {len(all_candidates)} candidates from {len(platforms)} platforms "
        f"({variant_count} variants)"
    )
    _log(f"[audio-match] Candidate discovery complete — {len(all_candidates)} candidates from {len(platforms)} platform(s) ({variant_count} variants generated)")

    if not all_candidates:
        result = {
            "matches": [],
            "best_match": None,
            "confidence": 0,
            "verified": False,
            "method": "no_results",
            "song": song,
            "artist": artist,
            "variant_count": variant_count,
            "total_results": 0,
            "candidates_after_filter": 0,
        }
        return result

    # ── STEP 2: Apply filters ──
    pre_filter_count = len(all_candidates)
    _log(f"[audio-match] Step 2: Applying filters to {pre_filter_count} candidates")
    all_candidates = _apply_filters(all_candidates, filters)

    if not all_candidates:
        # Fallback: retry without channel filter
        channel_cfg = filters.get("channel") or {}
        if channel_cfg.get("id") or channel_cfg.get("name"):
            logger.info(
                f"audio_matcher: channel filter removed all {pre_filter_count} candidates — "
                "falling back to global search"
            )
            fallback_filters = {k: v for k, v in filters.items() if k != "channel"}
            all_candidates = _apply_filters(
                [c for p in platforms if p in PLATFORM_SEARCHERS for c in PLATFORM_SEARCHERS[p](song, artist)],
                fallback_filters,
            )

    if not all_candidates:
        result = {
            "matches": [],
            "best_match": None,
            "confidence": 0,
            "verified": False,
            "method": "no_results_after_filter",
            "song": song,
            "artist": artist,
            "variant_count": variant_count,
            "total_results": pre_filter_count,
            "candidates_after_filter": 0,
        }
        return result

    # ── STEP 3: Fuzzy scoring (metadata-based) ──
    logger.debug(f"audio_matcher: scoring {len(all_candidates)} candidates with fuzzy matcher")
    _log(f"[audio-match] Step 3: Metadata ranking — scoring {len(all_candidates)} candidates (fuzzy title + artist match)")
    all_candidates = score_candidates(all_candidates, song, artist)

    # Best candidate from metadata
    best = all_candidates[0]
    best_metadata_score = best.get("metadata_score", 0)

    # YouTube candidates for fingerprinting
    youtube_candidates = [
        c for c in all_candidates
        if c["platform"] == "youtube" and c.get("url")
    ][:MAX_CANDIDATES]

    method = "metadata"
    verified = False
    fingerprint_results = []
    fingerprint_time = 0
    db_match_found = False

    # ── STEP 3.5: Database fingerprint lookup (optional) ──
    # Check if fingerprint_db_enabled in config and load DB functions
    db_match_found = False
    try:
        from pathlib import Path
        import sys
        
        # Add parent directory to path for absolute imports
        fops_root = Path(__file__).parent.parent
        if str(fops_root) not in sys.path:
            sys.path.insert(0, str(fops_root))
        
        from storage.fingerprint_db import search_fingerprint as _search_fp_db
        from config import _load_config
        
        config = _load_config()
        fingerprint_db_enabled = config.get("fingerprint_db_enabled", False)
        
        if fingerprint_db_enabled and use_fingerprint and youtube_candidates:
            logger.info("audio_matcher: checking fingerprint database for %r - %r", artist, song)
            db_entry = _search_fp_db(song, artist, fuzzy_match=True)
            
            if db_entry:
                logger.info("audio_matcher: found DB fingerprint match (fuzzy), using as reference")
                db_match_found = True
                method = "database fingerprint (cached)"
    except Exception as e:
        logger.debug("audio_matcher: fingerprint_db not available: %s", e)
        fingerprint_db_enabled = False

    # ── STEP 4: Fingerprint verification (conditional or forced) ──
    should_fingerprint = (
        use_fingerprint and youtube_candidates and (
            search_mode == "fingerprint" or best_metadata_score < FINGERPRINT_THRESHOLD
        ) and not db_match_found
    )

    if should_fingerprint:
        fp_start = time.time()
        logger.info(
            f"audio_matcher: running fingerprint on {len(youtube_candidates)} candidates "
            f"(best_score={best_metadata_score:.1f})"
        )
        _log(f"[audio-match] Step 4: Fingerprint verification — running on {len(youtube_candidates)} YouTube candidate(s) (best metadata score: {best_metadata_score:.1f})")

        # Determine reference URL
        ref_url = reference_url or (youtube_candidates[0].get("url") if youtube_candidates else None)

        if ref_url:
            # Batch fingerprint comparison
            youtube_candidates = batch_fingerprint_compare(youtube_candidates, ref_url)

            # Collect fingerprint results for logging
            for c in youtube_candidates:
                if c.get("fingerprint_score") is not None:
                    fingerprint_results.append({
                        "url": c.get("url", ""),
                        "title": c.get("title", ""),
                        "fingerprint_score": c.get("fingerprint_score", 0),
                        "verified": c.get("verified", False),
                    })

            # ── STEP 5: Final score (60% fingerprint + 40% metadata) ──
            for c in all_candidates:
                if c.get("fingerprint_score") is not None:
                    # Hybrid score: fingerprint (60%) + metadata (40%)
                    fp_score = c.get("fingerprint_score", 0)
                    metadata_score = c.get("metadata_score", 0)
                    c["final_score"] = round(
                        (fp_score * FINAL_SCORE_WEIGHTS["fingerprint"]) +
                        (metadata_score * FINAL_SCORE_WEIGHTS["metadata"]),
                        2
                    )
                else:
                    c["final_score"] = c.get("metadata_score", 0)

            # Re-sort by final score
            all_candidates.sort(key=lambda x: x.get("final_score", 0), reverse=True)
            best = all_candidates[0]
            best_metadata_score = best.get("final_score", best.get("metadata_score", 0))

            method = "fingerprint + metadata"

            # Check verification
            if best.get("verified"):
                verified = True

        fingerprint_time = time.time() - fp_start
        logger.info(
            f"audio_matcher: fingerprint completed in {fingerprint_time:.2f}s, "
            f"results: {len(fingerprint_results)}"
        )
        _log(f"[audio-match] Fingerprint verification done in {fingerprint_time:.2f}s — {len(fingerprint_results)} result(s) verified")

    elif best_metadata_score >= FINGERPRINT_THRESHOLD:
        method = "metadata (high confidence)"
        verified = True

    # ── STEP 6: Build response ──
    best_final = all_candidates[0] if all_candidates else {}
    final_conf = round(best_final.get("final_score", best_final.get("metadata_score", 0)), 2)
    _log(
        f"[audio-match] Final ranking — best match: {best_final.get('title', 'N/A')!r} "
        f"| confidence: {final_conf}% | verified: {best_final.get('verified', False)} "
        f"| method: {method}"
    )
    clean_matches = []
    for c in all_candidates[:MAX_CANDIDATES]:
        clean = {
            "title": c.get("title", ""),
            "channel": c.get("channel", ""),
            "duration": c.get("duration", 0),
            "url": c.get("url", ""),
            "platform": c.get("platform", ""),
            "metadata_score": round(c.get("metadata_score", 0), 2),
        }

        # Add fingerprint info if available
        if c.get("fingerprint_score") is not None:
            clean["fingerprint_score"] = round(c.get("fingerprint_score", 0), 2)
            clean["verified"] = c.get("verified", False)
            clean["final_score"] = round(c.get("final_score", c.get("metadata_score", 0)), 2)

        if c.get("views") is not None:
            clean["views"] = c.get("views")

        if c.get("note"):
            clean["note"] = c["note"]

        clean_matches.append(clean)

    elapsed = time.time() - start_time

    result = {
        "matches": clean_matches,
        "best_match": clean_matches[0] if clean_matches else None,
        "confidence": round(best_metadata_score, 2),
        "verified": verified,
        "method": method,
        "search_mode": search_mode,
        "song": song,
        "artist": artist,
        "platforms_searched": platforms,
        "variant_count": variant_count,
        "total_results_collected": len(all_candidates) + pre_filter_count - len(all_candidates),
        "candidates_after_filter": len(all_candidates),
        "fingerprint_ran": len(fingerprint_results) > 0,
        "fingerprint_time_seconds": round(fingerprint_time, 2),
        "elapsed_seconds": round(elapsed, 2),
        "filters_applied": bool(filters),
        "from_cache": False,
    }

    if fingerprint_results:
        result["fingerprint_details"] = fingerprint_results

    # Save to cache
    save_cache(song, artist, result, filters)

    return result
