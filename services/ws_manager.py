"""
FOPS Unified WebSocket Manager — Phase 1

Single source of truth for all real-time WebSocket connections.

Channels:
  logs          — activity log stream (admin)
  ops           — global operations feed (all authenticated)
  jobs          — job progress stream (all authenticated)
  notifications — user notifications (personal, per-user)

Usage:
  from services.ws_manager import ws_manager
  await ws_manager.connect("logs", websocket, user_id=1)
  await ws_manager.broadcast("logs", {"type": "log", "data": {...}})
  await ws_manager.send_to_user(user_id=1, message={...})
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger("services.ws_manager")

_ALLOWED_CHANNELS = frozenset({"logs", "ops", "jobs", "notifications"})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _pack(message: dict) -> str:
    if "timestamp" not in message:
        message = {**message, "timestamp": _now()}
    try:
        return json.dumps(message, default=str)
    except Exception:
        return json.dumps({"error": "serialization_failed", "timestamp": _now()})


class WSManager:
    """
    Channel-based WebSocket manager with per-user personal channels.

    Thread-safe: uses asyncio.Lock for all mutations.
    Dead connections are pruned on every broadcast automatically.
    """

    def __init__(self):
        # channel_name → set of active WebSocket objects
        self._channels: Dict[str, Set[WebSocket]] = {}
        # user_id → set of WebSocket objects (personal notification channel)
        self._user_sockets: Dict[int, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    # ── Connection lifecycle ─────────────────────────────────────────────────

    async def connect(
        self,
        channel: str,
        websocket: WebSocket,
        user_id: Optional[int] = None,
    ) -> None:
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            if channel not in self._channels:
                self._channels[channel] = set()
            self._channels[channel].add(websocket)
            if user_id is not None:
                if user_id not in self._user_sockets:
                    self._user_sockets[user_id] = set()
                self._user_sockets[user_id].add(websocket)
        logger.info("ws: connected channel=%s user_id=%s total=%d",
                    channel, user_id, self.channel_count(channel))

    async def disconnect(
        self,
        channel: str,
        websocket: WebSocket,
        user_id: Optional[int] = None,
    ) -> None:
        """Unregister a WebSocket connection."""
        async with self._lock:
            self._channels.get(channel, set()).discard(websocket)
            if not self._channels.get(channel):
                self._channels.pop(channel, None)
            if user_id is not None:
                self._user_sockets.get(user_id, set()).discard(websocket)
                if not self._user_sockets.get(user_id):
                    self._user_sockets.pop(user_id, None)
        logger.info("ws: disconnected channel=%s user_id=%s", channel, user_id)

    # ── Broadcasting ──────────────────────────────────────────────────────────

    async def broadcast(self, channel: str, message: dict) -> int:
        """Broadcast a message to every socket on a named channel.

        Returns the number of sockets successfully reached.
        """
        data = _pack(message)
        async with self._lock:
            sockets = list(self._channels.get(channel, set()))
        if not sockets:
            return 0

        dead: list[WebSocket] = []
        sent = 0
        for ws in sockets:
            try:
                await ws.send_text(data)
                sent += 1
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                ch_set = self._channels.get(channel, set())
                for ws in dead:
                    ch_set.discard(ws)

        return sent

    async def send_to_user(self, user_id: int, message: dict) -> int:
        """Deliver a message to all sockets belonging to a specific user."""
        data = _pack(message)
        async with self._lock:
            sockets = list(self._user_sockets.get(user_id, set()))
        if not sockets:
            return 0

        dead: list[WebSocket] = []
        sent = 0
        for ws in sockets:
            try:
                await ws.send_text(data)
                sent += 1
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                user_set = self._user_sockets.get(user_id, set())
                for ws in dead:
                    user_set.discard(ws)

        return sent

    async def send_one(self, websocket: WebSocket, message: dict) -> bool:
        """Send a message to a single websocket. Returns True on success."""
        try:
            await websocket.send_text(_pack(message))
            return True
        except Exception:
            return False

    # ── Stats / introspection ─────────────────────────────────────────────────

    def channel_count(self, channel: str) -> int:
        return len(self._channels.get(channel, set()))

    def stats(self) -> dict:
        """Return connection counts per channel + user scope."""
        channels = {ch: len(socks) for ch, socks in self._channels.items()}
        return {
            "channels": channels,
            "total_connections": sum(channels.values()),
            "connected_users": len(self._user_sockets),
        }


# ── Global singleton ─────────────────────────────────────────────────────────
ws_manager = WSManager()


# ── Backward compat adapter for websocket_broadcaster consumers ───────────────
# services/activity_logger.py calls: broadcaster.broadcast("logs", event)
# This adapter satisfies that interface.
class _BroadcasterAdapter:
    """Drop-in replacement for WebSocketBroadcaster that delegates to ws_manager."""

    async def broadcast(self, channel: str, message: dict) -> None:
        await ws_manager.broadcast(channel, message)

    def get_connection_count(self, channel: str) -> int:
        return ws_manager.channel_count(channel)

    def get_total_connections(self) -> int:
        return ws_manager.stats()["total_connections"]


broadcaster_adapter = _BroadcasterAdapter()
