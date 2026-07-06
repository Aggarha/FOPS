"""
Fuzzy Matching Scorer — Metadata-based candidate ranking.

Scores YouTube search results using fuzzy string matching.

Scoring formula:
  score = (title_song*0.4 + title_artist*0.35 + keyword*0.15 + recency*0.1) / 100

Output: 0-100 normalized score for each candidate.
"""

import logging
from typing import Optional
from datetime import datetime

from rapidfuzz import fuzz

logger = logging.getLogger("tools.fuzzy_scorer")

# Keyword presence weights
KEYWORD_WEIGHTS = {
    'official': 0.15,
    'audio': 0.10,
    'lyrics': 0.10,
    'video clip': 0.08,
}


def score_candidates(candidates: list[dict], song: str, artist: str) -> list[dict]:
    """Score each candidate using fuzzy matching and metadata.

    Args:
        candidates: List of YouTube results with 'title', 'published_date'
        song: Target song title
        artist: Target artist name

    Returns:
        Sorted candidates (highest score first) with 'metadata_score' added
    """
    logger.info(f"fuzzy_scorer: scoring {len(candidates)} candidates for '{artist} - {song}'")

    for candidate in candidates:
        title = candidate.get('title', '').lower()
        published_date = candidate.get('published_date')

        # 1. Title vs Song (0-100)
        title_song = fuzz.token_sort_ratio(title, song.lower())

        # 2. Title vs Artist (0-100)
        title_artist = fuzz.token_sort_ratio(title, artist.lower())

        # 3. Keyword bonus (0-15)
        keyword_bonus = 0
        for keyword, weight in KEYWORD_WEIGHTS.items():
            if keyword.lower() in title:
                keyword_bonus += weight * 100
                break  # count only one keyword match

        # 4. Recency bonus (0-10)
        recency_bonus = 0
        if published_date:
            try:
                pub_date = datetime.strptime(published_date, "%Y%m%d")
                days_old = (datetime.now() - pub_date).days
                # Newer = better (max 10 points for < 30 days)
                recency_bonus = max(0, min(10, (30 - days_old) / 3))
            except Exception:
                pass

        # Combined score (0-100)
        metadata_score = (
            (title_song * 0.40) +
            (title_artist * 0.35) +
            keyword_bonus +
            recency_bonus
        )
        metadata_score = min(100, max(0, metadata_score))

        candidate['metadata_score'] = round(metadata_score, 2)
        candidate['_scoring_detail'] = {
            'title_song': title_song,
            'title_artist': title_artist,
            'keyword_bonus': round(keyword_bonus, 2),
            'recency_bonus': round(recency_bonus, 2),
        }

    # Sort by score descending
    candidates.sort(key=lambda x: x.get('metadata_score', 0), reverse=True)

    top_10 = candidates[:10]
    logger.info(f"fuzzy_scorer: top scores: {[round(c.get('metadata_score', 0), 1) for c in top_10]}")

    return candidates


def quick_score(title: str, song: str, artist: str) -> float:
    """Quick single-candidate score (0-100).
    
    Args:
        title: Video title
        song: Target song
        artist: Target artist
        
    Returns:
        Metadata score 0-100
    """
    title_lower = title.lower()
    song_score = fuzz.token_sort_ratio(title_lower, song.lower())
    artist_score = fuzz.token_sort_ratio(title_lower, artist.lower())

    score = (song_score * 0.40) + (artist_score * 0.35)

    # Keyword bonus
    for keyword in ['official', 'audio', 'lyrics']:
        if keyword in title_lower:
            score += 15
            break

    return min(100, score)
