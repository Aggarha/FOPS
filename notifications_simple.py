"""
Enterprise notification system — SQLite-backed with priority, grouping, and broadcast.
"""
from typing import Dict, Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import sessionmaker, declarative_base
import json, uuid, logging

logger = logging.getLogger("fops.notifications")
router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# ── DB ─────────────────────────────────────────────────────────────────────────
Base = declarative_base()
engine = create_engine("sqlite:///./notifications.db", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)

class DBNotification(Base):
    __tablename__ = "notifications"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(String, nullable=False, index=True)
    title       = Column(String, nullable=False, default="Notification")
    message     = Column(Text, nullable=False)
    type        = Column(String, default="info")   # info | success | warning | danger
    priority    = Column(String, default="normal") # low | normal | high | urgent
    group_key   = Column(String, nullable=True)    # optional grouping key
    data        = Column(Text, nullable=True)      # JSON extra data
    read        = Column(Boolean, default=False)
    read_at     = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)


# ── Auth helper ─────────────────────────────────────────────────────────────────
def get_user_id_from_token(authorization: Optional[str] = Header(None)) -> str:
    from auth.auth import verify_token
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    try:
        token = authorization.split(" ")[1]
        payload = verify_token(token)
        if payload:
            return str(payload.get("user_id", "unknown"))
    except Exception:
        pass
    raise HTTPException(status_code=401, detail="Invalid token")


def _notif_to_dict(n: DBNotification) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "message": n.message,
        "type": n.type,
        "priority": n.priority,
        "group_key": n.group_key,
        "data": json.loads(n.data) if n.data else None,
        "read": n.read,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "timestamp": n.created_at.isoformat(),
    }


# ── Routes ──────────────────────────────────────────────────────────────────────

@router.get("")
def get_notifications(
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
    authorization: Optional[str] = Header(None)
):
    """Get user's notifications, sorted newest first, with grouping summary."""
    user_id = get_user_id_from_token(authorization)
    db = Session()
    try:
        q = db.query(DBNotification).filter(DBNotification.user_id == user_id)
        if unread_only:
            q = q.filter(DBNotification.read == False)
        q = q.order_by(DBNotification.created_at.desc())
        total = q.count()
        notifs = q.offset(offset).limit(limit).all()
        unread = db.query(DBNotification).filter(
            DBNotification.user_id == user_id,
            DBNotification.read == False
        ).count()

        # Group summary
        groups: Dict[str, List] = {}
        for n in notifs:
            key = n.group_key or "__ungrouped__"
            groups.setdefault(key, []).append(_notif_to_dict(n))

        return {
            "success": True,
            "notifications": [_notif_to_dict(n) for n in notifs],
            "groups": {k: v for k, v in groups.items() if k != "__ungrouped__"},
            "count": total,
            "unread": unread,
        }
    finally:
        db.close()


@router.post("/add")
def add_notification(
    title: str,
    message: str,
    type: str = "info",
    priority: str = "normal",
    group_key: Optional[str] = None,
    data: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """Add a notification for the current user."""
    user_id = get_user_id_from_token(authorization)
    db = Session()
    try:
        n = DBNotification(
            user_id=user_id, title=title, message=message,
            type=type, priority=priority, group_key=group_key, data=data,
        )
        db.add(n)
        db.commit()
        db.refresh(n)
        return {"success": True, "notification": _notif_to_dict(n)}
    finally:
        db.close()


@router.post("/broadcast")
def broadcast_notification(
    title: str,
    message: str,
    type: str = "info",
    priority: str = "normal",
    group_key: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """Send a notification to ALL users (admin only)."""
    user_id = get_user_id_from_token(authorization)
    # Only allow admin (user_id 1 or role check via token)
    from auth.auth import verify_token
    token = (authorization or "").split(" ")[-1] if authorization else ""
    from auth.auth import verify_token
    payload = verify_token(token)
    if not payload or payload.get("role") not in ("admin",):
        raise HTTPException(status_code=403, detail="Admin only")

    # Get all user IDs from users.db
    from storage.users import SessionLocal as UsersSession, User
    usess = UsersSession()
    try:
        user_ids = [str(u.id) for u in usess.query(User).all()]
    finally:
        usess.close()

    db = Session()
    try:
        created = 0
        for uid in user_ids:
            n = DBNotification(
                user_id=uid, title=title, message=message,
                type=type, priority=priority, group_key=group_key,
            )
            db.add(n)
            created += 1
        db.commit()
        return {"success": True, "sent_to": created}
    finally:
        db.close()


@router.post("/read/{notif_id}")
def mark_as_read(notif_id: int, authorization: Optional[str] = Header(None)):
    """Mark one notification as read."""
    user_id = get_user_id_from_token(authorization)
    db = Session()
    try:
        n = db.query(DBNotification).filter(
            DBNotification.id == notif_id,
            DBNotification.user_id == user_id
        ).first()
        if n:
            n.read = True
            n.read_at = datetime.utcnow()
            db.commit()
        return {"success": True}
    finally:
        db.close()


@router.post("/read-all")
def mark_all_read(authorization: Optional[str] = Header(None)):
    """Mark all notifications as read."""
    user_id = get_user_id_from_token(authorization)
    db = Session()
    try:
        db.query(DBNotification).filter(
            DBNotification.user_id == user_id,
            DBNotification.read == False
        ).update({"read": True, "read_at": datetime.utcnow()})
        db.commit()
        return {"success": True}
    finally:
        db.close()


@router.delete("/{notif_id}")
def delete_notification(notif_id: int, authorization: Optional[str] = Header(None)):
    """Delete a notification."""
    user_id = get_user_id_from_token(authorization)
    db = Session()
    try:
        db.query(DBNotification).filter(
            DBNotification.id == notif_id,
            DBNotification.user_id == user_id
        ).delete()
        db.commit()
        return {"success": True}
    finally:
        db.close()


@router.delete("")
def clear_read_notifications(authorization: Optional[str] = Header(None)):
    """Delete all read notifications for the current user."""
    user_id = get_user_id_from_token(authorization)
    db = Session()
    try:
        deleted = db.query(DBNotification).filter(
            DBNotification.user_id == user_id,
            DBNotification.read == True
        ).delete()
        db.commit()
        return {"success": True, "deleted": deleted}
    finally:
        db.close()


