"""
YouTube Video Metadata Formatter — Pure backend tool.

Generates YouTube-ready title, description, tags, ISRC, and UPC
from release metadata. Extracted from the Rotana Video Formatter
desktop tool (YT-Description.py) with identical business logic.

No UI dependencies — pure Python functions + API-ready.
"""

import logging
from datetime import datetime

logger = logging.getLogger("tools.youtube_formatter")

# --------------- Column Mapping ---------------

EXCEL_COLUMN_MAP = {
    "Artist Name English": "artist_en",
    "Artist Name Arabic": "artist_ar",
    "Song Name English": "song_en",
    "Song Name Arabic": "song_ar",
    "Album Name English": "album_en",
    "Album Name Arabic": "album_ar",
    "Song Writer - English Name": "songwriter_en",
    "Song Writer - Arabic Name": "songwriter_ar",
    "Composer - English Name": "composer_en",
    "Composer - Arabic Name": "composer_ar",
    "Arrange - English Name": "arranger_en",
    "Arrange Arabic Name": "arranger_ar",
    "ISRC": "isrc",
    "UPC": "upc",
}

STANDARD_FIELDS = set(EXCEL_COLUMN_MAP.values())

# --------------- Channel Config ---------------

DEFAULT_CHANNEL_DESCRIPTIONS = {
    "عبدالمجيد عبدالله | Abdul Majeed Abdullah": (
        "\nاشترك الآن في قناة الفنان عبدالمجيد عبدالله للحصول على أجدد إصداراته الفنية\n"
        "http://goo.gl/ZMxIXH\n"
        "\n✶ Digital Distribution : @RotanaMusic\n"
        "\nFacebook: https://facebook.com/Abdulmajeed6531/\n"
        "Twitter: https://twitter.com/abdulmajeed6531\n"
        "Instagram: https://www.instagram.com/mjeedifans/\n"
        "iTunes: https://itun.es/sa/ZzT3\n"
        "Google +: https://goo.gl/S90f5L\n"
        "Youtube: http://bit.ly/2mpg1Cu"
    ),
}

DEFAULT_SUBSCRIBE_TEXT = (
    "\nاشترك على قناة روتانا | Subscribe To Rotana Channel\n"
    "https://bit.ly/2NjviPh\n"
)

SOCIAL_LINKS = (
    "\n✶ https://www.facebook.com/rotanamusic/\n"
    "✶ https://www.instagram.com/rotanamusic/\n"
    "✶ https://twitter.com/RotanaMusic\n"
)


# --------------- Helpers ---------------

def safe_get(data, key):
    """Safely retrieve a value from a dict, returning empty string for missing/None."""
    return data.get(key, "") if key in data and data.get(key) is not None else ""


def _normalize_row(raw: dict) -> dict:
    """Normalize raw row data (Excel column names or standard names) into standard format."""
    release = {}
    for key, value in raw.items():
        clean_key = key.strip() if isinstance(key, str) else key
        if clean_key in EXCEL_COLUMN_MAP:
            release[EXCEL_COLUMN_MAP[clean_key]] = str(value).strip() if value else ""
        elif clean_key in STANDARD_FIELDS:
            release[clean_key] = str(value).strip() if value else ""
    return release


def _clean_val(val: str) -> str:
    """Strip and reject 'nan' values."""
    if not val:
        return ""
    val = val.strip()
    return "" if val.lower() == "nan" else val


# --------------- Core Generators ---------------

def _generate_title(release: dict, video_type: str, year: int) -> str:
    """Generate YouTube video title.

    Concert:      {artist_en} - {song_en} | {album_en} | {artist_ar} - {song_ar}
    Lyrics Video: {artist_en} - {song_en} | Lyrics Video {year} | {artist_ar} - {song_ar}
    Music Video:  {artist_en} - {song_en} | Official Music Video {year} | {artist_ar} - {song_ar}
    """
    artist_en = _clean_val(safe_get(release, "artist_en"))
    artist_ar = _clean_val(safe_get(release, "artist_ar"))
    song_en = _clean_val(safe_get(release, "song_en"))
    song_ar = _clean_val(safe_get(release, "song_ar"))
    album_en = _clean_val(safe_get(release, "album_en"))

    if video_type == "Concert":
        return f"{artist_en} - {song_en} | {album_en} | {artist_ar} - {song_ar}"
    elif video_type == "Lyrics Video":
        return f"{artist_en} - {song_en} | Lyrics Video {year} | {artist_ar} - {song_ar}"
    else:
        return f"{artist_en} - {song_en} | Official Music Video {year} | {artist_ar} - {song_ar}"


def _generate_hashtags(release: dict, year: int) -> str:
    """Generate hashtags line."""
    artist_en = _clean_val(safe_get(release, "artist_en"))
    artist_tag = artist_en.replace(" ", "") if artist_en else "Artist"
    return f"#Rotana{year} #Rotana #{artist_tag}"


def _generate_album_lines(release: dict, video_type: str) -> str:
    """Generate album lines. Skipped for Concert type."""
    if video_type == "Concert":
        return ""

    album_ar = _clean_val(safe_get(release, "album_ar"))
    album_en = _clean_val(safe_get(release, "album_en"))

    if not album_ar and not album_en:
        return ""

    lines = []
    if album_ar:
        lines.append(f'من ألبوم "{album_ar}"')
    if album_en:
        lines.append(f'From "{album_en}" Album')

    return "\n" + "\n".join(lines) + "\n"


def _generate_credits(release: dict) -> str:
    """Generate credits section."""
    lines = []

    sw_en = _clean_val(safe_get(release, "songwriter_en"))
    sw_ar = _clean_val(safe_get(release, "songwriter_ar"))
    if sw_en or sw_ar:
        lines.append(f"✶ Lyrics : {sw_en} | {sw_ar}")

    comp_en = _clean_val(safe_get(release, "composer_en"))
    comp_ar = _clean_val(safe_get(release, "composer_ar"))
    if comp_en or comp_ar:
        lines.append(f"✶ Composition : {comp_en} | {comp_ar}")

    arr_en = _clean_val(safe_get(release, "arranger_en"))
    arr_ar = _clean_val(safe_get(release, "arranger_ar"))
    if arr_en or arr_ar:
        lines.append(f"✶ Arrangement : {arr_en} | {arr_ar}")

    return "\n".join(lines)


def _get_subscribe_text(channel: str, channel_descriptions: dict) -> str:
    """Get subscribe/description text for a channel."""
    # Check caller-provided descriptions first, then defaults
    merged = {**DEFAULT_CHANNEL_DESCRIPTIONS, **(channel_descriptions or {})}
    desc = merged.get(channel, "").strip()
    return desc if desc else DEFAULT_SUBSCRIBE_TEXT


def _format_lyrics(lyrics: str | None) -> str | None:
    """Clean and format lyrics text."""
    if not lyrics or not lyrics.strip():
        return None
    lines = lyrics.strip().splitlines()
    return "\n".join(line.rstrip() for line in lines)


def _assemble_description(
    title: str,
    hashtags: str,
    album_lines: str,
    credits: str,
    subscribe_text: str,
    lyrics: str | None,
) -> str:
    """Assemble the full YouTube description."""
    parts = [
        f"{hashtags}\n{title}\n",
        album_lines,
        credits,
        f"\n\n{subscribe_text}\n",
    ]

    if lyrics:
        parts.append(f"\n\n✶ Lyrics | الكلمات\n\n{lyrics}\n")

    parts.append(f"\n{SOCIAL_LINKS}")

    return "".join(parts)


def _generate_tags(release: dict) -> str:
    """Generate comma-separated YouTube tags."""
    fields = [
        "artist_en", "artist_ar",
        "song_en", "song_ar",
        "album_en", "album_ar",
        "songwriter_ar", "composer_ar",
    ]

    tags = []
    for field in fields:
        val = _clean_val(safe_get(release, field))
        if val:
            tags.append(val)

    return ", ".join(tags)


# --------------- Main Entry Point ---------------

def generate_video_metadata(
    row_data: dict,
    video_type: str,
    channel: str,
    lyrics: str | None = None,
    channel_descriptions: dict = {},
) -> dict:
    """Generate complete YouTube video metadata from release row data.

    Args:
        row_data: Raw release data (Excel column names or standard field names).
        video_type: "Lyrics Video", "Music Video", or "Concert".
        channel: YouTube channel name for subscribe text.
        lyrics: Optional lyrics text to embed in description.
        channel_descriptions: Optional dict of channel → subscribe text overrides.

    Returns:
        Dict with title, description, tags, isrc, upc.
    """
    try:
        logger.info("[youtube_formatter] Generating metadata — video_type=%s, channel=%s", video_type, channel)

        # Normalize row data to standard field names
        release = _normalize_row(row_data)

        year = datetime.utcnow().year

        # 1. Title
        title = _generate_title(release, video_type, year)

        # 2. Hashtags
        hashtags = _generate_hashtags(release, year)

        # 3. Album lines
        album_lines = _generate_album_lines(release, video_type)

        # 4. Credits
        credits_text = _generate_credits(release)

        # 5. Channel subscribe text
        subscribe_text = _get_subscribe_text(channel, channel_descriptions)

        # 6. Lyrics
        formatted_lyrics = _format_lyrics(lyrics)

        # 7. Full description
        description = _assemble_description(
            title=title,
            hashtags=hashtags,
            album_lines=album_lines,
            credits=credits_text,
            subscribe_text=subscribe_text,
            lyrics=formatted_lyrics,
        )

        # 8. Tags
        tags = _generate_tags(release)

        # 9. ISRC / UPC
        isrc = _clean_val(safe_get(release, "isrc"))
        upc = _clean_val(safe_get(release, "upc"))

        logger.info("[youtube_formatter] Metadata generated — title=%s", title[:60])

        return {
            "title": title,
            "description": description,
            "tags": tags,
            "isrc": isrc,
            "upc": upc,
        }

    except Exception:
        logger.exception("[youtube_formatter] Failed to generate metadata")
        return {
            "title": "",
            "description": "",
            "tags": "",
            "isrc": "",
            "upc": "",
        }
