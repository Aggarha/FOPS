"""
DESCRIPTION_AGENT — Assembles full YouTube video descriptions.

Composes the final description from parts:
  1. Hashtags + title line
  2. Album lines (if not Concert)
  3. Credits
  4. Channel subscribe text
  5. Lyrics (if provided)
  6. Social links
"""

import logging

from agents.tools.video_config import SOCIAL_LINKS

logger = logging.getLogger("agents.tools.description")


class DescriptionAgent:
    name = "DESCRIPTION_AGENT"

    def generate(
        self,
        title: str,
        hashtags: str,
        album_lines: str,
        credits: str,
        subscribe_text: str,
        lyrics: str | None = None,
    ) -> str:
        """Assemble the full YouTube description."""
        logger.info("[%s] Assembling description", self.name)

        parts = [
            f"{hashtags}\n{title}\n",
            album_lines,
            credits,
            f"\n\n{subscribe_text}\n",
        ]

        if lyrics:
            parts.append(f"\n\n✶ Lyrics | الكلمات\n\n{lyrics}\n")

        parts.append(f"\n{SOCIAL_LINKS}")

        description = "".join(parts)
        logger.info("[%s] Description assembled (%d chars)", self.name, len(description))
        return description

    def run(self, **kwargs) -> dict:
        return {"description": self.generate(**kwargs)}
