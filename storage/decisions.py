"""
FOPS — Decision Storage.

Persists approve/reject decisions in a local SQLite database.
DB file: /var/www/fops/decisions.db
"""

import sqlite3
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("storage.decisions")

DB_PATH = Path(__file__).parent.parent / "decisions.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song TEXT NOT NULL,
    artist TEXT NOT NULL,
    best_match TEXT,
    confidence INTEGER DEFAULT 0,
    decision TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _ensure_table() -> None:
    with _connect() as conn:
        conn.execute(_CREATE_TABLE)


# Run on import
_ensure_table()


def save_decision(
    song: str,
    artist: str,
    decision: str,
    best_match: str = "",
    confidence: int = 0,
    reason: str = "",
) -> dict:
    """Save an approve/reject decision.

    Args:
        song: Song title.
        artist: Artist name.
        decision: "approved" or "rejected".
        best_match: URL or title of best match.
        confidence: Confidence percentage.
        reason: Human or system reason.

    Returns:
        dict with id and saved data.
    """
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO decisions (song, artist, best_match, confidence, decision, reason)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (song, artist, best_match, confidence, decision, reason),
        )
        row_id = cur.lastrowid

    logger.info("decisions: saved %s for %r - %r (id=%d)", decision, artist, song, row_id)
    return {
        "id": row_id,
        "song": song,
        "artist": artist,
        "best_match": best_match,
        "confidence": confidence,
        "decision": decision,
        "reason": reason,
    }


def get_decisions(
    limit: int = 50,
    decision_filter: Optional[str] = None,
) -> list[dict]:
    """Retrieve recent decisions.

    Args:
        limit: Max rows to return (default 50).
        decision_filter: Optional "approved" or "rejected" filter.

    Returns:
        List of decision dicts, newest first.
    """
    query = "SELECT * FROM decisions"
    params: list = []

    if decision_filter:
        query += " WHERE decision = ?"
        params.append(decision_filter)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()

    return [dict(r) for r in rows]


def get_decision_for_song(song: str, artist: str) -> Optional[dict]:
    """Get the latest decision for a specific song/artist pair."""
    with _connect() as conn:
        row = conn.execute(
            """SELECT * FROM decisions
               WHERE song = ? AND artist = ?
               ORDER BY created_at DESC LIMIT 1""",
            (song, artist),
        ).fetchone()

    return dict(row) if row else None
