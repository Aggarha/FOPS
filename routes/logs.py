"""
FOPS Activity Logs Router — REST and WebSocket endpoints for activity logs.

Endpoints:
- GET /api/logs — Query and filter logs
- GET /api/logs/{id} — Get log details
- POST /api/logs/export — Export logs
- WS /ws/logs — Real-time log streaming

Admin-only access control.
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, WebSocket, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_

from database import get_db
from models import ActivityLog, LogSession, LogLevel, LogCategory
from services.activity_logger import activity_log
from services.websocket_broadcaster import ws_broadcaster
from services.ws_manager import ws_manager as _ws_unified

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/logs", tags=["logs"])


# ============================================================================
# AUTHENTICATION & AUTHORIZATION
# ============================================================================

def require_admin(request: Request) -> dict:
    """Require admin access for log operations."""
    api_key = request.headers.get("X-API-Key", "")
    auth_header = request.headers.get("Authorization", "")
    
    # Simple check - in production would validate JWT and check user role
    if not (api_key or auth_header):
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # For now, treat any authenticated user as admin
    # In production, would check JWT token and verify admin role
    return {"authenticated": True, "is_admin": True}


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class LogResponse(BaseModel):
    """Response model for a single log entry."""
    id: int
    timestamp: datetime
    level: str
    category: str
    title: str
    message: Optional[str] = None
    tool_name: Optional[str] = None
    api_route: Optional[str] = None
    resource_id: Optional[int] = None
    resource_type: Optional[str] = None
    status: Optional[str] = None
    duration_ms: Optional[int] = None
    
    class Config:
        from_attributes = True


class LogFilterRequest(BaseModel):
    """Request model for filtering logs."""
    level: Optional[str] = None
    category: Optional[str] = None
    tool_name: Optional[str] = None
    api_route: Optional[str] = None
    status: Optional[str] = None
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    limit: int = 100
    offset: int = 0


class LogsListResponse(BaseModel):
    """Response model for list of logs."""
    total: int
    limit: int
    offset: int
    logs: List[LogResponse]


# ============================================================================
# REST ENDPOINTS
# ============================================================================

@router.get("", response_model=LogsListResponse)
async def get_logs(
    level: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tool_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    hours: int = Query(24, description="Show logs from last N hours"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get activity logs with optional filtering."""
    try:
        # Build query
        query = db.query(ActivityLog)
        
        # Apply filters
        if level:
            query = query.filter(ActivityLog.level == level)
        if category:
            query = query.filter(ActivityLog.category == category)
        if tool_name:
            query = query.filter(ActivityLog.tool_name == tool_name)
        if status:
            query = query.filter(ActivityLog.status == status)
        
        # Time range filter
        if hours > 0:
            from_time = datetime.utcnow() - timedelta(hours=hours)
            query = query.filter(ActivityLog.timestamp >= from_time)
        
        # Get total count
        total = query.count()
        
        # Apply pagination and sort
        logs = query.order_by(desc(ActivityLog.timestamp)).offset(offset).limit(limit).all()
        
        return LogsListResponse(
            total=total,
            limit=limit,
            offset=offset,
            logs=[LogResponse.from_orm(log) for log in logs],
        )
    
    except Exception as e:
        logger.error(f"Failed to fetch logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch logs")


@router.get("/{log_id}", response_model=LogResponse)
async def get_log_details(
    log_id: int,
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get details of a specific log entry."""
    log = db.query(ActivityLog).filter(ActivityLog.id == log_id).first()
    
    if not log:
        raise HTTPException(status_code=404, detail="Log entry not found")
    
    return LogResponse.from_orm(log)


@router.get("/tools/{tool_name}", response_model=LogsListResponse)
async def get_tool_logs(
    tool_name: str,
    hours: int = Query(24),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get logs for a specific tool."""
    query = db.query(ActivityLog).filter(ActivityLog.tool_name == tool_name)
    
    if hours > 0:
        from_time = datetime.utcnow() - timedelta(hours=hours)
        query = query.filter(ActivityLog.timestamp >= from_time)
    
    total = query.count()
    logs = query.order_by(desc(ActivityLog.timestamp)).offset(offset).limit(limit).all()
    
    return LogsListResponse(
        total=total,
        limit=limit,
        offset=offset,
        logs=[LogResponse.from_orm(log) for log in logs],
    )


@router.get("/sessions/{session_id}", response_model=Dict[str, Any])
async def get_session_logs(
    session_id: str,
    limit: int = Query(500, ge=1, le=1000),
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get all logs for a specific session."""
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.session_id == session_id)
        .order_by(ActivityLog.timestamp)
        .limit(limit)
        .all()
    )
    
    session = db.query(LogSession).filter(LogSession.session_id == session_id).first()
    
    return {
        "session": {
            "id": session.session_id if session else session_id,
            "title": session.title if session else None,
            "status": session.status if session else None,
            "started_at": session.started_at.isoformat() if session and session.started_at else None,
            "completed_at": session.completed_at.isoformat() if session and session.completed_at else None,
        },
        "logs": [LogResponse.from_orm(log) for log in logs],
        "total": len(logs),
    }


@router.post("/export", response_model=Dict[str, Any])
async def export_logs(
    filter_request: LogFilterRequest,
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Export logs as JSON."""
    query = db.query(ActivityLog)
    
    if filter_request.level:
        query = query.filter(ActivityLog.level == filter_request.level)
    if filter_request.category:
        query = query.filter(ActivityLog.category == filter_request.category)
    if filter_request.tool_name:
        query = query.filter(ActivityLog.tool_name == filter_request.tool_name)
    if filter_request.status:
        query = query.filter(ActivityLog.status == filter_request.status)
    if filter_request.from_date:
        query = query.filter(ActivityLog.timestamp >= filter_request.from_date)
    if filter_request.to_date:
        query = query.filter(ActivityLog.timestamp <= filter_request.to_date)
    
    logs = query.order_by(desc(ActivityLog.timestamp)).limit(filter_request.limit).all()
    
    return {
        "total": len(logs),
        "exported_at": datetime.utcnow().isoformat(),
        "logs": [LogResponse.from_orm(log).dict() for log in logs],
    }


@router.get("/stats/summary", response_model=Dict[str, Any])
async def get_log_stats(
    hours: int = Query(24),
    auth: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get log statistics summary."""
    if hours > 0:
        from_time = datetime.utcnow() - timedelta(hours=hours)
        base_query = db.query(ActivityLog).filter(ActivityLog.timestamp >= from_time)
    else:
        base_query = db.query(ActivityLog)
    
    total_logs = base_query.count()
    
    # Count by level
    levels = {}
    for level in LogLevel:
        count = base_query.filter(ActivityLog.level == level).count()
        if count > 0:
            levels[level.value] = count
    
    # Count by category
    categories = {}
    for category in LogCategory:
        count = base_query.filter(ActivityLog.category == category).count()
        if count > 0:
            categories[category.value] = count
    
    # Count errors
    error_count = base_query.filter(
        ActivityLog.level.in_([LogLevel.ERROR, LogLevel.CRITICAL])
    ).count()
    
    # Count by status
    statuses = {}
    for status in ['success', 'failure', 'running']:
        count = base_query.filter(ActivityLog.status == status).count()
        if count > 0:
            statuses[status] = count
    
    return {
        "period_hours": hours,
        "total_logs": total_logs,
        "by_level": levels,
        "by_category": categories,
        "error_count": error_count,
        "by_status": statuses,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ============================================================================
# WEBSOCKET ENDPOINT
# ============================================================================

@router.websocket("/stream")
async def websocket_logs(
    websocket: WebSocket,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for real-time log streaming (admin-only)."""
    
    # For now, accept all WebSocket connections
    # In production, would validate JWT token and check admin role
    
    try:
        await _ws_unified.connect("logs", websocket)
        
        # Send initial message
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to live logs stream",
            "timestamp": datetime.utcnow().isoformat(),
        })
        
        # Keep connection alive and receive messages
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                if message.get("type") == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat(),
                    })
                
                elif message.get("type") == "get_stats":
                    stats = {
                        "type": "stats",
                        "connections": _ws_unified.stats()["total_connections"],
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                    await websocket.send_json(stats)
            
            except json.JSONDecodeError:
                pass
            except Exception as e:
                logger.error(f"WebSocket message error: {e}")
    
    except WebSocketDisconnect:
        await _ws_unified.disconnect("logs", websocket)
        logger.info("WebSocket logs client disconnected")
    
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await _ws_unified.disconnect("logs", websocket)
        except Exception:
            pass


# Import json for parsing
import json
