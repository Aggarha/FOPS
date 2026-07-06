"""
LYRICS_AGENT — Handles lyrics text processing and formatting.
"""

import logging

logger = logging.getLogger("agents.tools.lyrics")


class LyricsAgent:
    name = "LYRICS_AGENT"

    def format(self, lyrics_text: str | None) -> str:
        """Format lyrics for YouTube description embedding."""
        if not lyrics_text or not lyrics_text.strip():
            return ""

        logger.info("[%s] Formatting lyrics (%d chars)", self.name, len(lyrics_text))

        # Clean up: normalize line endings, strip trailing whitespace per line
        lines = lyrics_text.strip().splitlines()
        cleaned = "\n".join(line.rstrip() for line in lines)

        return cleaned

    def wrap_for_description(self, lyrics_text: str | None) -> str:
        """Return the full lyrics block ready for description embedding."""
        formatted = self.format(lyrics_text)
        if not formatted:
            return ""
        return f"\n\n✶ Lyrics | الكلمات\n\n{formatted}\n"

    def run(self, lyrics: str | None = None) -> dict:
        formatted = self.format(lyrics)
        return {
            "has_lyrics": bool(formatted),
            "char_count": len(formatted),
            "formatted": formatted,
        }
