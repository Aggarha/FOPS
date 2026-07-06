"""
WebSocket Event Broadcaster — Real-time event streaming for activity logs.

Handles WebSocket connections and broadcasts events to subscribed clients.
Admin-only access control.
"""

import logging
import json
from typing import Dict, List, Set
from fastapi import WebSocket, WebSocketDisconnect
import asyncio

logger = logging.getLogger(__name__)


class WebSocketBroadcaster:
    """Manages WebSocket connections and broadcasts real-time events."""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.lock = asyncio.Lock()
    
    async def connect(self, channel: str, websocket: WebSocket, user_id: int = None):
        """Register a new WebSocket connection to a channel."""
        await websocket.accept()
        
        if channel not in self.active_connections:
            self.active_connections[channel] = set()
        
        self.active_connections[channel].add(websocket)
        logger.info(f"WebSocket connected to '{channel}'. Total: {len(self.active_connections[channel])}")
    
    async def disconnect(self, channel: str, websocket: WebSocket):
        """Unregister a WebSocket connection."""
        if channel in self.active_connections:
            self.active_connections[channel].discard(websocket)
            if not self.active_connections[channel]:
                del self.active_connections[channel]
            logger.info(f"WebSocket disconnected from '{channel}'")
    
    async def broadcast(self, channel: str, message: Dict):
        """Broadcast a message to all connected clients on a channel."""
        if channel not in self.active_connections:
            return
        
        # Prepare JSON message
        try:
            json_message = json.dumps(message, default=str)
        except Exception as e:
            logger.error(f"Failed to serialize message: {e}")
            json_message = json.dumps({"error": "Serialization failed"})
        
        # Send to all connected clients
        disconnected = set()
        async with self.lock:
            for websocket in list(self.active_connections[channel]):
                try:
                    await websocket.send_text(json_message)
                except Exception as e:
                    logger.error(f"Failed to send WebSocket message: {e}")
                    disconnected.add(websocket)
            
            # Remove disconnected clients
            for ws in disconnected:
                await self.disconnect(channel, ws)
    
    def get_connection_count(self, channel: str) -> int:
        """Get number of active connections on a channel."""
        return len(self.active_connections.get(channel, set()))
    
    def get_total_connections(self) -> int:
        """Get total number of active connections across all channels."""
        return sum(len(clients) for clients in self.active_connections.values())


# Global broadcaster instance — delegates to the unified WSManager
# Import the adapter from the unified manager so all events flow through
# a single connection registry.
try:
    from services.ws_manager import broadcaster_adapter as ws_broadcaster  # noqa: F401
except Exception:
    # Fallback: standalone instance if unified manager can't load
    ws_broadcaster = WebSocketBroadcaster()

