"""
YouTube Basic Search — Pure function tool.

Searches YouTube for a song/artist combination and returns the top result.
No GUI, no threading, no file I/O — API-ready.
"""

import logging
import re

import yt_dlp

logger = logging.getLogger("tools.youtube_basic")


def search_youtube_basic(song: str, artist: str) -> dict:
    """Search YouTube for a song by an artist and return the top result.

    Args:
        song: Song title to search for.
        artist: Artist name.

    Returns:
        dict with keys: title, url, channel, success, error (if any).
    """
    if not song or not artist:
        return {"success": False, "error": "Both song and artist are required", "title": "", "url": "", "channel": ""}

    query = f"{artist} - {song} official"
    logger.info("youtube_basic: searching for %r", query)

    from services.ytdlp_service import get_hardened_opts
    ydl_opts = get_hardened_opts({
        "skip_download": True,
        "extract_flat": True,
        "default_search": "ytsearch1",
        "noplaylist": True,
        "socket_timeout": 15,
    })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(f"ytsearch1:{query}", download=False)

        entries = result.get("entries") or []
        if not entries:
            logger.warning("youtube_basic: no results for %r", query)
            return {"success": False, "error": "No results found", "title": "", "url": "", "channel": ""}

        entry = entries[0]
        video_id = entry.get("id", "")
        title = entry.get("title", "")
        channel = entry.get("channel", "") or entry.get("uploader", "")
        url = f"https://www.youtube.com/watch?v={video_id}" if video_id else entry.get("url", "")

        logger.info("youtube_basic: found %r by %r", title, channel)
        return {
            "success": True,
            "title": title,
            "url": url,
            "channel": channel,
            "error": None,
        }

    except Exception as exc:
        logger.exception("youtube_basic: search failed for %r", query)
        return {"success": False, "error": str(exc), "title": "", "url": "", "channel": ""}
