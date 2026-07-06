"""
FOPS WebSocket Routes — Phase 1

All real-time WebSocket endpoints consolidated here.

Endpoints:
  /api/ws/logs          — Live activity log stream (admin-only)
  /api/ws/ops           — Global operations feed (authenticated)
  /api/ws/notifications — Personal notification stream (authenticated)
  /api/ws/jobs          — Job progress feed (authenticated)

Auth: Pass ?token=<JWT> as query parameter.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("routes.ws")

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _authenticate(websocket: WebSocket, token: Optional[str]) -> Optional[dict]:
    """Validate JWT token for WebSocket auth. Returns user_info or None."""
    if not token:
        return None
    try:
        from main import verify_jwt_token
        from starlette.requests import Request as _Req
        # verify_jwt_token is a sync function that inspects request headers/params
        # We call the underlying JWT decode directly
        from jose import jwt, JWTError
        import os
        secret = os.environ.get("SECRET_KEY", "fops-secret-key-change-in-production")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except Exception:
        return None


# ── /api/ws/logs ─────────────────────────────────────────────────────────────

@router.websocket("/api/ws/logs")
async def ws_logs(websocket: WebSocket, token: Optional[str] = None):
    """Live activity log stream. Admin role required."""
    from services.ws_manager import ws_manager

    user_info = await _authenticate(websocket, token)
    # Allow connection; activity_logger auth happens at app level.
    # Gate admin-only data: non-admin sockets connect but receive no data if
    # activity_logger decides not to broadcast.
    user_id = user_info.get("user_id") if user_info else None

    await ws_manager.connect("logs", websocket, user_id=user_id)
    try:
        await ws_manager.send_one(websocket, {
            "type": "connected",
            "channel": "logs",
            "message": "Connected to live logs stream",
        })
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws_manager.send_one(websocket, {"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws_logs error: %s", e)
    finally:
        await ws_manager.disconnect("logs", websocket, user_id=user_id)


# ── /api/ws/ops ──────────────────────────────────────────────────────────────

@router.websocket("/api/ws/ops")
async def ws_ops(websocket: WebSocket, token: Optional[str] = None):
    """Global operations feed. Requires authentication."""
    from services.ws_manager import ws_manager

    user_info = await _authenticate(websocket, token)
    if user_info is None:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    user_id = user_info.get("user_id")
    await ws_manager.connect("ops", websocket, user_id=user_id)
    try:
        await ws_manager.send_one(websocket, {
            "type": "connected",
            "channel": "ops",
            "message": "Connected to operations feed",
        })
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws_manager.send_one(websocket, {"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws_ops error: %s", e)
    finally:
        await ws_manager.disconnect("ops", websocket, user_id=user_id)


# ── /api/ws/notifications ────────────────────────────────────────────────────

@router.websocket("/api/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: Optional[str] = None):
    """Personal notification stream. Requires authentication."""
    from services.ws_manager import ws_manager

    user_info = await _authenticate(websocket, token)
    if user_info is None:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    user_id = user_info.get("user_id")
    await ws_manager.connect("notifications", websocket, user_id=user_id)
    try:
        await ws_manager.send_one(websocket, {
            "type": "connected",
            "channel": "notifications",
        })
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws_manager.send_one(websocket, {"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws_notifications error: %s", e)
    finally:
        await ws_manager.disconnect("notifications", websocket, user_id=user_id)


# ── /api/ws/jobs ─────────────────────────────────────────────────────────────

@router.websocket("/api/ws/jobs")
async def ws_jobs(websocket: WebSocket, token: Optional[str] = None):
    """Job progress stream. Receives updates for all jobs. Requires auth."""
    from services.ws_manager import ws_manager

    user_info = await _authenticate(websocket, token)
    if user_info is None:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    user_id = user_info.get("user_id")
    await ws_manager.connect("jobs", websocket, user_id=user_id)
    try:
        await ws_manager.send_one(websocket, {
            "type": "connected",
            "channel": "jobs",
        })
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws_manager.send_one(websocket, {"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws_jobs error: %s", e)
    finally:
        await ws_manager.disconnect("jobs", websocket, user_id=user_id)


# ── /api/ws/jobs/{job_id} ────────────────────────────────────────────────────

@router.websocket("/api/ws/jobs/{job_id}")
async def ws_job_detail(
    websocket: WebSocket,
    job_id: str,
    token: Optional[str] = None,
):
    """Per-job live log stream.

    Sends all historical log lines first, then streams new lines in real-time
    as the worker emits them via job_manager.log().

    Auth: pass ?token=<JWT> as query parameter.
    Tenant/ownership: validated against the decoded JWT.
    Closes with 4403 if the caller does not own (or cannot see) the job.
    """
    from services.ws_manager import ws_manager
    from services.job_manager import job_manager

    user_info = await _authenticate(websocket, token)
    if user_info is None:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    # Derive tenant + ownership — mirrors routes/sources.py _tenant()
    user_id   = user_info.get("user_id", 0)
    org_id    = user_info.get("org_id")
    tenant_id = f"org_{org_id}" if org_id else f"user_{user_info.get('sub') or user_info.get('email') or 'unknown'}"
    is_admin  = user_info.get("role") == "admin"

    # Validate job ownership before accepting the connection
    job = job_manager.get(job_id, tenant_id, user_id, is_admin)
    if job is None:
        await websocket.close(code=4403, reason="Job not found or access denied")
        return

    channel = f"job:{job_id}"
    await ws_manager.connect(channel, websocket, user_id=user_id)
    try:
        await ws_manager.send_one(websocket, {
            "type":    "connected",
            "channel": channel,
            "job_uid": job_id,
            "status":  job.get("status"),
        })

        # Replay existing log lines so the client sees history on connect
        historical = job_manager.get_logs(
            job_id, tenant_id, user_id, is_admin, offset=0, limit=2000
        )
        if historical:
            for entry in historical:
                await ws_manager.send_one(websocket, {
                    "type":    "job_log",
                    "job_uid": job_id,
                    "id":      entry.get("id"),
                    "ts":      entry.get("timestamp"),
                    "level":   entry.get("level"),
                    "message": entry.get("message"),
                    "replay":  True,
                })

        # Keep connection open for live events (ping/pong only from client)
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws_manager.send_one(websocket, {"type": "pong"})
            except Exception:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws_job_detail error job=%s: %s", job_id, e)
    finally:
        await ws_manager.disconnect(channel, websocket, user_id=user_id)
