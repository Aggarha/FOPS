"""
MatchingAgent — Fuzzy-matching logic for comparing search results.
"""

import logging

from thefuzz import fuzz

logger = logging.getLogger("agents.tools.matching_agent")


class MatchingAgent:
    name = "MATCHING"

    def run(self, candidates: list[dict], song: str, artist: str) -> dict:
        """Score and rank candidate YouTube results against expected song/artist.

        Args:
            candidates: List of dicts with at least 'title' and 'channel'.
            song: Expected song title.
            artist: Expected artist name.

        Returns:
            dict with scored candidates sorted by match_score.
        """
        logger.info("[%s] Matching %d candidates for %r – %r", self.name, len(candidates), artist, song)

        expected = f"{artist} - {song}"
        scored = []

        for c in candidates:
            title = c.get("title", "")
            channel = c.get("channel", "")

            title_score = fuzz.token_sort_ratio(expected, title)
            partial_score = fuzz.partial_ratio(song, title)
            channel_score = fuzz.partial_ratio(artist, channel)

            match_score = round((title_score * 0.45) + (partial_score * 0.35) + (channel_score * 0.20), 2)

            scored.append({
                **c,
                "match_score": match_score,
                "title_similarity": title_score,
                "partial_similarity": partial_score,
                "channel_match": channel_score,
            })

        scored.sort(key=lambda x: x["match_score"], reverse=True)

        return {
            "agent": self.name,
            "results": scored,
            "best": scored[0] if scored else None,
        }
