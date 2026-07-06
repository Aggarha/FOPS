"""
Fingerprint Database — Optional in-memory cache for fingerprints.

Features:
  - Store fingerprints indexed by (song, artist)
  - Fuzzy matching to find similar entries
  - Persistent JSON storage
  - Memory cache for fast lookups
  - Optional feature (config-controlled)
"""

import json
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from thefuzz import fuzz

logger = logging.getLogger("storage.fingerprint_db")

DB_PATH = Path(__file__).parent / "fingerprints.json"
_cache: Optional[List[Dict[str, Any]]] = None
FUZZY_THRESHOLD = 80  # Similarity threshold for fuzzy matching


def load_db() -> List[Dict[str, Any]]:
    """Load fingerprint database from disk."""
    global _cache
    if _cache is not None:
        return _cache
    
    if not DB_PATH.exists():
        _cache = []
        return _cache
    
    try:
        data = json.loads(DB_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            logger.warning("fingerprint_db: invalid format, resetting")
            _cache = []
        else:
            _cache = data
            logger.info("fingerprint_db: loaded %d fingerprints from disk", len(_cache))
    except (json.JSONDecodeError, IOError) as e:
        logger.error("fingerprint_db: error loading DB: %s", e)
        _cache = []
    
    return _cache


def save_db(data: List[Dict[str, Any]]) -> None:
    """Save fingerprint database to disk."""
    global _cache
    _cache = data
    try:
        DB_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("fingerprint_db: saved %d fingerprints to disk", len(data))
    except IOError as e:
        logger.error("fingerprint_db: error saving DB: %s", e)


def clear_cache() -> None:
    """Clear in-memory cache (force reload on next access)."""
    global _cache
    _cache = None
    logger.info("fingerprint_db: cache cleared")


def search_fingerprint(
    song: str,
    artist: str,
    fuzzy_match: bool = True
) -> Optional[Dict[str, Any]]:
    """Search for fingerprint by song + artist.
    
    If fuzzy_match=True, returns best match above FUZZY_THRESHOLD.
    Otherwise requires exact match.
    
    Args:
        song: Song name
        artist: Artist name
        fuzzy_match: Use fuzzy matching (default True)
    
    Returns:
        Fingerprint entry if found, None otherwise
    """
    db = load_db()
    if not db:
        return None
    
    song = song.strip().lower()
    artist = artist.strip().lower()
    
    if not fuzzy_match:
        # Exact match
        for entry in db:
            if (entry.get("song", "").strip().lower() == song and
                entry.get("artist", "").strip().lower() == artist):
                return entry
        return None
    
    # Fuzzy match — find best match above threshold
    best_match = None
    best_score = 0
    
    for entry in db:
        entry_song = entry.get("song", "").strip().lower()
        entry_artist = entry.get("artist", "").strip().lower()
        
        # Combine scores: 60% song, 40% artist
        song_score = fuzz.token_set_ratio(song, entry_song)
        artist_score = fuzz.token_set_ratio(artist, entry_artist)
        combined_score = (song_score * 0.6) + (artist_score * 0.4)
        
        if combined_score > best_score:
            best_score = combined_score
            best_match = entry
    
    if best_score >= FUZZY_THRESHOLD:
        logger.info("fingerprint_db: fuzzy match found %r - %r (score: %.1f)", artist, song, best_score)
        return best_match
    
    logger.debug("fingerprint_db: no fuzzy match for %r - %r (best: %.1f)", artist, song, best_score)
    return None


def add_fingerprint(
    song: str,
    artist: str,
    fingerprint: Any,
    duration: Optional[float] = None,
    url: Optional[str] = None
) -> Dict[str, Any]:
    """Add or update fingerprint in database.
    
    Args:
        song: Song name
        artist: Artist name
        fingerprint: Fingerprint data (can be dict or list)
        duration: Audio duration in seconds (optional)
        url: Source URL (optional, for reference)
    
    Returns:
        The added/updated entry
    """
    db = load_db()
    song = song.strip()
    artist = artist.strip()
    
    # Check if entry exists (exact match)
    for entry in db:
        if (entry.get("song", "").strip().lower() == song.lower() and
            entry.get("artist", "").strip().lower() == artist.lower()):
            # Update existing
            entry["fingerprint"] = fingerprint
            if duration is not None:
                entry["duration"] = duration
            if url is not None:
                entry["url"] = url
            entry["updated"] = True
            save_db(db)
            logger.info("fingerprint_db: updated fingerprint for %r - %r", artist, song)
            return entry
    
    # Add new entry
    entry = {
        "song": song,
        "artist": artist,
        "fingerprint": fingerprint,
        "duration": duration,
        "url": url,
        "added": True
    }
    db.insert(0, entry)  # Insert at front (most recent first)
    save_db(db)
    logger.info("fingerprint_db: added fingerprint for %r - %r", artist, song)
    return entry


def get_all_fingerprints(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Get all fingerprints in database.
    
    Args:
        limit: Max number to return (None = all)
    
    Returns:
        List of fingerprint entries
    """
    db = load_db()
    if limit is not None:
        return db[:limit]
    return db


def get_stats() -> Dict[str, Any]:
    """Get database statistics."""
    db = load_db()
    return {
        "total_entries": len(db),
        "db_size_kb": DB_PATH.stat().st_size / 1024 if DB_PATH.exists() else 0,
        "db_path": str(DB_PATH),
    }


def reset_db() -> Dict[str, Any]:
    """Clear all fingerprints from database."""
    global _cache
    _cache = []
    save_db([])
    logger.warning("fingerprint_db: database reset")
    return {"status": "reset", "message": "All fingerprints cleared"}
