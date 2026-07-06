"""
Advanced Query Variants Generator for Audio Matching.

Generates 10–20 variations of song/artist queries to maximize YouTube search coverage.

Transformations:
  - original query
  - reversed (song artist / artist song)
  - Arabic normalization (ة→ه, أ/إ/آ→ا, remove diacritics)
  - keyword augmentation (official, audio, lyrics, video clip)
  - punctuation removal
  - deduplicated output

No dependencies on external APIs or file I/O.
"""

import logging
import re
from typing import Optional

logger = logging.getLogger("tools.variants")

# Normalized search keywords to enhance matches
KEYWORDS = [
    "",                # original
    "official",        # "Artist - Song Official"
    "audio",          # "Artist - Song Audio"
    "lyrics",         # "Artist - Song Lyrics"
    "video clip",     # "Artist - Song Video Clip"
]

# Arabic character normalization map
ARABIC_NORMALIZE = {
    'ة': 'ه',  # teh marbuta → heh
    'أ': 'ا',  # alef with hamza above → alef
    'إ': 'ا',  # alef with hamza below → alef
    'آ': 'ا',  # alef with madda above → alef
}


def _normalize_arabic(text: str) -> str:
    """Normalize Arabic characters for better matching."""
    for old, new in ARABIC_NORMALIZE.items():
        text = text.replace(old, new)
    # Remove diacritical marks
    text = re.sub(r'[\u064B-\u0652]', '', text)  # remove Arabic diacritics
    return text


def _remove_punctuation(text: str) -> str:
    """Remove punctuation but keep Arabic/English alphanumerics and spaces."""
    return re.sub(r'[^\w\s\u0600-\u06FF]', '', text).strip()


def _remove_parentheticals(text: str) -> str:
    """Remove content in parentheses and brackets."""
    return re.sub(r'\s*[\(\[].+?[\)\]]', '', text).strip()


def generate_variants(song: str, artist: str) -> list[str]:
    """Generate 10-20 query variants for a song and artist.

    Args:
        song: Song title
        artist: Artist name

    Returns:
        List of 10-20 unique query variants
    """
    if not song or not artist:
        return []

    song = song.strip()
    artist = artist.strip()
    variants = set()

    # 1. Original format: "artist - song"
    base_query = f"{artist} - {song}"
    variants.add(base_query)

    # 2. Reverse format: "song artist" (without dash)
    variants.add(f"{song} {artist}")

    # 3. Arabic normalized variants
    song_ar = _normalize_arabic(song)
    artist_ar = _normalize_arabic(artist)
    if song_ar != song or artist_ar != artist:
        variants.add(f"{artist_ar} - {song_ar}")
        variants.add(f"{song_ar} {artist_ar}")

    # 4. Without punctuation
    song_clean = _remove_punctuation(song)
    artist_clean = _remove_punctuation(artist)
    if song_clean and artist_clean:
        if song_clean != song or artist_clean != artist:
            variants.add(f"{artist_clean} - {song_clean}")
            variants.add(f"{song_clean} {artist_clean}")

    # 5. Without parentheticals
    song_no_paren = _remove_parentheticals(song)
    artist_no_paren = _remove_parentheticals(artist)
    if song_no_paren and artist_no_paren:
        if song_no_paren != song or artist_no_paren != artist:
            variants.add(f"{artist_no_paren} - {song_no_paren}")

    # 6. Keyword augmentation (adds 5 more variants)
    for keyword in KEYWORDS:
        if keyword:
            variants.add(f"{base_query} {keyword}")
            variants.add(f"{song} {artist} {keyword}")

    # 7. Artist only (catch cases where song is embedded)
    variants.add(artist)

    # 8. Song + artist (simple format)
    variants.add(f"{song} {artist}")

    # Remove empty strings and limit to ~20
    variants = [v.strip() for v in variants if v.strip()]
    variants = list(dict.fromkeys(variants))[:20]  # deduplicate, limit to 20

    logger.info(f"variants: generated {len(variants)} variants for '{artist} - {song}'")
    return variants


def generate_single_variant(text: str) -> list[str]:
    """Generate variants for a single text field (artist or song alone).
    
    Args:
        text: Text to create variants from
        
    Returns:
        List of variants
    """
    if not text:
        return []
    
    text = text.strip()
    variants = set()
    
    variants.add(text)
    
    # Arabic normalized
    text_ar = _normalize_arabic(text)
    if text_ar != text:
        variants.add(text_ar)
    
    # Without punctuation
    text_clean = _remove_punctuation(text)
    if text_clean and text_clean != text:
        variants.add(text_clean)
    
    # Without parentheticals
    text_no_paren = _remove_parentheticals(text)
    if text_no_paren and text_no_paren != text:
        variants.add(text_no_paren)
    
    variants = [v.strip() for v in variants if v.strip()]
    return list(dict.fromkeys(variants))[:10]
