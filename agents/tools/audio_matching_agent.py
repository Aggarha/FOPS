"""
FOPS — Audio Matching Agent.

Wraps tools/audio_matcher.py for use in the agent pipeline.
Provides structured output compatible with the orchestrator.
"""

import logging
from typing import Optional

logger = logging.getLogger("agents.tools.audio_matching")


class AudioMatchingAgent:
    """Agent that runs multi-platform audio matching with fingerprint verification."""

    name = "AUDIO_MATCHING"

    def run(
        self,
        song: str,
        artist: str,
        platforms: Optional[list[str]] = None,
        use_fingerprint: bool = True,
        reference_url: Optional[str] = None,
        channel_filter: Optional[str] = None,
        filters: Optional[dict] = None,
    ) -> dict:
        """Run audio matching and return structured result.

        Args:
            song: Song title.
            artist: Artist name.
            platforms: Platforms to search (default: ["youtube"]).
            use_fingerprint: Run fingerprint on uncertain matches.
            reference_url: Optional reference URL for comparison.
            channel_filter: Optional channel to boost (legacy).
            filters: Advanced filter dict (channel, views, duration, search_mode).

        Returns:
            dict with agent name, success flag, and match data.
        """
        from tools.audio_matcher import audio_match

        try:
            result = audio_match(
                song=song,
                artist=artist,
                platforms=platforms,
                use_fingerprint=use_fingerprint,
                reference_url=reference_url,
                channel_filter=channel_filter,
                filters=filters,
            )
            return {
                "agent": self.name,
                "success": True,
                "verified": result.get("verified", False),
                "confidence": result.get("confidence", 0),
                "method": result.get("method", "unknown"),
                "best_match": result.get("best_match"),
                "matches_count": len(result.get("matches", [])),
                "data": result,
            }
        except Exception as exc:
            logger.exception("AudioMatchingAgent failed: %s", exc)
            return {
                "agent": self.name,
                "success": False,
                "error": str(exc),
                "verified": False,
                "confidence": 0,
                "best_match": None,
                "data": {},
            }

    def cleanup_cache(self, days: int = 14) -> dict:
        """Clean expired cache entries."""
        from tools.audio_matcher import cleanup_cache
        return {"agent": self.name, **cleanup_cache(days=days)}

    def status(self) -> dict:
        """Return agent status."""
        from tools.audio_matcher import CACHE_DIR
        cache_files = list(CACHE_DIR.glob("*.json")) if CACHE_DIR.exists() else []
        return {
            "agent": self.name,
            "status": "active",
            "cache_entries": len(cache_files),
            "cache_dir": str(CACHE_DIR),
            "platforms": ["youtube", "spotify", "anghami"],
            "fingerprint_integrated": True,
        }
