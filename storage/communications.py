"""
CRUD operations for FOPS Communication System
Handles messages, conversations, comments, notifications, etc.
"""

from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_
from datetime import datetime
from typing import List, Optional
import json

from models import (
    Message, Conversation, DirectMessage, Comment,
    Notification, UserPresence, Mention, Reaction
)


# ==================== MESSAGE OPERATIONS ====================

def create_message(
    db: Session,
    user_id: int,
    user_name: str,
    content: str,
    is_system: bool = False,
    attachments: Optional[List[str]] = None
) -> Message:
    """Create a new global chat message"""
    attachments_json = json.dumps(attachments) if attachments else None
    
    message = Message(
        user_id=user_id,
        user_name=user_name,
        content=content,
        is_system=is_system,
        attachments=attachments_json
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def get_messages(
    db: Session,
    limit: int = 50,
    offset: int = 0,
    since: Optional[datetime] = None
) -> List[Message]:
    """Get global chat messages"""
    query = db.query(Message)
    
    if since:
        query = query.filter(Message.created_at > since)
    
    return query.order_by(desc(Message.created_at)).limit(limit).offset(offset).all()


def delete_message(db: Session, message_id: int) -> bool:
    """Delete a message (own or admin)"""
    message = db.query(Message).filter(Message.id == message_id).first()
    if message:
        db.delete(message)
        db.commit()
        return True
    return False


# ==================== CONVERSATION OPERATIONS ====================

def get_or_create_conversation(
    db: Session,
    user1_id: int,
    user2_id: int
) -> Conversation:
    """Get existing conversation or create new one"""
    # Ensure consistent ordering
    if user1_id > user2_id:
        user1_id, user2_id = user2_id, user1_id
    
    conversation = db.query(Conversation).filter(
        and_(
            Conversation.user1_id == user1_id,
            Conversation.user2_id == user2_id
        )
    ).first()
    
    if not conversation:
        conversation = Conversation(user1_id=user1_id, user2_id=user2_id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
    
    return conversation


def create_direct_message(
    db: Session,
    conversation_id: int,
    sender_id: int,
    sender_name: str,
    content: str,
    attachments: Optional[List[str]] = None
) -> DirectMessage:
    """Create a direct message"""
    attachments_json = json.dumps(attachments) if attachments else None
    
    message = DirectMessage(
        conversation_id=conversation_id,
        sender_id=sender_id,
        sender_name=sender_name,
        content=content,
        attachments=attachments_json
    )
    db.add(message)
    
    # Update conversation's last message time
    conversation = db.query(Conversation).get(conversation_id)
    if conversation:
        conversation.last_message_at = datetime.utcnow()
    
    db.commit()
    db.refresh(message)
    return message


def get_conversation_messages(
    db: Session,
    conversation_id: int,
    limit: int = 50,
    offset: int = 0
) -> List[DirectMessage]:
    """Get messages from a conversation"""
    return db.query(DirectMessage).filter(
        DirectMessage.conversation_id == conversation_id
    ).order_by(desc(DirectMessage.created_at)).limit(limit).offset(offset).all()


def mark_messages_as_read(db: Session, conversation_id: int, reader_id: int):
    """Mark all messages in conversation as read by user"""
    db.query(DirectMessage).filter(
        and_(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.sender_id != reader_id,
            DirectMessage.read == False
        )
    ).update({DirectMessage.read: True})
    db.commit()


def get_user_conversations(
    db: Session,
    user_id: int,
    limit: int = 50
) -> List[Conversation]:
    """Get all conversations for a user"""
    return db.query(Conversation).filter(
        or_(
            Conversation.user1_id == user_id,
            Conversation.user2_id == user_id
        )
    ).order_by(desc(Conversation.last_message_at)).limit(limit).all()


def get_unread_count(db: Session, conversation_id: int, reader_id: int) -> int:
    """Get unread message count in conversation"""
    return db.query(DirectMessage).filter(
        and_(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.sender_id != reader_id,
            DirectMessage.read == False
        )
    ).count()


# ==================== COMMENT OPERATIONS ====================

def create_comment(
    db: Session,
    resource_type: str,
    resource_id: int,
    user_id: int,
    user_name: str,
    content: str,
    parent_id: Optional[int] = None
) -> Comment:
    """Create a comment on a resource"""
    comment = Comment(
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        user_name=user_name,
        content=content,
        parent_id=parent_id
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def get_resource_comments(
    db: Session,
    resource_type: str,
    resource_id: int,
    limit: int = 100
) -> List[Comment]:
    """Get all comments on a resource"""
    return db.query(Comment).filter(
        and_(
            Comment.resource_type == resource_type,
            Comment.resource_id == resource_id,
            Comment.parent_id == None  # Only top-level comments
        )
    ).order_by(desc(Comment.created_at)).limit(limit).all()


def get_comment_replies(db: Session, parent_id: int) -> List[Comment]:
    """Get replies to a comment"""
    return db.query(Comment).filter(
        Comment.parent_id == parent_id
    ).order_by(Comment.created_at).all()


def delete_comment(db: Session, comment_id: int) -> bool:
    """Delete a comment and its replies"""
    comment = db.query(Comment).get(comment_id)
    if comment:
        # Delete replies
        db.query(Comment).filter(Comment.parent_id == comment_id).delete()
        # Delete comment
        db.delete(comment)
        db.commit()
        return True
    return False


# ==================== NOTIFICATION OPERATIONS ====================

def create_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    related_user_id: Optional[int] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None
) -> Notification:
    """Create a notification"""
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        related_user_id=related_user_id,
        resource_type=resource_type,
        resource_id=resource_id
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def get_user_notifications(
    db: Session,
    user_id: int,
    limit: int = 50,
    unread_only: bool = False
) -> List[Notification]:
    """Get notifications for user"""
    query = db.query(Notification).filter(Notification.user_id == user_id)
    
    if unread_only:
        query = query.filter(Notification.read == False)
    
    return query.order_by(desc(Notification.created_at)).limit(limit).all()


def mark_notification_as_read(db: Session, notification_id: int):
    """Mark notification as read"""
    notification = db.query(Notification).get(notification_id)
    if notification:
        notification.read = True
        notification.read_at = datetime.utcnow()
        db.commit()


def mark_all_notifications_as_read(db: Session, user_id: int):
    """Mark all notifications as read for user"""
    db.query(Notification).filter(
        and_(
            Notification.user_id == user_id,
            Notification.read == False
        )
    ).update({
        Notification.read: True,
        Notification.read_at: datetime.utcnow()
    })
    db.commit()


def get_unread_notification_count(db: Session, user_id: int) -> int:
    """Get unread notification count for user"""
    return db.query(Notification).filter(
        and_(
            Notification.user_id == user_id,
            Notification.read == False
        )
    ).count()


# ==================== USER PRESENCE OPERATIONS ====================

def update_user_presence(
    db: Session,
    user_id: int,
    status: str = "online",
    current_tool: Optional[str] = None
) -> UserPresence:
    """Update or create user presence"""
    presence = db.query(UserPresence).filter(
        UserPresence.user_id == user_id
    ).first()
    
    if presence:
        presence.status = status
        presence.last_activity = datetime.utcnow()
        if current_tool:
            presence.current_tool = current_tool
    else:
        presence = UserPresence(
            user_id=user_id,
            status=status,
            current_tool=current_tool
        )
        db.add(presence)
    
    db.commit()
    db.refresh(presence)
    return presence


def get_user_presence(db: Session, user_id: int) -> Optional[UserPresence]:
    """Get user presence"""
    return db.query(UserPresence).filter(
        UserPresence.user_id == user_id
    ).first()


def get_all_online_users(db: Session) -> List[UserPresence]:
    """Get all online users"""
    return db.query(UserPresence).filter(
        UserPresence.status != "offline"
    ).all()


# ==================== MENTION OPERATIONS ====================

def create_mention(
    db: Session,
    mentioned_user_id: int,
    source_type: str,
    source_id: int,
    mentioned_in_content: Optional[str] = None
) -> Mention:
    """Create a mention record"""
    mention = Mention(
        mentioned_user_id=mentioned_user_id,
        source_type=source_type,
        source_id=source_id,
        mentioned_in_content=mentioned_in_content
    )
    db.add(mention)
    db.commit()
    db.refresh(mention)
    return mention


def get_user_mentions(
    db: Session,
    user_id: int,
    limit: int = 50
) -> List[Mention]:
    """Get mentions of a user"""
    return db.query(Mention).filter(
        Mention.mentioned_user_id == user_id
    ).order_by(desc(Mention.created_at)).limit(limit).all()


# ==================== REACTION OPERATIONS ====================

def add_reaction(
    db: Session,
    user_id: int,
    target_type: str,
    target_id: int,
    emoji: str
) -> Reaction:
    """Add emoji reaction"""
    # Check if already exists
    existing = db.query(Reaction).filter(
        and_(
            Reaction.user_id == user_id,
            Reaction.target_type == target_type,
            Reaction.target_id == target_id,
            Reaction.emoji == emoji
        )
    ).first()
    
    if existing:
        return existing
    
    reaction = Reaction(
        user_id=user_id,
        target_type=target_type,
        target_id=target_id,
        emoji=emoji
    )
    db.add(reaction)
    db.commit()
    db.refresh(reaction)
    return reaction


def remove_reaction(
    db: Session,
    user_id: int,
    target_type: str,
    target_id: int,
    emoji: str
) -> bool:
    """Remove emoji reaction"""
    reaction = db.query(Reaction).filter(
        and_(
            Reaction.user_id == user_id,
            Reaction.target_type == target_type,
            Reaction.target_id == target_id,
            Reaction.emoji == emoji
        )
    ).first()
    
    if reaction:
        db.delete(reaction)
        db.commit()
        return True
    return False


def get_reactions(
    db: Session,
    target_type: str,
    target_id: int
) -> dict:
    """Get all reactions for a target, grouped by emoji"""
    reactions = db.query(Reaction).filter(
        and_(
            Reaction.target_type == target_type,
            Reaction.target_id == target_id
        )
    ).all()
    
    result = {}
    for reaction in reactions:
        if reaction.emoji not in result:
            result[reaction.emoji] = []
        result[reaction.emoji].append(reaction.user_id)
    
    return result
