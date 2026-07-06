"""
YouTube Advanced Search — Pure function tool.

Generates query variants, searches YouTube, applies fuzzy matching,
ranks results, and returns the top candidates.
No GUI, no threading, no file I/O — API-ready.
"""

import logging
import re
from typing import Optional

import yt_dlp
from thefuzz import fuzz

logger = logging.getLogger("tools.youtube_advanced")

# --------------- Variant Generation ---------------


def generate_variants(text: str) -> list[str]:
    """Generate search query variants from a text string.

    Produces multiple forms to increase YouTube search coverage:
    - original
    - without parenthetical content
    - without punctuation
    - transliteration-style cleaning

    Args:
        text: Base text to create variants from.

    Returns:
        Deduplicated list of variant strings.
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    variants = [text]

    # Without parenthetical content
    no_parens = re.sub(r"\s*[\(\[].+?[\)\]]", "", text).strip()
    if no_parens and no_parens != text:
        variants.append(no_parens)

    # Without special punctuation
    no_punct = re.sub(r"[^\w\s\u0600-\u06FF]", "", text).strip()
    if no_punct and no_punct not in variants:
        variants.append(no_punct)

    # Collapsed whitespace
    collapsed = re.sub(r"\s+", " ", text).strip()
    if collapsed not in variants:
        variants.append(collapsed)

    # Lowercase variant
    lower = text.lower()
    if lower not in variants:
        variants.append(lower)

    return variants


# --------------- Fuzzy Scoring ---------------


def _score_result(entry: dict, song: str, artist: str) -> float:
    """Compute a 0–100 relevance score for a YouTube result.

    Combines title similarity to expected "{artist} - {song}" with
    channel-name matching.
    """
    title = (entry.get("title") or "").lower()
    channel = (entry.get("channel") or entry.get("uploader") or "").lower()

    expected = f"{artist} - {song}".lower()

    # Weighted fuzzy scores
    title_ratio = fuzz.token_sort_ratio(expected, title)
    partial_ratio = fuzz.partial_ratio(song.lower(), title)
    channel_ratio = fuzz.partial_ratio(artist.lower(), channel)

    score = (title_ratio * 0.45) + (partial_ratio * 0.35) + (channel_ratio * 0.20)
    return round(score, 2)


# --------------- Advanced Search ---------------


def search_youtube_advanced(
    song: str,
    artist: str,
    channel_filter: Optional[str] = None,
    max_results: int = 3,
) -> list[dict]:
    """Search YouTube using multiple query variants and fuzzy ranking.

    Args:
        song: Song title.
        artist: Artist name.
        channel_filter: If set, boost results from this channel.
        max_results: Number of top results to return (default 3).

    Returns:
        List of dicts sorted by score (descending), each containing:
        title, url, channel, score, video_id.
    """
    if not song or not artist:
        return []

    # Build query variants
    base_queries = []
    for song_v in generate_variants(song):
        for artist_v in generate_variants(artist)[:3]:  # limit artist variants
            base_queries.append(f"{artist_v} - {song_v}")
            base_queries.append(f"{artist_v} {song_v} official")

    # Deduplicate while preserving order
    seen = set()
    queries = []
    for q in base_queries:
        q_lower = q.lower()
        if q_lower not in seen:
            seen.add(q_lower)
            queries.append(q)

    # Cap total queries to stay fast
    queries = queries[:6]
    logger.info("youtube_advanced: %d query variants for %r – %r", len(queries), artist, song)

    from services.ytdlp_service import get_hardened_opts
    ydl_opts = get_hardened_opts({
        "skip_download": True,
        "extract_flat": True,
        "noplaylist": True,
        "socket_timeout": 15,
    })

    all_results: dict[str, dict] = {}  # video_id → best entry

    for query in queries:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                data = ydl.extract_info(f"ytsearch3:{query}", download=False)
            for entry in data.get("entries") or []:
                vid = entry.get("id", "")
                if not vid or vid in all_results:
                    continue

                score = _score_result(entry, song, artist)

                # Boost if channel matches filter
                if channel_filter:
                    ch = (entry.get("channel") or entry.get("uploader") or "").lower()
                    if fuzz.partial_ratio(channel_filter.lower(), ch) > 80:
                        score = min(100, score + 10)

                all_results[vid] = {
                    "video_id": vid,
                    "title": entry.get("title", ""),
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "channel": entry.get("channel", "") or entry.get("uploader", ""),
                    "score": score,
                }
        except Exception:
            logger.warning("youtube_advanced: query %r failed", query, exc_info=True)
            continue

    # Sort by score descending and return top N
    ranked = sorted(all_results.values(), key=lambda r: r["score"], reverse=True)
    top = ranked[:max_results]
    logger.info("youtube_advanced: returning %d results (best score: %s)", len(top), top[0]["score"] if top else "N/A")
    return top
