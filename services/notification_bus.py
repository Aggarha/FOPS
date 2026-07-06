"""
FOPS Notification Bus — Phase 1

Single entry-point for all notifications. Replaces the dual system
(notifications.py file-based + notifications_simple.py in-memory).

Supports:
  - Persistent file storage (notifications.json, capped at 500)
  - Real-time WebSocket delivery to "notifications" channel
  - Per-user targeted delivery via ws_manager.send_to_user()
  - Types: info | success | warning | error | critical

Usage:
  from services.notification_bus import notify
  notify("Build completed", type="success", source="pipeline")
  notify("Upload failed", type="error", user_id=1, source="upload")
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

logger = logging.getLogger("services.notification_bus")

_FILE = Path(__file__).parent.parent / "notifications.json"
_MAX = 500
_TYPE = Literal["info", "success", "warning", "error", "critical"]


# ── Storage helpers ───────────────────────────────────────────────────────────

def _load() -> list:
    try:
        data = json.loads(_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def _save(items: list) -> None:
    try:
        _FILE.write_text(
            json.dumps(items[:_MAX], ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning("notification_bus: failed to persist: %s", e)


# ── Public API ────────────────────────────────────────────────────────────────

def notify(
    message: str,
    *,
    type: _TYPE = "info",
    source: str = "system",
    title: Optional[str] = None,
    user_id: Optional[int] = None,
    data: Optional[dict] = None,
) -> dict:
    """Push a notification and return the notification dict.

    Persists to disk (notifications.json) and fires WS delivery
    asynchronously if an event loop is running.

    Args:
        message: Human-readable message.
        type: Severity — info / success / warning / error / critical.
        source: Origin system (pipeline, upload, agent, etc.).
        title: Optional short title (defaults to source).
        user_id: Target specific user for personal delivery.
        data: Optional extra payload dict.
    """
    notif = {
        "id": str(uuid.uuid4())[:8],
        "message": message,
        "title": title or source,
        "type": type,
        "source": source,
        "user_id": user_id,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }

    # Persist to disk
    items = _load()
    items.insert(0, notif)
    _save(items)

    # Broadcast via WS if loop is running
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_ws_deliver(notif, user_id))
    except RuntimeError:
        pass  # no running loop (e.g. startup / test context)

    return notif


async def _ws_deliver(notif: dict, user_id: Optional[int]) -> None:
    """Async delivery: broadcast to 'notifications' channel + per-user."""
    try:
        from services.ws_manager import ws_manager
        msg = {"type": "notification", **notif}
        await ws_manager.broadcast("notifications", msg)
        if user_id is not None:
            await ws_manager.send_to_user(user_id, msg)
    except Exception as e:
        logger.debug("notification_bus: ws delivery failed: %s", e)


# ── Query helpers ─────────────────────────────────────────────────────────────

def get_notifications(
    user_id: Optional[int] = None,
    limit: int = 50,
    include_read: bool = True,
) -> list:
    """Return notifications from disk, optionally filtered."""
    items = _load()
    if user_id is not None:
        items = [n for n in items if n.get("user_id") in (None, user_id)]
    if not include_read:
        items = [n for n in items if not n.get("read")]
    return items[:limit]


def mark_read(notification_id: str) -> bool:
    """Mark a single notification as read. Returns True if found."""
    items = _load()
    for item in items:
        if item.get("id") == notification_id:
            item["read"] = True
            _save(items)
            return True
    return False


def mark_all_read(user_id: Optional[int] = None) -> int:
    """Mark notifications as read. Returns count updated."""
    items = _load()
    count = 0
    for item in items:
        if user_id is None or item.get("user_id") in (None, user_id):
            if not item.get("read"):
                item["read"] = True
                count += 1
    if count:
        _save(items)
    return count
