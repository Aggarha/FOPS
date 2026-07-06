"""
Fingerprint Database Module

Manages storage and retrieval of audio fingerprints with caching support.
Supports pagination, audio file storage, and fuzzy matching.

Schema:
  [
    {
      "id": "uuid-string",
      "song": "Song Name",
      "artist": "Artist Name",
      "fingerprint": {...},
      "duration": float,
      "audio_file": "storage/audio/uuid.mp3",
      "created_at": "2026-04-23T11:27:40Z",
      "url": null
    }
  ]
"""

import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import uuid4

from thefuzz import fuzz

logger = logging.getLogger("storage.fingerprint_db")

# Module-level cache
_cache = None
_cache_file = Path(__file__).parent / "fingerprints.json"
_audio_dir = Path(__file__).parent / "audio"


def _ensure_audio_dir():
    """Ensure audio directory exists."""
    _audio_dir.mkdir(parents=True, exist_ok=True)


def load_db() -> List[Dict[str, Any]]:
    """Load fingerprints from disk with in-memory caching.
    
    Returns cached data on subsequent calls unless clear_cache() was called.
    """
    global _cache
    
    if _cache is not None:
        return _cache
    
    if not _cache_file.exists():
        _cache = []
        return _cache
    
    try:
        with open(_cache_file, 'r', encoding='utf-8') as f:
            _cache = json.load(f)
            logger.debug(f"fingerprint_db: loaded {len(_cache)} entries from cache file")
            return _cache
    except json.JSONDecodeError as e:
        logger.error(f"fingerprint_db: invalid JSON in {_cache_file}: {e}")
        _cache = []
        return _cache
    except Exception as e:
        logger.error(f"fingerprint_db: error loading cache: {e}")
        _cache = []
        return _cache


def save_db(data: List[Dict[str, Any]]) -> None:
    """Persist fingerprints to disk and update cache."""
    global _cache
    
    _cache = data
    
    try:
        with open(_cache_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            logger.debug(f"fingerprint_db: saved {len(data)} entries to disk")
    except Exception as e:
        logger.error(f"fingerprint_db: error saving to disk: {e}")
        raise


def clear_cache() -> Dict[str, str]:
    """Clear in-memory cache to force reload from disk."""
    global _cache
    _cache = None
    return {"success": True, "message": "Cache cleared"}


def search_fingerprint(
    song: str, 
    artist: str, 
    fuzzy_match: bool = True
) -> Optional[Dict[str, Any]]:
    """Search for fingerprint by song/artist.
    
    Args:
        song: Song name
        artist: Artist name
        fuzzy_match: Use fuzzy matching (80% threshold)
    
    Returns:
        Matching entry or None
    """
    data = load_db()
    
    # Exact match first
    for entry in data:
        if entry.get("song", "").lower() == song.lower() and \
           entry.get("artist", "").lower() == artist.lower():
            return entry
    
    # Fuzzy match if enabled
    if fuzzy_match:
        FUZZY_THRESHOLD = 80
        
        for entry in data:
            entry_song = entry.get("song", "").lower()
            entry_artist = entry.get("artist", "").lower()
            
            # Weighted fuzzy matching
            song_score = fuzz.token_set_ratio(song.lower(), entry_song)
            artist_score = fuzz.token_set_ratio(artist.lower(), entry_artist)
            
            # Combined score: 60% song, 40% artist
            combined_score = (song_score * 0.6) + (artist_score * 0.4)
            
            if combined_score >= FUZZY_THRESHOLD:
                logger.debug(
                    f"fingerprint_db: fuzzy match {song}/{artist} → "
                    f"{entry_song}/{entry_artist} (score: {combined_score:.1f})"
                )
                return entry
    
    return None


def add_fingerprint(
    song: str,
    artist: str,
    fingerprint: Dict[str, Any],
    duration: float = 0,
    url: Optional[str] = None,
    audio_file: Optional[str] = None
) -> Dict[str, Any]:
    """Add or update a fingerprint in the database.
    
    Args:
        song: Song name
        artist: Artist name
        fingerprint: Fingerprint data (dict)
        duration: Audio duration in seconds
        url: Optional source URL
        audio_file: Optional path to audio file
    
    Returns:
        The stored entry
    """
    data = load_db()
    
    # Check if entry exists (by song + artist)
    existing = None
    for entry in data:
        if entry.get("song", "").lower() == song.lower() and \
           entry.get("artist", "").lower() == artist.lower():
            existing = entry
            break
    
    if existing:
        # Update existing entry
        existing["fingerprint"] = fingerprint
        existing["duration"] = duration
        if url:
            existing["url"] = url
        if audio_file:
            existing["audio_file"] = audio_file
        logger.info(f"fingerprint_db: updated entry for {song} - {artist}")
    else:
        # Create new entry
        entry = {
            "id": str(uuid4()),
            "song": song,
            "artist": artist,
            "fingerprint": fingerprint,
            "duration": duration,
            "audio_file": audio_file,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "url": url
        }
        data.append(entry)
        existing = entry
        logger.info(f"fingerprint_db: added new entry for {song} - {artist}")
    
    save_db(data)
    return existing


def get_all_fingerprints(
    limit: Optional[int] = None,
    page: int = 1,
    sort_by: str = "created_at"
) -> tuple[List[Dict[str, Any]], int]:
    """Retrieve fingerprints with pagination support.
    
    Args:
        limit: Number of entries per page (None = all)
        page: Page number (1-indexed)
        sort_by: Sort field ("created_at" or "song")
    
    Returns:
        Tuple of (entries, total_count)
    """
    data = load_db()
    
    # Sort by specified field (most recent first for created_at)
    if sort_by == "created_at":
        data = sorted(data, key=lambda x: x.get("created_at", ""), reverse=True)
    elif sort_by == "song":
        data = sorted(data, key=lambda x: x.get("song", "").lower())
    
    total_count = len(data)
    
    # Apply pagination
    if limit:
        start = (page - 1) * limit
        end = start + limit
        data = data[start:end]
    
    return data, total_count


def get_by_id(entry_id: str) -> Optional[Dict[str, Any]]:
    """Get fingerprint entry by ID.
    
    Args:
        entry_id: Entry UUID
    
    Returns:
        Entry or None
    """
    data = load_db()
    
    for entry in data:
        if entry.get("id") == entry_id:
            return entry
    
    return None


def delete_by_id(entry_id: str) -> Dict[str, Any]:
    """Delete fingerprint entry by ID and remove associated audio file.
    
    Args:
        entry_id: Entry UUID
    
    Returns:
        Result dict with success/message
    """
    data = load_db()
    
    entry_to_delete = None
    for i, entry in enumerate(data):
        if entry.get("id") == entry_id:
            entry_to_delete = (i, entry)
            break
    
    if not entry_to_delete:
        return {"success": False, "message": "Entry not found"}
    
    idx, entry = entry_to_delete
    
    # Delete associated audio file if exists
    if entry.get("audio_file"):
        try:
            audio_path = Path(__file__).parent / entry["audio_file"]
            if audio_path.exists():
                audio_path.unlink()
                logger.info(f"fingerprint_db: deleted audio file {entry['audio_file']}")
        except Exception as e:
            logger.warning(f"fingerprint_db: failed to delete audio file: {e}")
    
    # Remove from database
    data.pop(idx)
    save_db(data)
    
    logger.info(f"fingerprint_db: deleted entry {entry_id} ({entry.get('song')} - {entry.get('artist')})")
    
    return {
        "success": True,
        "message": f"Deleted {entry.get('song')} by {entry.get('artist')}"
    }


def get_stats() -> Dict[str, Any]:
    """Get database statistics.
    
    Returns:
        Dict with total_entries, db_size_kb, db_path
    """
    data = load_db()
    
    try:
        db_size_kb = _cache_file.stat().st_size / 1024 if _cache_file.exists() else 0
    except:
        db_size_kb = 0
    
    # Count audio files in storage
    audio_count = 0
    total_audio_size_kb = 0
    try:
        for audio_file in _audio_dir.glob("*"):
            if audio_file.is_file():
                audio_count += 1
                total_audio_size_kb += audio_file.stat().st_size / 1024
    except:
        pass
    
    return {
        "total_entries": len(data),
        "db_size_kb": round(db_size_kb, 2),
        "audio_files": audio_count,
        "audio_storage_kb": round(total_audio_size_kb, 2),
        "db_path": str(_cache_file),
        "audio_dir": str(_audio_dir)
    }


def reset_db() -> Dict[str, str]:
    """Clear all fingerprints and audio files (admin function).
    
    Returns:
        Reset confirmation
    """
    try:
        # Delete all audio files
        for audio_file in _audio_dir.glob("*"):
            if audio_file.is_file():
                audio_file.unlink()
                logger.debug(f"fingerprint_db: deleted audio file {audio_file.name}")
        
        # Clear database
        save_db([])
        logger.warning("fingerprint_db: database reset by admin")
        
        return {"success": True, "message": "Fingerprint database and audio files cleared"}
    except Exception as e:
        logger.error(f"fingerprint_db: error resetting database: {e}")
        raise
