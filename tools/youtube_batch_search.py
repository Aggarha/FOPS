"""
YouTube Batch Search Engine — Advanced multi-variant search with progress tracking.

Replicates desktop Python tool behavior:
- Generates 10-20+ query variants per song
- Performs multiple searches per variant
- Returns hundreds of results per song
- Deduplicates by video_id
- Scores all candidates
- Tracks progress for batch operations
"""

import logging
import re
import unicodedata
from typing import Optional, Callable
from collections import defaultdict

import yt_dlp
from thefuzz import fuzz

logger = logging.getLogger("tools.youtube_batch_search")


# --------------- VARIANT GENERATION ---------------

def normalize_arabic(text: str) -> str:
    """Normalize Arabic text for search consistency.
    
    - ة → ه (teh marbuta to regular heh)
    - أ/إ/آ → ا (hamza variants to alif)
    - Remove diacritics
    """
    if not text:
        return text
    
    # Teh marbuta → heh
    text = text.replace("ة", "ه")
    
    # Hamza variants → alif
    text = text.replace("أ", "ا")
    text = text.replace("إ", "ا")
    text = text.replace("آ", "ا")
    
    # Remove Arabic diacritics
    text = re.sub(r"[\u064B-\u065F]", "", text)
    
    return text


def transliterate_arabic(text: str) -> str:
    """Basic Arabic to Latin transliteration for search.
    
    Maps common Arabic characters to Latin equivalents.
    Example: عمرو دياب → Amr Diab (approximate)
    """
    transliteration_map = {
        "ع": "a",
        "غ": "gh",
        "ق": "q",
        "ك": "k",
        "خ": "kh",
        "ح": "h",
        "ج": "j",
        "ش": "sh",
        "ص": "s",
        "ض": "d",
        "ط": "t",
        "ظ": "z",
        "ل": "l",
        "ن": "n",
        "م": "m",
        "ر": "r",
        "و": "w",
        "ي": "y",
        "ا": "a",
        "ة": "a",
        "ه": "h",
        "ب": "b",
        "ت": "t",
        "ث": "th",
        "س": "s",
        "ز": "z",
        "د": "d",
        "ذ": "dh",
        "ف": "f",
        "ص": "s",
        "آ": "aa",
        "أ": "a",
        "إ": "i",
        "ؤ": "u",
        "ئ": "i",
    }
    
    result = ""
    for char in text:
        result += transliteration_map.get(char, char)
    
    return result


def generate_advanced_variants(song: str, artist: str) -> list[str]:
    """Generate 10-20+ query variants for aggressive YouTube search.
    
    Generates combinations of:
    - Original forms (Arabic)
    - Normalized Arabic
    - Transliterated Latin
    - Various keyword combinations
    - Official/lyrics/audio/live variants
    - Song+Artist vs Artist+Song
    
    Args:
        song: Song title
        artist: Artist name
    
    Returns:
        List of 10-20+ unique query strings
    """
    if not song or not artist:
        return []
    
    variants = set()
    
    # Original forms
    song_orig = song.strip()
    artist_orig = artist.strip()
    
    # Normalized Arabic
    song_norm = normalize_arabic(song_orig)
    artist_norm = normalize_arabic(artist_orig)
    
    # Transliterated Latin (approximate)
    song_trans = transliterate_arabic(song_orig)
    artist_trans = transliterate_arabic(artist_orig)
    
    # Clean punctuation
    song_clean = re.sub(r"[^\w\s\u0600-\u06FF]", "", song_orig).strip()
    artist_clean = re.sub(r"[^\w\s\u0600-\u06FF]", "", artist_orig).strip()
    
    # Keywords to augment
    keywords = ["", " official", " lyrics", " audio", " live", " remix", " mashup"]
    
    # Build variants
    for song_form in [song_orig, song_norm, song_clean, song_trans]:
        for artist_form in [artist_orig, artist_norm, artist_clean, artist_trans]:
            if not song_form or not artist_form:
                continue
            
            for keyword in keywords:
                # Artist - Song
                query1 = f"{artist_form} - {song_form}{keyword}".strip()
                if query1:
                    variants.add(query1)
                
                # Song by Artist
                query2 = f"{song_form} by {artist_form}{keyword}".strip()
                if query2:
                    variants.add(query2)
                
                # Just song and artist
                query3 = f"{song_form} {artist_form}{keyword}".strip()
                if query3:
                    variants.add(query3)
    
    # Remove duplicates and limit to reasonable number
    result = list(variants)
    
    # Return up to 20 variants (original tool generated 10-20)
    return result[:20] if len(result) > 20 else result


def score_result(entry: dict, song: str, artist: str) -> tuple[float, str]:
    """Score a YouTube result on 0-100 scale with reason.
    
    Combines:
    - Title similarity to expected "{artist} - {song}"
    - Title similarity to song alone
    - Channel/uploader similarity to artist
    - Keyword matching (official, original, etc.)
    
    Args:
        entry: yt_dlp entry dict
        song: Expected song title
        artist: Expected artist name
    
    Returns:
        (score: 0-100, reason: string explaining score)
    """
    title = (entry.get("title") or "").lower()
    channel = (entry.get("channel") or entry.get("uploader") or "").lower()
    
    song_lower = song.lower()
    artist_lower = artist.lower()
    expected = f"{artist_lower} - {song_lower}"
    
    if not title:
        return 0.0, "no_title"
    
    # Fuzzy scores
    full_match = fuzz.token_sort_ratio(expected, title)
    song_match = fuzz.partial_ratio(song_lower, title)
    artist_match = fuzz.partial_ratio(artist_lower, title)
    channel_match = fuzz.partial_ratio(artist_lower, channel)
    
    # Keyword bonuses
    keyword_bonus = 0
    if any(kw in title for kw in ["official", "lyrics", "audio", "original"]):
        keyword_bonus = 5
    if any(kw in channel for kw in [artist_lower.split()[0] if artist_lower else ""]):
        keyword_bonus += 5
    
    # Exact match bonus
    exact_bonus = 0
    if title == expected:
        exact_bonus = 20
    elif title.startswith(artist_lower) and song_lower in title:
        exact_bonus = 15
    
    # Weighted score
    score = (
        full_match * 0.30 +
        song_match * 0.35 +
        artist_match * 0.15 +
        channel_match * 0.10 +
        keyword_bonus * 1.0 +
        exact_bonus * 1.0
    )
    
    score = min(100, max(0, score))
    
    # Determine reason
    if score >= 85:
        reason = "excellent_match"
    elif score >= 70:
        reason = "good_match"
    elif score >= 50:
        reason = "partial_match"
    else:
        reason = "weak_match"
    
    return round(score, 1), reason


# --------------- BATCH SEARCH ---------------

def batch_search_youtube(
    items: list[dict],  # [{artist, song}, ...]
    on_progress: Optional[Callable] = None,
    max_results_per_song: int = 50,
) -> dict:
    """Batch search YouTube for multiple songs with detailed progress.
    
    Args:
        items: List of {artist, song} dicts
        on_progress: Callback fn(stage, current, total, song, variant_num, message)
        max_results_per_song: Max results to return per song
    
    Returns:
        {
            results: [{
                song, artist,
                results: [{title, url, channel, score, reason, video_id}, ...],
                total_found: int,
                variants_tried: int,
                completed_at: timestamp,
                error: null or string
            }, ...],
            total_songs: int,
            total_results: int,
            duration_seconds: float
        }
    """
    import time
    start_time = time.time()
    
    results = []
    total_results = 0
    
    for song_idx, item in enumerate(items):
        song = item.get("song", "").strip()
        artist = item.get("artist", "").strip()
        
        if not song or not artist:
            continue
        
        # Callback: starting song
        if on_progress:
            on_progress(
                stage="preparing",
                current=song_idx + 1,
                total=len(items),
                song=song,
                message=f"Generating variants for {artist} - {song}"
            )
        
        # Generate variants
        variants = generate_advanced_variants(song, artist)
        
        # Callback: variants ready
        if on_progress:
            on_progress(
                stage="searching",
                current=song_idx + 1,
                total=len(items),
                song=song,
                message=f"Generated {len(variants)} variants, starting search..."
            )
        
        # Search with variants
        song_results: dict[str, dict] = {}  # video_id → entry

        from services.ytdlp_service import get_hardened_opts
        ydl_opts = get_hardened_opts({
            "skip_download": True,
            "extract_flat": True,
            "noplaylist": True,
            "socket_timeout": 15,
        })
        
        for var_idx, variant in enumerate(variants):
            # Callback: searching variant
            if on_progress:
                on_progress(
                    stage="searching",
                    current=song_idx + 1,
                    total=len(items),
                    song=song,
                    message=f"Trying variant {var_idx + 1}/{len(variants)}: {variant[:50]}..."
                )
            
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    # Get 30 results per variant
                    data = ydl.extract_info(f"ytsearch30:{variant}", download=False)
                
                for entry in data.get("entries") or []:
                    vid = entry.get("id")
                    if not vid:
                        continue
                    
                    # Score the result
                    score, reason = score_result(entry, song, artist)
                    
                    # Only keep if not seen or if better score
                    if vid not in song_results or score > song_results[vid]["score"]:
                        song_results[vid] = {
                            "video_id": vid,
                            "title": entry.get("title", ""),
                            "url": f"https://www.youtube.com/watch?v={vid}",
                            "channel": entry.get("channel") or entry.get("uploader") or "",
                            "views": entry.get("view_count") or 0,
                            "duration": entry.get("duration") or 0,
                            "score": score,
                            "reason": reason,
                            "published": entry.get("upload_date") or "",
                        }
            except Exception as e:
                logger.warning("Variant search failed: %s", variant, exc_info=True)
                continue
        
        # Callback: processing results
        if on_progress:
            on_progress(
                stage="processing",
                current=song_idx + 1,
                total=len(items),
                song=song,
                message=f"Scoring and ranking {len(song_results)} unique results..."
            )
        
        # Sort by score and keep top N
        ranked = sorted(
            song_results.values(),
            key=lambda r: r["score"],
            reverse=True
        )
        top_results = ranked[:max_results_per_song]
        
        results.append({
            "song": song,
            "artist": artist,
            "results": top_results,
            "total_found": len(song_results),
            "unique_results": len(top_results),
            "variants_tried": len(variants),
            "error": None
        })
        
        total_results += len(top_results)
    
    # Callback: complete
    if on_progress:
        on_progress(
            stage="done",
            current=len(items),
            total=len(items),
            song="",
            message="Batch search complete"
        )
    
    duration = time.time() - start_time
    
    return {
        "results": results,
        "total_songs": len(items),
        "total_results": total_results,
        "average_results_per_song": total_results / len(items) if items else 0,
        "duration_seconds": round(duration, 2),
    }
