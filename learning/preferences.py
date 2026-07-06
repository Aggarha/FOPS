"""
FOPS — Advanced Rule-Based Preference Engine.

Learns from user approve/reject decisions and produces channel/artist
preference scores that influence future audio matching rankings.

Features:
  - Context-aware: tracks channel, artist, and channel+artist combos
  - Confidence-weighted: weight = confidence / 100 (not flat ±1)
  - Time decay: recent decisions matter more (decay = 1 / (days + 1))
  - Max boost ±10, never overrides fingerprint

NO ML. Pure rule-based.

Preferences are persisted to /var/www/fops/cache/preferences.json
and loaded on startup.
"""

import json
import logging
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("learning.preferences")

PREFS_PATH = Path(__file__).parent.parent / "cache" / "preferences.json"

# Max bonus/penalty applied to a 0-100 score
MAX_BOOST = 10.0

# In-memory store — loaded from disk on init
_preferences: dict = {
    "channels": {},         # channel_name_lower → [{"weight": float, "timestamp": float}, ...]
    "artists": {},          # artist_name_lower  → [{"weight": float, "timestamp": float}, ...]
    "channel_artist": {},   # "channel|artist"   → [{"weight": float, "timestamp": float}, ...]
}


# ── persistence ────────────────────────────────────────────────

def _ensure_cache_dir() -> None:
    PREFS_PATH.parent.mkdir(parents=True, exist_ok=True)


def save_preferences() -> None:
    """Write current preferences to disk."""
    _ensure_cache_dir()
    PREFS_PATH.write_text(
        json.dumps(_preferences, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info("preferences: saved to %s", PREFS_PATH)


def load_preferences() -> None:
    """Load preferences from disk into memory. Called at startup."""
    global _preferences
    if not PREFS_PATH.exists():
        logger.info("preferences: no file found, starting fresh")
        return
    try:
        data = json.loads(PREFS_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            # Migrate from old format if needed
            if "channels" in data and "channel_artist" not in data:
                data = _migrate_old_format(data)
            if "channels" in data and "channel_artist" in data:
                _preferences = data
                logger.info("preferences: loaded (%d channels, %d artists, %d combos)",
                            len(_preferences["channels"]),
                            len(_preferences["artists"]),
                            len(_preferences["channel_artist"]))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("preferences: failed to load: %s", exc)


def _migrate_old_format(old: dict) -> dict:
    """Migrate from v1 format ({approved: N, rejected: N}) to v2 (list of weighted entries)."""
    new = {"channels": {}, "artists": {}, "channel_artist": {}}
    now = time.time()
    for bucket_name in ("channels", "artists"):
        for key, entry in old.get(bucket_name, {}).items():
            entries = []
            # Convert old approved count to positive weights
            for _ in range(entry.get("approved", 0)):
                entries.append({"weight": 0.8, "timestamp": now})
            # Convert old rejected count to negative weights
            for _ in range(entry.get("rejected", 0)):
                entries.append({"weight": -0.8, "timestamp": now})
            if entries:
                new[bucket_name][key] = entries
    logger.info("preferences: migrated from v1 to v2 format")
    return new


# ── helpers ────────────────────────────────────────────────────

def _net_score(entries: list) -> float:
    """Net weighted score with time decay for a list of decision entries."""
    now = time.time()
    total = 0.0
    for e in entries:
        weight = e.get("weight", 0)
        ts = e.get("timestamp", now)
        days_since = max(0, (now - ts) / 86400)
        decay = 1.0 / (days_since + 1)
        total += weight * decay
    return total


def _combo_key(channel: str, artist: str) -> str:
    """Build channel|artist combo key."""
    return f"{channel.strip().lower()}|{artist.strip().lower()}"


# ── recording ──────────────────────────────────────────────────

def record_decision(
    channel: str,
    artist: str,
    decision: str,
    confidence: int = 80,
) -> None:
    """Record an approve/reject decision with confidence-weighted learning.

    Args:
        channel: YouTube channel name (from best_match).
        artist: Artist name.
        decision: "approved" or "rejected".
        confidence: Match confidence 0-100 (weight = confidence / 100).
    """
    weight = (confidence / 100.0) if decision == "approved" else -(confidence / 100.0)
    entry = {"weight": weight, "timestamp": time.time()}

    if channel:
        key = channel.strip().lower()
        _preferences["channels"].setdefault(key, []).append(entry)

    if artist:
        key = artist.strip().lower()
        _preferences["artists"].setdefault(key, []).append(entry)

    if channel and artist:
        key = _combo_key(channel, artist)
        _preferences["channel_artist"].setdefault(key, []).append(entry)

    save_preferences()
    logger.info("preferences: recorded %s (w=%.2f) for channel=%r artist=%r",
                decision, weight, channel, artist)


def rebuild_from_decisions() -> dict:
    """Rebuild preference scores from all stored decisions.

    Reads from decisions.db and recalculates all weighted entries.
    Returns summary of what was rebuilt.
    """
    global _preferences
    _preferences = {"channels": {}, "artists": {}, "channel_artist": {}}

    try:
        from storage.decisions import get_decisions
        decisions = get_decisions(limit=10000)
    except Exception as exc:
        logger.warning("preferences: cannot read decisions DB: %s", exc)
        return {"error": str(exc)}

    for d in decisions:
        decision_type = d.get("decision", "")
        artist = (d.get("artist", "") or "").strip().lower()
        best_match = d.get("best_match", "") or ""
        channel = _extract_channel(best_match) or artist
        confidence = d.get("confidence", 80) or 80

        weight = (confidence / 100.0) if decision_type == "approved" else -(confidence / 100.0)

        # Use decision timestamp if available, else now
        ts = d.get("timestamp")
        if isinstance(ts, str):
            try:
                from datetime import datetime
                ts = datetime.fromisoformat(ts).timestamp()
            except (ValueError, TypeError):
                ts = time.time()
        elif not isinstance(ts, (int, float)):
            ts = time.time()

        entry = {"weight": weight, "timestamp": ts}

        if channel:
            _preferences["channels"].setdefault(channel, []).append(entry)
        if artist:
            _preferences["artists"].setdefault(artist, []).append(entry)
        if channel and artist:
            key = _combo_key(channel, artist)
            _preferences["channel_artist"].setdefault(key, []).append(entry)

    save_preferences()
    return {
        "rebuilt": True,
        "channels": len(_preferences["channels"]),
        "artists": len(_preferences["artists"]),
        "combos": len(_preferences["channel_artist"]),
        "total_decisions": len(decisions),
    }


def _extract_channel(url: str) -> str:
    """Try to extract channel info from a URL. Returns empty string on failure."""
    # We don't have channel info in the URL — return empty.
    # The caller should pass channel from the match data when available.
    return ""


# ── scoring ────────────────────────────────────────────────────

def get_channel_boost(channel: str) -> float:
    """Get score boost for a channel based on past decisions with time decay.

    Returns a value between -MAX_BOOST and +MAX_BOOST.
    """
    if not channel:
        return 0.0
    key = channel.strip().lower()
    entries = _preferences["channels"].get(key)
    if not entries:
        return 0.0
    net = _net_score(entries)
    return max(-MAX_BOOST, min(MAX_BOOST, net * 2))


def get_artist_boost(artist: str) -> float:
    """Get score boost for an artist based on past decisions with time decay.

    Returns a value between -MAX_BOOST and +MAX_BOOST.
    """
    if not artist:
        return 0.0
    key = artist.strip().lower()
    entries = _preferences["artists"].get(key)
    if not entries:
        return 0.0
    net = _net_score(entries)
    return max(-MAX_BOOST, min(MAX_BOOST, net * 2))


def get_combo_boost(channel: str, artist: str) -> float:
    """Get score boost for a channel+artist combination with time decay.

    Returns a value between -MAX_BOOST and +MAX_BOOST.
    """
    if not channel or not artist:
        return 0.0
    key = _combo_key(channel, artist)
    entries = _preferences["channel_artist"].get(key)
    if not entries:
        return 0.0
    net = _net_score(entries)
    return max(-MAX_BOOST, min(MAX_BOOST, net * 2))


def get_preference_boost(channel: str, artist: str) -> float:
    """Combined context-aware preference boost for a candidate.

    Applies weighted combination:
      channel_pref * 0.1 + artist_pref * 0.1 + channel_artist_pref * 0.2

    Returns a value between -MAX_BOOST and +MAX_BOOST.
    """
    ch_boost = get_channel_boost(channel)
    ar_boost = get_artist_boost(artist)
    combo_boost = get_combo_boost(channel, artist)

    combined = ch_boost * 0.1 + ar_boost * 0.1 + combo_boost * 0.2

    # Scale up so the combined value uses the full ±MAX_BOOST range
    # max possible raw = 10*0.1 + 10*0.1 + 10*0.2 = 4.0, scale to ±10
    scaled = combined * (MAX_BOOST / 4.0)
    return max(-MAX_BOOST, min(MAX_BOOST, scaled))


def get_preferences_summary() -> dict:
    """Return current preferences state for debugging/status."""
    now = time.time()
    channels = {}
    for k, entries in _preferences["channels"].items():
        net = _net_score(entries)
        if abs(net) > 0.01:
            channels[k] = {"entries": len(entries), "net_score": round(net, 2)}
    artists = {}
    for k, entries in _preferences["artists"].items():
        net = _net_score(entries)
        if abs(net) > 0.01:
            artists[k] = {"entries": len(entries), "net_score": round(net, 2)}
    combos = {}
    for k, entries in _preferences["channel_artist"].items():
        net = _net_score(entries)
        if abs(net) > 0.01:
            combos[k] = {"entries": len(entries), "net_score": round(net, 2)}
    return {
        "channels": channels,
        "artists": artists,
        "channel_artist": combos,
        "total_channel_entries": len(_preferences["channels"]),
        "total_artist_entries": len(_preferences["artists"]),
        "total_combo_entries": len(_preferences["channel_artist"]),
        "file": str(PREFS_PATH),
    }


# ── load on import ─────────────────────────────────────────────
load_preferences()
