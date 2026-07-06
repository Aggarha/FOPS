"""
WebSocket Manager for FOPS Real-Time Communication System
Handles global chat, private messages, notifications, and presence updates.
"""

import json
import asyncio
from typing import Dict, Set, Optional, List
from datetime import datetime
from dataclasses import dataclass, asdict
import logging

logger = logging.getLogger("fops.websocket")


@dataclass
class ActiveUser:
    """Represents an active WebSocket connection"""
    user_id: int
    user_name: str
    status: str = "online"  # online, away, busy, offline
    last_activity: datetime = None
    current_tool: Optional[str] = None

    def __post_init__(self):
        if self.last_activity is None:
            self.last_activity = datetime.utcnow()


class WebSocketManager:
    """
    Manages WebSocket connections for real-time communication.
    
    Features:
    - Global chat broadcasting
    - Private message routing
    - Presence tracking
    - Typing indicators
    - Notification delivery
    - Activity streaming
    """

    def __init__(self):
        # Global chat connections
        self.global_chat_connections: Set = set()
        
        # Private message connections per user
        self.user_connections: Dict[int, Set] = {}
        
        # Notification connections per user
        self.notification_connections: Dict[int, Set] = {}
        
        # Activity stream connections
        self.activity_connections: Set = set()
        
        # User presence tracking
        self.active_users: Dict[int, ActiveUser] = {}
        
        # Typing indicators
        self.typing_users: Dict[int, str] = {}  # user_id -> room

    async def connect_global_chat(self, websocket):
        """Add connection to global chat"""
        self.global_chat_connections.add(websocket)
        await websocket.accept()
        logger.info(f"User connected to global chat. Total: {len(self.global_chat_connections)}")

    async def disconnect_global_chat(self, websocket):
        """Remove connection from global chat"""
        self.global_chat_connections.discard(websocket)
        logger.info(f"User disconnected from global chat. Total: {len(self.global_chat_connections)}")

    async def connect_notifications(self, user_id: int, websocket):
        """Add notification connection for user"""
        if user_id not in self.notification_connections:
            self.notification_connections[user_id] = set()
        
        self.notification_connections[user_id].add(websocket)
        await websocket.accept()
        logger.info(f"User {user_id} connected to notifications")

    async def disconnect_notifications(self, user_id: int, websocket):
        """Remove notification connection"""
        if user_id in self.notification_connections:
            self.notification_connections[user_id].discard(websocket)
            if not self.notification_connections[user_id]:
                del self.notification_connections[user_id]

    async def connect_activity_stream(self, websocket):
        """Add connection to activity stream"""
        self.activity_connections.add(websocket)
        await websocket.accept()
        logger.info(f"User connected to activity stream. Total: {len(self.activity_connections)}")

    async def disconnect_activity_stream(self, websocket):
        """Remove activity stream connection"""
        self.activity_connections.discard(websocket)

    def set_user_presence(self, user_id: int, user_name: str, status: str = "online", tool: Optional[str] = None):
        """Update user presence"""
        self.active_users[user_id] = ActiveUser(
            user_id=user_id,
            user_name=user_name,
            status=status,
            last_activity=datetime.utcnow(),
            current_tool=tool
        )

    def get_user_presence(self, user_id: int) -> Optional[ActiveUser]:
        """Get user presence"""
        return self.active_users.get(user_id)

    def get_all_online_users(self) -> List[dict]:
        """Get all online users"""
        return [
            asdict(user) for user in self.active_users.values()
            if user.status != "offline"
        ]

    async def broadcast_message(self, message: dict):
        """Broadcast message to all global chat connections"""
        if not self.global_chat_connections:
            return

        data = json.dumps(message)
        disconnected = set()
        
        for connection in self.global_chat_connections:
            try:
                await connection.send_text(data)
            except Exception as e:
                logger.error(f"Error broadcasting message: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for connection in disconnected:
            self.global_chat_connections.discard(connection)

    async def broadcast_presence(self):
        """Broadcast current online users to all connections"""
        online_users = self.get_all_online_users()
        message = {
            "type": "presence_update",
            "online_users": online_users,
            "count": len(online_users),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        await self.broadcast_message(message)

    async def send_notification(self, user_id: int, notification: dict):
        """Send notification to specific user"""
        if user_id not in self.notification_connections:
            return

        data = json.dumps({
            **notification,
            "type": "notification",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        disconnected = set()
        for connection in self.notification_connections[user_id]:
            try:
                await connection.send_text(data)
            except Exception as e:
                logger.error(f"Error sending notification: {e}")
                disconnected.add(connection)
        
        for connection in disconnected:
            self.notification_connections[user_id].discard(connection)

    async def broadcast_activity(self, activity: dict):
        """Broadcast activity to activity stream"""
        if not self.activity_connections:
            return

        data = json.dumps({
            **activity,
            "type": "activity",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        disconnected = set()
        for connection in self.activity_connections:
            try:
                await connection.send_text(data)
            except Exception as e:
                logger.error(f"Error broadcasting activity: {e}")
                disconnected.add(connection)
        
        for connection in disconnected:
            self.activity_connections.discard(connection)

    def set_typing(self, user_id: int, room: str):
        """Mark user as typing in a room"""
        self.typing_users[user_id] = room

    def clear_typing(self, user_id: int):
        """Mark user as not typing"""
        self.typing_users.pop(user_id, None)

    def get_typing_users(self, room: str) -> List[str]:
        """Get users typing in a room"""
        return [
            self.active_users.get(uid).user_name for uid, r in self.typing_users.items()
            if r == room and uid in self.active_users
        ]

    async def send_private_message(self, from_user_id: int, to_user_id: int, message: dict):
        """Send private message to user (would go through database in production)"""
        # In a production system, this would check user's DM connections
        # For now, we'll just notify in activity stream
        pass

    def get_connection_stats(self) -> dict:
        """Get WebSocket connection statistics"""
        return {
            "global_chat": len(self.global_chat_connections),
            "notification_users": len(self.notification_connections),
            "activity_stream": len(self.activity_connections),
            "online_users": len(self.active_users),
            "typing_users": len(self.typing_users)
        }


# Global WebSocket manager instance
ws_manager = WebSocketManager()
