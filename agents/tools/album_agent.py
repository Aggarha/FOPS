"""
ALBUM_AGENT — Generates album info lines for video descriptions.
"""

import logging

logger = logging.getLogger("agents.tools.album")


class AlbumAgent:
    name = "ALBUM_AGENT"

    def generate(self, release: dict, video_type: str = "Music Video") -> str:
        """Generate album lines. Skipped for Concert type."""
        if video_type == "Concert":
            logger.info("[%s] Skipped — Concert type", self.name)
            return ""

        album_ar = release.get("album_ar", "").strip()
        album_en = release.get("album_en", "").strip()

        if not album_ar and not album_en:
            return ""

        lines = []
        if album_ar:
            lines.append(f'من ألبوم "{album_ar}"')
        if album_en:
            lines.append(f'From "{album_en}" Album')

        result = "\n" + "\n".join(lines) + "\n"
        logger.info("[%s] Album lines generated", self.name)
        return result

    def run(self, release: dict, video_type: str = "Music Video") -> dict:
        return {"album_lines": self.generate(release, video_type)}
