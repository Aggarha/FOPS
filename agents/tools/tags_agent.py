"""
TAGS_AGENT — Generates YouTube tags from release metadata.
"""

import logging

logger = logging.getLogger("agents.tools.tags")


class TagsAgent:
    name = "TAGS_AGENT"

    def generate(self, release: dict) -> str:
        """Generate comma-separated YouTube tags from release metadata."""
        logger.info("[%s] Generating tags", self.name)

        fields = [
            "artist_en", "artist_ar",
            "song_en", "song_ar",
            "album_en", "album_ar",
            "songwriter_ar", "composer_ar",
        ]

        tags = []
        for field in fields:
            val = release.get(field, "")
            if val and str(val).strip() and str(val).strip().lower() != "nan":
                tags.append(str(val).strip())

        result = ", ".join(tags)
        logger.info("[%s] Generated %d tags", self.name, len(tags))
        return result

    def generate_list(self, release: dict) -> list[str]:
        """Return tags as a list."""
        raw = self.generate(release)
        return [t.strip() for t in raw.split(",") if t.strip()]

    def run(self, release: dict) -> dict:
        return {"tags": self.generate(release), "tags_list": self.generate_list(release)}
