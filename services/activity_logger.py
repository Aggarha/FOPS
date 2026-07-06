"""
FOPS Activity Logging Service — Centralized logging for all operations.

Features:
- Structured logging with levels and categories
- Session grouping for related operations
- Real-time WebSocket broadcasting
- Persistent database storage
- Performance metrics tracking
- Admin-only visibility control
- Async-safe logging

Usage:
    from services.activity_logger import activity_log
    
    activity_log.info(
        title="Audio Match started",
        tool_name="audio-match",
        resource_id=release_id,
        metadata={"song": "Qusad Einy", "artist": "Amr Diab"}
    )
"""

import logging
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from sqlalchemy.orm import Session
from models import ActivityLog, LogSession, LogLevel, LogCategory
from database import SessionLocal

logger = logging.getLogger(__name__)

# Global WebSocket broadcaster (will be injected by main.py)
_ws_broadcaster = None


def set_ws_broadcaster(broadcaster):
    """Inject the WebSocket broadcaster instance."""
    global _ws_broadcaster
    _ws_broadcaster = broadcaster


class ActivityLogger:
    """Centralized activity logger for FOPS."""

    def __init__(self):
        self.current_session: Optional[str] = None

    def _create_log_entry(
        self,
        db: Session,
        level: LogLevel,
        category: LogCategory,
        title: str,
        message: Optional[str] = None,
        tool_name: Optional[str] = None,
        api_route: Optional[str] = None,
        resource_id: Optional[int] = None,
        resource_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        duration_ms: Optional[int] = None,
        status: Optional[str] = None,
        error_message: Optional[str] = None,
        user_id: Optional[int] = None,
        is_admin_only: bool = False,
    ) -> ActivityLog:
        """Create and save a log entry to database."""
        
        # Serialize metadata to JSON if provided
        metadata_json = None
        if metadata:
            try:
                metadata_json = json.dumps(metadata, default=str)
            except Exception as e:
                logger.error(f"Failed to serialize metadata: {e}")
                metadata_json = str(metadata)
        
        log_entry = ActivityLog(
            timestamp=datetime.utcnow(),
            user_id=user_id,
            session_id=self.current_session,
            level=level,
            category=category,
            title=title,
            message=message,
            tool_name=tool_name,
            api_route=api_route,
            resource_id=resource_id,
            resource_type=resource_type,
            event_metadata=metadata_json,
            duration_ms=duration_ms,
            status=status,
            error_message=error_message,
            is_admin_only=is_admin_only,
        )
        
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        
        return log_entry

    async def _broadcast_log(self, log_entry: ActivityLog):
        """Broadcast log entry to connected WebSocket clients."""
        if not _ws_broadcaster:
            return
        
        # Convert log to dict for JSON serialization
        log_dict = {
            "id": log_entry.id,
            "timestamp": log_entry.timestamp.isoformat() if log_entry.timestamp else None,
            "level": log_entry.level.value if log_entry.level else "INFO",
            "category": log_entry.category.value if log_entry.category else "SYSTEM",
            "title": log_entry.title,
            "message": log_entry.message,
            "tool_name": log_entry.tool_name,
            "api_route": log_entry.api_route,
            "duration_ms": log_entry.duration_ms,
            "status": log_entry.status,
            "error_message": log_entry.error_message,
        }
        
        try:
            await _ws_broadcaster.broadcast("logs", log_dict)
        except Exception as e:
            logger.error(f"Failed to broadcast log: {e}")

    def log(
        self,
        level: LogLevel,
        category: LogCategory,
        title: str,
        message: Optional[str] = None,
        tool_name: Optional[str] = None,
        api_route: Optional[str] = None,
        resource_id: Optional[int] = None,
        resource_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        duration_ms: Optional[int] = None,
        status: Optional[str] = None,
        error_message: Optional[str] = None,
        user_id: Optional[int] = None,
        is_admin_only: bool = False,
        broadcast: bool = True,
    ):
        """Log an activity event."""
        try:
            db = SessionLocal()
            try:
                log_entry = self._create_log_entry(
                    db=db,
                    level=level,
                    category=category,
                    title=title,
                    message=message,
                    tool_name=tool_name,
                    api_route=api_route,
                    resource_id=resource_id,
                    resource_type=resource_type,
                    metadata=metadata,
                    duration_ms=duration_ms,
                    status=status,
                    error_message=error_message,
                    user_id=user_id,
                    is_admin_only=is_admin_only,
                )
                
                # Log to Python logger
                log_msg = f"[{level.value}] {category.value} — {title}"
                if message:
                    log_msg += f": {message}"
                
                if level == LogLevel.ERROR or level == LogLevel.CRITICAL:
                    logger.error(log_msg)
                elif level == LogLevel.WARNING:
                    logger.warning(log_msg)
                else:
                    logger.info(log_msg)
                
                # Broadcast to WebSocket clients if enabled
                if broadcast and _ws_broadcaster:
                    import asyncio
                    try:
                        asyncio.create_task(self._broadcast_log(log_entry))
                    except RuntimeError:
                        # No event loop in current thread
                        pass
                
                return log_entry
                
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to log activity: {e}")
            return None

    # Convenience methods for each level/category combo
    
    def info(self, title: str, **kwargs):
        """Log an info level event."""
        category = kwargs.pop("category", LogCategory.SYSTEM)
        return self.log(LogLevel.INFO, category, title=title, **kwargs)

    def warning(self, title: str, **kwargs):
        """Log a warning level event."""
        category = kwargs.pop("category", LogCategory.SYSTEM)
        return self.log(LogLevel.WARNING, category, title=title, **kwargs)

    def error(self, title: str, **kwargs):
        """Log an error level event."""
        category = kwargs.pop("category", LogCategory.SYSTEM)
        return self.log(LogLevel.ERROR, category, title=title, **kwargs)

    def success(self, title: str, **kwargs):
        """Log a success level event."""
        category = kwargs.pop("category", LogCategory.SYSTEM)
        return self.log(LogLevel.SUCCESS, category, title=title, **kwargs)
    
    def api_call(self, title: str, **kwargs):
        """Log an API call."""
        kwargs.pop("category", None)
        return self.log(LogLevel.INFO, LogCategory.API, title=title, **kwargs)
    
    def tool_start(self, tool_name: str, title: str, **kwargs):
        """Log a tool execution start."""
        kwargs.pop("category", None)
        return self.log(
            LogLevel.INFO,
            LogCategory.TOOL,
            title=title,
            tool_name=tool_name,
            status="running",
            **kwargs
        )
    
    def tool_complete(
        self,
        tool_name: str,
        title: str,
        duration_ms: Optional[int] = None,
        **kwargs
    ):
        """Log a tool execution completion."""
        kwargs.pop("category", None)
        return self.log(
            LogLevel.SUCCESS,
            LogCategory.TOOL,
            title=title,
            tool_name=tool_name,
            status="success",
            duration_ms=duration_ms,
            **kwargs
        )
    
    def tool_error(
        self,
        tool_name: str,
        title: str,
        error_message: str,
        **kwargs
    ):
        """Log a tool execution error."""
        kwargs.pop("category", None)
        return self.log(
            LogLevel.ERROR,
            LogCategory.TOOL,
            title=title,
            tool_name=tool_name,
            status="failure",
            error_message=error_message,
            **kwargs
        )
    
    def system_event(self, title: str, **kwargs):
        """Log a system event."""
        kwargs.pop("category", None)
        return self.log(LogLevel.INFO, LogCategory.SYSTEM, title=title, **kwargs)
    
    def google_sheets_event(self, title: str, **kwargs):
        """Log a Google Sheets operation."""
        kwargs.pop("category", None)
        return self.log(LogLevel.INFO, LogCategory.GOOGLE_SHEETS, title=title, **kwargs)
    
    def background_job(self, title: str, **kwargs):
        """Log a background job event."""
        kwargs.pop("category", None)
        return self.log(LogLevel.INFO, LogCategory.BACKGROUND, title=title, **kwargs)
    
    # Session management
    
    def start_session(
        self,
        title: str,
        description: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> str:
        """Start a new execution session."""
        session_id = str(uuid.uuid4())
        self.current_session = session_id
        
        try:
            db = SessionLocal()
            try:
                session = LogSession(
                    session_id=session_id,
                    user_id=user_id,
                    title=title,
                    description=description,
                    status="running",
                )
                db.add(session)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to start session: {e}")
        
        return session_id
    
    def end_session(self, session_id: Optional[str] = None):
        """End an execution session."""
        sid = session_id or self.current_session
        if not sid:
            return
        
        try:
            db = SessionLocal()
            try:
                session = db.query(LogSession).filter_by(session_id=sid).first()
                if session:
                    session.status = "completed"
                    session.completed_at = datetime.utcnow()
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to end session: {e}")
        
        if session_id is None:
            self.current_session = None
    
    @asynccontextmanager
    async def session(
        self,
        title: str,
        description: Optional[str] = None,
        user_id: Optional[int] = None,
    ):
        """Context manager for session tracking."""
        session_id = self.start_session(title, description, user_id)
        try:
            yield session_id
        finally:
            self.end_session(session_id)


# Global logger instance
activity_log = ActivityLogger()
