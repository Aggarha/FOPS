"""
YouTubeSearchAgent — Combines basic and advanced YouTube search tools.

Returns search results without executing any actions.
"""

import logging

from tools.youtube_basic import search_youtube_basic
from tools.youtube_advanced import search_youtube_advanced

logger = logging.getLogger("agents.tools.youtube_search_agent")


class YoutubeSearchAgent:
    name = "YOUTUBE_SEARCH"

    def run(self, song: str, artist: str, channel_filter: str | None = None) -> dict:
        """Run basic + advanced YouTube search and return merged results.

        Args:
            song: Song title.
            artist: Artist name.
            channel_filter: Optional channel name to boost.

        Returns:
            dict with basic_result, advanced_results, best_match.
        """
        logger.info("[%s] Searching for %r by %r", self.name, song, artist)

        basic = search_youtube_basic(song, artist)
        advanced = search_youtube_advanced(song, artist, channel_filter=channel_filter)

        best = None
        if advanced:
            best = advanced[0]
        elif basic.get("success"):
            best = {"title": basic["title"], "url": basic["url"], "channel": basic["channel"], "score": 50.0}

        return {
            "agent": self.name,
            "basic_result": basic,
            "advanced_results": advanced,
            "best_match": best,
        }
