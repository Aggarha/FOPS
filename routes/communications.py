"""
Communication System API Routes
Includes global chat, private messages, comments, notifications, and presence.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
import json
import logging

from database import get_db
from auth.auth import verify_token
from storage.communications import (
    create_message, get_messages, delete_message,
    get_or_create_conversation, create_direct_message, get_conversation_messages,
    mark_messages_as_read, get_user_conversations, get_unread_count,
    create_comment, get_resource_comments, get_comment_replies, delete_comment,
    create_notification, get_user_notifications, mark_notification_as_read,
    mark_all_notifications_as_read, get_unread_notification_count,
    update_user_presence, get_user_presence, get_all_online_users,
    create_mention, get_user_mentions,
    add_reaction, remove_reaction, get_reactions
)
from websocket_manager import ws_manager
from auth.auth import get_user_by_id
from storage.users import User

logger = logging.getLogger("fops.communications")

router = APIRouter(prefix="/api/communications", tags=["communications"])


def get_user_info(request: Request, db: Session = Depends(get_db)):
    """Extract user info from JWT token"""
    auth_header = request.headers.get("Authorization", "")
    
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    
    token = auth_header.split(" ")[1]
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = get_user_by_id(payload.get("user_id"))  # uses its own users.db session
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"user_id": user.id, "email": user.email, "name": user.full_name or user.email}


# ==================== GLOBAL CHAT ROUTES ====================

@router.get("/chat/messages")
def get_chat_messages(
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Get global chat messages"""
    messages = get_messages(db, limit=limit, offset=offset)
    
    return {
        "success": True,
        "messages": [
            {
                "id": m.id,
                "user_id": m.user_id,
                "user_name": m.user_name,
                "content": m.content,
                "is_system": m.is_system,
                "attachments": json.loads(m.attachments) if m.attachments else [],
                "created_at": m.created_at.isoformat(),
                "updated_at": m.updated_at.isoformat() if m.updated_at else None
            }
            for m in messages
        ],
        "count": len(messages)
    }


from pydantic import BaseModel

class MessageRequest(BaseModel):
    content: str
    attachments: Optional[List[str]] = None


@router.post("/chat/messages")
def post_message(
    body: MessageRequest,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Post a message to global chat"""
    content = body.content
    attachments = body.attachments
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="Message too long (max 5000 chars)")
    
    message = create_message(
        db,
        user_id=user_info["user_id"],
        user_name=user_info["name"],
        content=content,
        attachments=attachments
    )
    
    # Broadcast to all connected clients
    import asyncio
    asyncio.create_task(ws_manager.broadcast_message({
        "type": "message",
        "message": {
            "id": message.id,
            "user_id": message.user_id,
            "user_name": message.user_name,
            "content": message.content,
            "is_system": message.is_system,
            "created_at": message.created_at.isoformat()
        }
    }))
    
    return {
        "success": True,
        "message": {
            "id": message.id,
            "user_id": message.user_id,
            "user_name": message.user_name,
            "content": message.content,
            "created_at": message.created_at.isoformat()
        }
    }


# ==================== PRIVATE MESSAGES ROUTES ====================

@router.get("/conversations")
def get_conversations(
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Get all conversations for user"""
    conversations = get_user_conversations(db, user_info["user_id"])
    
    result = []
    for conv in conversations:
        other_user_id = conv.user2_id if conv.user1_id == user_info["user_id"] else conv.user1_id
        other_user = get_user_by_id(other_user_id, db)
        
        unread_count = get_unread_count(db, conv.id, user_info["user_id"])
        
        result.append({
            "id": conv.id,
            "other_user_id": other_user_id,
            "other_user_name": other_user.full_name or other_user.email if other_user else "Unknown",
            "last_message_at": conv.last_message_at.isoformat(),
            "unread_count": unread_count
        })
    
    return {
        "success": True,
        "conversations": result,
        "count": len(result)
    }


@router.get("/conversations/{other_user_id}/messages")
def get_dm_messages(
    other_user_id: int,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Get messages from a private conversation"""
    conversation = get_or_create_conversation(db, user_info["user_id"], other_user_id)
    
    # Mark as read
    mark_messages_as_read(db, conversation.id, user_info["user_id"])
    
    messages = get_conversation_messages(db, conversation.id, limit=limit, offset=offset)
    messages.reverse()  # Oldest first
    
    return {
        "success": True,
        "messages": [
            {
                "id": m.id,
                "sender_id": m.sender_id,
                "sender_name": m.sender_name,
                "content": m.content,
                "read": m.read,
                "created_at": m.created_at.isoformat()
            }
            for m in messages
        ],
        "count": len(messages)
    }


class DMRequest(BaseModel):
    content: str
    attachments: Optional[List[str]] = None


@router.post("/conversations/{other_user_id}/messages")
def send_dm(
    other_user_id: int,
    body: DMRequest,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Send a direct message"""
    content = body.content
    attachments = body.attachments
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="Message too long")
    
    # Verify recipient exists
    recipient = get_user_by_id(other_user_id)  # uses its own users.db session
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found")
    
    conversation = get_or_create_conversation(db, user_info["user_id"], other_user_id)
    
    message = create_direct_message(
        db,
        conversation.id,
        user_info["user_id"],
        user_info["name"],
        content,
        attachments
    )
    
    # Send notification to recipient
    import asyncio
    asyncio.create_task(ws_manager.send_notification(
        other_user_id,
        {
            "type": "direct_message",
            "title": f"Message from {user_info['name']}",
            "message": content[:100],
            "from_user_id": user_info["user_id"],
            "conversation_id": conversation.id
        }
    ))
    
    return {
        "success": True,
        "message": {
            "id": message.id,
            "sender_id": message.sender_id,
            "sender_name": message.sender_name,
            "content": message.content,
            "created_at": message.created_at.isoformat()
        }
    }


# ==================== COMMENTS ROUTES ====================

@router.get("/comments/{resource_type}/{resource_id}")
def get_comments(
    resource_type: str,
    resource_id: int,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Get comments on a resource"""
    comments = get_resource_comments(db, resource_type, resource_id)
    
    result = []
    for comment in comments:
        replies = get_comment_replies(db, comment.id)
        
        result.append({
            "id": comment.id,
            "user_id": comment.user_id,
            "user_name": comment.user_name,
            "content": comment.content,
            "created_at": comment.created_at.isoformat(),
            "reply_count": len(replies),
            "replies": [
                {
                    "id": r.id,
                    "user_id": r.user_id,
                    "user_name": r.user_name,
                    "content": r.content,
                    "created_at": r.created_at.isoformat()
                }
                for r in replies
            ]
        })
    
    return {
        "success": True,
        "comments": result,
        "count": len(result)
    }


@router.post("/comments/{resource_type}/{resource_id}")
def post_comment(
    resource_type: str,
    resource_id: int,
    content: str,
    parent_id: Optional[int] = None,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Post a comment on a resource"""
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="Comment too long")
    
    comment = create_comment(
        db,
        resource_type,
        resource_id,
        user_info["user_id"],
        user_info["name"],
        content,
        parent_id
    )
    
    return {
        "success": True,
        "comment": {
            "id": comment.id,
            "user_id": comment.user_id,
            "user_name": comment.user_name,
            "content": comment.content,
            "created_at": comment.created_at.isoformat()
        }
    }


# ==================== NOTIFICATIONS ROUTES ====================

@router.get("/notifications")
def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, le=100),
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Get user notifications"""
    notifications = get_user_notifications(db, user_info["user_id"], limit=limit, unread_only=unread_only)
    
    return {
        "success": True,
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "read": n.read,
                "created_at": n.created_at.isoformat()
            }
            for n in notifications
        ],
        "count": len(notifications),
        "unread": get_unread_notification_count(db, user_info["user_id"])
    }


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Mark notification as read"""
    mark_notification_as_read(db, notification_id)
    return {"success": True, "message": "Notification marked as read"}


@router.post("/notifications/read-all")
def mark_all_read(
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read"""
    mark_all_notifications_as_read(db, user_info["user_id"])
    return {"success": True, "message": "All notifications marked as read"}


# ==================== PRESENCE ROUTES ====================

@router.post("/presence")
def update_presence(
    status: str = "online",
    current_tool: Optional[str] = None,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Update user presence"""
    presence = update_user_presence(db, user_info["user_id"], status, current_tool)
    
    # Broadcast presence update
    import asyncio
    asyncio.create_task(ws_manager.broadcast_presence())
    
    return {
        "success": True,
        "presence": {
            "user_id": presence.user_id,
            "status": presence.status,
            "current_tool": presence.current_tool,
            "last_activity": presence.last_activity.isoformat()
        }
    }


@router.get("/presence/online")
def get_online_users(
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Get all online users"""
    online_users = get_all_online_users(db)
    
    return {
        "success": True,
        "online_users": [
            {
                "user_id": u.user_id,
                "status": u.status,
                "current_tool": u.current_tool,
                "last_activity": u.last_activity.isoformat()
            }
            for u in online_users
        ],
        "count": len(online_users)
    }


# ==================== REACTIONS ROUTES ====================

@router.post("/reactions/{target_type}/{target_id}")
def add_emoji_reaction(
    target_type: str,
    target_id: int,
    emoji: str,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Add emoji reaction to a message or comment"""
    if len(emoji) > 2:  # Basic validation
        raise HTTPException(status_code=400, detail="Invalid emoji")
    
    reaction = add_reaction(db, user_info["user_id"], target_type, target_id, emoji)
    
    return {
        "success": True,
        "reaction": {
            "user_id": reaction.user_id,
            "emoji": reaction.emoji,
            "created_at": reaction.created_at.isoformat()
        }
    }


@router.delete("/reactions/{target_type}/{target_id}")
def remove_emoji_reaction(
    target_type: str,
    target_id: int,
    emoji: str,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Remove emoji reaction"""
    success = remove_reaction(db, user_info["user_id"], target_type, target_id, emoji)
    
    if not success:
        raise HTTPException(status_code=404, detail="Reaction not found")
    
    return {"success": True, "message": "Reaction removed"}


@router.get("/reactions/{target_type}/{target_id}")
def get_target_reactions(
    target_type: str,
    target_id: int,
    user_info = Depends(get_user_info),
    db: Session = Depends(get_db)
):
    """Get all reactions on a target"""
    reactions = get_reactions(db, target_type, target_id)
    
    return {
        "success": True,
        "reactions": reactions
    }


# ==================== WEBSOCKET ENDPOINTS ====================

@router.websocket("/ws/chat/global")
async def websocket_global_chat(websocket: WebSocket):
    """WebSocket for global chat"""
    # TODO: Implement authentication for WebSocket
    try:
        await ws_manager.connect_global_chat(websocket)
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "message":
                # Broadcast to all
                await ws_manager.broadcast_message({
                    "type": "message",
                    "message": message
                })
            
            elif message["type"] == "typing":
                ws_manager.set_typing(message["user_id"], "global")
                
            elif message["type"] == "typing_stop":
                ws_manager.clear_typing(message["user_id"])
    
    except WebSocketDisconnect:
        await ws_manager.disconnect_global_chat(websocket)
        logger.info("Client disconnected from global chat")


@router.websocket("/ws/notifications/{user_id}")
async def websocket_notifications(websocket: WebSocket, user_id: int):
    """WebSocket for user notifications"""
    try:
        await ws_manager.connect_notifications(user_id, websocket)
        
        while True:
            # Keep connection alive, wait for messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    
    except WebSocketDisconnect:
        await ws_manager.disconnect_notifications(user_id, websocket)
        logger.info(f"User {user_id} disconnected from notifications")


@router.websocket("/ws/activity")
async def websocket_activity_stream(websocket: WebSocket):
    """WebSocket for activity stream"""
    try:
        await ws_manager.connect_activity_stream(websocket)
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    
    except WebSocketDisconnect:
        await ws_manager.disconnect_activity_stream(websocket)
        logger.info("Client disconnected from activity stream")
