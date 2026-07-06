"""
TITLE_AGENT — Generates YouTube video titles for releases.

Rules:
  - Concert: "{artist_en} - {song_en} | {album_en} | {artist_ar} - {song_ar}"
  - Lyrics Video: "{artist_en} - {song_en} | Lyrics Video {year} | {artist_ar} - {song_ar}"
  - Music Video: "{artist_en} - {song_en} | Official Music Video {year} | {artist_ar} - {song_ar}"
"""

import logging
from datetime import datetime

logger = logging.getLogger("agents.tools.title")


class TitleAgent:
    name = "TITLE_AGENT"

    def generate(self, release: dict, video_type: str = "Music Video", year: int | None = None) -> str:
        """Generate a formatted YouTube video title."""
        logger.info("[%s] Generating title for %s — %s (%s)",
                    self.name, release.get("artist_en", "?"), release.get("song_en", "?"), video_type)

        if year is None:
            year = datetime.utcnow().year

        artist_en = release.get("artist_en", "").strip()
        artist_ar = release.get("artist_ar", "").strip()
        song_en = release.get("song_en", "").strip()
        song_ar = release.get("song_ar", "").strip()
        album_en = release.get("album_en", "").strip()

        if video_type == "Concert":
            title = f"{artist_en} - {song_en} | {album_en} | {artist_ar} - {song_ar}"
        elif video_type == "Lyrics Video":
            title = f"{artist_en} - {song_en} | Lyrics Video {year} | {artist_ar} - {song_ar}"
        else:
            title = f"{artist_en} - {song_en} | Official Music Video {year} | {artist_ar} - {song_ar}"

        logger.info("[%s] Title: %s", self.name, title)
        return title

    def run(self, release: dict, video_type: str = "Music Video") -> dict:
        return {"title": self.generate(release, video_type)}
