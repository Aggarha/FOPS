"""
WebSocket Manager for Real-Time Activity Logs

Broadcasts activity logs to connected admin clients in real-time.
Uses a manager pattern for scalability across multiple workers.
"""

import logging
import json
from typing import Set, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class LogsWebSocketManager:
    """Manages WebSocket connections for real-time activity log streaming."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.connection_count = 0

    async def connect(self, websocket: WebSocket, user_id: int, role: str):
        """Accept a WebSocket connection (admin-only)."""
        if role != "admin":
            await websocket.close(code=4003, reason="Admin access required")
            return False

        try:
            await websocket.accept()
            self.active_connections.add(websocket)
            self.connection_count += 1
            logger.info(f"WebSocket connected (total: {len(self.active_connections)})")
            return True
        except Exception as e:
            logger.error(f"WebSocket connection failed: {e}")
            return False

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.discard(websocket)
            logger.info(f"WebSocket disconnected (total: {len(self.active_connections)})")

    async def broadcast(self, event_type: str, data: Any):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return

        message = {
            "type": event_type,
            "data": data,
            "timestamp": str(__import__('datetime').datetime.utcnow().isoformat()),
        }

        disconnected = set()

        for websocket in self.active_connections:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.add(websocket)

        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)

    async def send_personal(self, websocket: WebSocket, event_type: str, data: Any):
        """Send a message to a specific client."""
        try:
            message = {
                "type": event_type,
                "data": data,
                "timestamp": str(__import__('datetime').datetime.utcnow().isoformat()),
            }
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")
            self.disconnect(websocket)

    async def send_batch(self, websocket: WebSocket, logs: list):
        """Send a batch of logs to a client (for initial load)."""
        try:
            message = {
                "type": "batch_logs",
                "data": logs,
                "count": len(logs),
                "timestamp": str(__import__('datetime').datetime.utcnow().isoformat()),
            }
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send batch: {e}")
            self.disconnect(websocket)

    def get_connection_count(self) -> int:
        """Get number of active connections."""
        return len(self.active_connections)


# Global instance
logs_ws_manager = LogsWebSocketManager()
