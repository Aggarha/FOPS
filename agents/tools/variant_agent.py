"""
VariantAgent — Wraps the generate_variants tool for agent orchestration.
"""

import logging

from tools.youtube_advanced import generate_variants

logger = logging.getLogger("agents.tools.variant_agent")


class VariantAgent:
    name = "VARIANT"

    def run(self, text: str) -> dict:
        """Generate search query variants for a given text.

        Args:
            text: The base string (song title, artist name, etc.).

        Returns:
            dict with original text and generated variants.
        """
        logger.info("[%s] Generating variants for %r", self.name, text)
        variants = generate_variants(text)
        return {
            "agent": self.name,
            "original": text,
            "variants": variants,
            "count": len(variants),
        }
