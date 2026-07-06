"""
HASHTAG_AGENT — Generates hashtags and promotional intro lines.
"""

import logging
from datetime import datetime

logger = logging.getLogger("agents.tools.hashtag")


class HashtagAgent:
    name = "HASHTAG_AGENT"

    def generate(self, release: dict, year: int | None = None) -> str:
        """Generate hashtags line for the video description."""
        if year is None:
            year = datetime.utcnow().year

        artist_en = release.get("artist_en", "").strip()
        artist_tag = artist_en.replace(" ", "") if artist_en else "Artist"

        hashtags = f"#Rotana{year} #Rotana #{artist_tag}"
        logger.info("[%s] Hashtags: %s", self.name, hashtags)
        return hashtags

    def run(self, release: dict) -> dict:
        return {"hashtags": self.generate(release)}
