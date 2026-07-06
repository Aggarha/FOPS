"""
FOPS — Notification utility.

Shared push_notification function used by main.py, pipeline, and alert engine.
File-based JSON storage capped at 200 entries.
"""

import json
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("notifications")

NOTIFICATIONS_FILE = Path(__file__).parent / "notifications.json"
NOTIFICATIONS_MAX = 200


def load_notifications() -> list:
    """Load notifications from disk."""
    try:
        data = json.loads(NOTIFICATIONS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def save_notifications(data: list) -> None:
    """Persist notifications to disk (capped at NOTIFICATIONS_MAX)."""
    NOTIFICATIONS_FILE.write_text(
        json.dumps(data[:NOTIFICATIONS_MAX], ensure_ascii=False),
        encoding="utf-8",
    )


def push_notification(message: str, ntype: str = "info", source: str = "system") -> None:
    """Append a notification and persist to disk."""
    items = load_notifications()
    items.insert(0, {
        "message": message,
        "type": ntype,
        "source": source,
        "timestamp": datetime.utcnow().isoformat(),
        "read": False,
    })
    save_notifications(items)
