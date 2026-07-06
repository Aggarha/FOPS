import logging
import asyncio
import os
import json
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

# --------------- Logging (FIRST) ---------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fops")

from security import verify_api_key
from auth.auth import login_user as _login_user, verify_token, get_user_by_id
from storage.users import get_db as get_auth_db, User, Permission

# Import job tracking from models directory
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "models"))
from job import job_store, Job

from database import engine, get_db, Base, SessionLocal
from models import Release
from schemas import ReleaseCreate, ReleaseResponse, ReleaseUpdate
import crud
from google_sheets import sync_from_google_sheets, fetch_releases_from_sheet
from agents.orchestrator import Orchestrator

# Communication system
try:
    from routes.communications import router as communications_router
    from websocket_manager import ws_manager
except ImportError as e:
    logger.warning(f"Failed to load communications module: {e}")
    communications_router = None
    ws_manager = None

# Simple notifications system
try:
    from notifications_simple import router as notifications_router
except ImportError as e:
    logger.warning(f"Failed to load notifications module: {e}")
    notifications_router = None

# Credits formatter system
try:
    from routes.credits import router as credits_router
except ImportError as e:
    logger.warning(f"Failed to load credits formatter module: {e}")
    credits_router = None

# Tools system (video formatter, YouTube search, extractor, fingerprint)
try:
    from routes.tools import router as tools_router
except ImportError as e:
    logger.warning(f"Failed to load tools module: {e}")
    tools_router = None

# Logs system (activity logs + WebSocket streaming)
try:
    from routes.logs import router as logs_router
except ImportError as e:
    logger.warning(f"Failed to load logs module: {e}")
    logs_router = None

# Task management system
try:
    from routes.tasks import router as tasks_router
except ImportError as e:
    logger.warning(f"Failed to load tasks module: {e}")
    tasks_router = None

# Organization / multi-tenant management
try:
    from routes.orgs import router as orgs_router
except ImportError as e:
    logger.warning(f"Failed to load orgs module: {e}")
    orgs_router = None

# Permissions management
try:
    from routes.permissions import router as permissions_router
except ImportError as e:
    logger.warning(f"Failed to load permissions module: {e}")
    permissions_router = None

# Asset management
try:
    from routes.assets import router as assets_router
except ImportError as e:
    logger.warning(f"Failed to load assets module: {e}")
    assets_router = None

# Publishing sources (Phase A1)
try:
    from routes.sources import router as sources_router
except ImportError as e:
    logger.warning(f"Failed to load sources module: {e}")
    sources_router = None

try:
    from routes.templates import router as templates_router
except ImportError as e:
    logger.warning(f"Failed to load templates module: {e}")
    templates_router = None

# Fingerprint library (Phase F1.1)
try:
    from routes.fingerprint_library import router as fingerprint_library_router
except ImportError as e:
    logger.warning(f"Failed to load fingerprint library module: {e}")
    fingerprint_library_router = None

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="FOPS - Release Management System")
app.state.limiter = limiter


# --------------- JWT Authentication ---------------

def verify_jwt_token(request: Request, db: Session = Depends(get_auth_db)):
    """Verify JWT token from Authorization header or fall back to API key.
    
    Returns: {"user_id": int, "email": str, "role": str, "permissions": {...}}
    """
    auth_header = request.headers.get("Authorization", "")
    
    # Try JWT token first
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        payload = verify_token(token)
        
        if payload:
            user = get_user_by_id(payload.get("user_id"), db)
            if user and user.active:
                # Get user permissions
                perm = db.query(Permission).filter_by(role=user.role).first()
                return {
                    "user_id": user.id,
                    "email": user.email,
                    "role": user.role,
                    "permissions": {
                        "can_approve": perm.can_approve if perm else False,
                        "can_reject": perm.can_reject if perm else False,
                        "can_run_tools": perm.can_run_tools if perm else False,
                        "can_manage_users": perm.can_manage_users if perm else False,
                        "can_view_audit": perm.can_view_audit if perm else False,
                        "allowed_tools": perm.allowed_tools if perm else [],
                        "can_access_settings": perm.can_access_settings if perm else False,
                        "can_sync_sheets": perm.can_sync_sheets if perm else False,
                    }
                }
            raise HTTPException(status_code=401, detail="Invalid or inactive user")
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Fall back to API key (for backward compatibility)
    try:
        verify_api_key(request)
        # API key valid, grant admin permissions
        return {
            "user_id": 0,  # System user
            "email": "system@fops.local",
            "role": "admin",
            "permissions": {
                "can_approve": True,
                "can_reject": True,
                "can_run_tools": True,
                "can_manage_users": True,
                "can_view_audit": True,
                "allowed_tools": [
                    "audio-match", "youtube-search", "fingerprint-check",
                    "channel-scrape", "youtube-format", "video-formatter"
                ],
                "can_access_settings": True,
                "can_sync_sheets": True,
            }
        }
    except:
        raise HTTPException(status_code=401, detail="Missing or invalid authentication")


def check_permission(permission_name: str):
    """Create a dependency that checks if user has a specific permission."""
    def _check(user_info = Depends(verify_jwt_token)):
        perms = user_info.get("permissions", {})
        if not perms.get(permission_name, False):
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission_name}")
        return user_info
    return _check


def check_tool_access(tool_name: str):
    """Create a dependency that checks if user can access a specific tool."""
    def _check(user_info = Depends(verify_jwt_token)):
        allowed = user_info.get("permissions", {}).get("allowed_tools", [])
        if tool_name not in allowed and user_info.get("role") != "admin":
            raise HTTPException(status_code=403, detail=f"Tool access denied: {tool_name}")
        return user_info
    return _check


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Try again later."})


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fops.aggarha.com",
        "https://api.fops.aggarha.com",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include communication routes if available
if communications_router:
    app.include_router(communications_router)
    logger.info("Communication system routes registered")

# Include notifications routes if available
if notifications_router:
    app.include_router(notifications_router)
    logger.info("Notifications system routes registered")

# Include credits formatter routes if available
if credits_router:
    app.include_router(credits_router)
    logger.info("Credits formatter routes registered")

# Include tools routes if available
if tools_router:
    app.include_router(tools_router)
    logger.info("[INFO] Tools (video formatter, YouTube search, extractor, fingerprint) routes registered")

# Include logs routes if available
if logs_router:
    app.include_router(logs_router)
    logger.info("[INFO] Activity logs routes registered")

# Include tasks routes if available
if tasks_router:
    app.include_router(tasks_router)
    logger.info("[INFO] Task management routes registered")

# Include orgs routes if available
if orgs_router:
    app.include_router(orgs_router)
    logger.info("[INFO] Organization routes registered")

# Include permissions routes if available
if permissions_router:
    app.include_router(permissions_router)
    logger.info("[INFO] Permissions routes registered")

# Include assets routes if available
if assets_router:
    app.include_router(assets_router)
    logger.info("[INFO] Asset management routes registered")

# Include publishing sources routes if available
if sources_router:
    app.include_router(sources_router)
    logger.info("[INFO] Publishing sources routes registered")

# Include publishing templates routes if available
if templates_router:
    app.include_router(templates_router)
    logger.info("[INFO] Publishing templates routes registered")

# Include fingerprint library routes if available
if fingerprint_library_router:
    app.include_router(fingerprint_library_router)
    logger.info("[INFO] Fingerprint library routes registered")

try:
    from routes.protection_jobs import router as protection_jobs_router
except ImportError as e:
    logger.warning(f"Failed to load protection_jobs module: {e}")
    protection_jobs_router = None
if protection_jobs_router:
    app.include_router(protection_jobs_router)
    logger.info("[INFO] Protection jobs routes registered")

# Set up WebSocket broadcaster for activity logging
if logs_router:
    try:
        from services.websocket_broadcaster import ws_broadcaster
        from services.activity_logger import set_ws_broadcaster
        set_ws_broadcaster(ws_broadcaster)
        logger.info("[INFO] WebSocket broadcaster initialized for activity logs")
    except ImportError as e:
        logger.warning(f"Failed to initialize WebSocket broadcaster: {e}")


# --------------- Standalone WebSocket for live logs (avoids router path conflicts) ---------------
try:
    from fastapi import WebSocket as _WS, WebSocketDisconnect as _WSD
    from services.websocket_broadcaster import ws_broadcaster as _wsb
    import json as _wsjson
    from datetime import datetime as _wsdt

    @app.websocket("/api/ws/logs")
    async def _ws_logs_standalone(websocket: _WS, token: Optional[str] = None):
        """Standalone WebSocket for live log streaming — no path-param conflicts."""
        try:
            await _wsb.connect("logs", websocket)
            await websocket.send_json({
                "type": "connected",
                "message": "Connected to live logs stream",
                "timestamp": _wsdt.utcnow().isoformat(),
            })
            while True:
                data = await websocket.receive_text()
                try:
                    msg = _wsjson.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong", "timestamp": _wsdt.utcnow().isoformat()})
                except Exception:
                    pass
        except _WSD:
            await _wsb.disconnect("logs", websocket)
        except Exception as e:
            logger.error(f"WS logs error: {e}")
            try:
                await _wsb.disconnect("logs", websocket)
            except Exception:
                pass
    logger.info("[INFO] Standalone WebSocket /api/ws/logs registered")
except Exception as _e:
    logger.warning(f"Failed to register standalone WS logs: {_e}")

# --------------- Notifications Store (file-based) ---------------
import json as _json
from datetime import datetime as _dt
from pathlib import Path as _Path

_NOTIFICATIONS_FILE = _Path(__file__).parent / "notifications.json"
_NOTIFICATIONS_MAX = 200

# Use shared notification module
from notifications import load_notifications as _load_notifications, save_notifications as _save_notifications, push_notification as _push_notification


# Sync interval in minutes (0 = disabled)
SYNC_INTERVAL_MINUTES = int(os.getenv("SYNC_INTERVAL_MINUTES", "30"))


@app.on_event("startup")
async def on_startup():
    import asyncio as _asyncio
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created / verified")
    try:
        from services.job_manager import set_event_loop as _set_loop
        _set_loop(_asyncio.get_running_loop())
        logger.info("[INFO] Job manager event loop registered")
    except Exception as _e:
        logger.warning("Could not register job_manager event loop: %s", _e)
    # Start background sync if interval is set
    if SYNC_INTERVAL_MINUTES > 0:
        asyncio.get_event_loop().create_task(_background_sync())
        logger.info("Background Google Sheets sync scheduled every %d minutes", SYNC_INTERVAL_MINUTES)
    # Start background agent pipeline
    interval = int(os.getenv("AGENT_PIPELINE_INTERVAL", "5"))
    if interval > 0:
        asyncio.get_event_loop().create_task(_background_agent_pipeline(interval))
        logger.info("Background agent pipeline scheduled every %d minutes", interval)


async def _background_sync():
    """Periodically sync from Google Sheets in the background."""
    while True:
        await asyncio.sleep(SYNC_INTERVAL_MINUTES * 60)
        try:
            db = SessionLocal()
            try:
                result = sync_from_google_sheets(db)
                logger.info("Background sync result: %s", result)
            finally:
                db.close()
        except Exception:
            logger.exception("Background Google Sheets sync failed")


async def _background_agent_pipeline(interval_minutes: int):
    """Periodically run the agent pipeline in the background."""
    while True:
        await asyncio.sleep(interval_minutes * 60)
        try:
            result = _orchestrator.run_pipeline()
            logger.info("Background agent pipeline result: %s issues, %d AI messages",
                        result.get("critical_issues", "?"), len(result.get("ai_messages", [])))
        except Exception:
            logger.exception("Background agent pipeline failed")


@app.get("/")
def root():
    return {"message": "FOPS is running 🚀"}


@app.get("/health")
def health():
    """Structured health check — returns service states for monitoring."""
    import datetime
    from database import engine as _engine

    # DB connectivity
    db_ok = False
    try:
        with _engine.connect() as conn:
            conn.execute(__import__('sqlalchemy').text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    # Auth DB
    auth_ok = False
    try:
        from storage.users import engine as _auth_engine
        with _auth_engine.connect() as conn:
            conn.execute(__import__('sqlalchemy').text("SELECT 1"))
        auth_ok = True
    except Exception:
        pass

    services = {
        "database": "ok" if db_ok else "error",
        "auth_db":  "ok" if auth_ok else "error",
        "websocket": "ok" if ws_manager is not None else "unavailable",
    }
    overall = "ok" if all(v == "ok" for v in services.values()) else "degraded"
    return {
        "status": overall,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
        "services": services,
    }


@app.get("/api/system/ytdlp-status")
def get_ytdlp_status(user_info=Depends(verify_jwt_token)):
    """Return yt-dlp configuration and cookie authentication status.

    Admin-only endpoint. Never exposes cookie file contents.
    """
    if user_info.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from services.ytdlp_service import get_cookie_status
    import yt_dlp as _yt_dlp
    status = get_cookie_status()
    status["ytdlp_version"] = getattr(_yt_dlp.version, "__version__", "unknown")
    return status

# --------------- Job Tracking Routes ---------------

@app.get("/api/jobs")
def list_jobs(
    status: str = None,
    limit: int = 100,
    user_info = Depends(verify_jwt_token),
):
    """List jobs. Admins see all; regular users only see their own."""
    calling_uid = user_info.get("user_id", 0)
    is_admin    = user_info.get("role") == "admin"
    jobs = list(job_store.jobs.values())
    if not is_admin:
        jobs = [
            j for j in jobs
            if j.params.get("user_id") == calling_uid
            or j.params.get("email") == user_info.get("email")
        ]
    if status:
        jobs = [j for j in jobs if j.status == status]
    jobs.sort(key=lambda j: j.created_at, reverse=True)
    jobs = jobs[:limit]
    running   = sum(1 for j in jobs if j.status == "running")
    pending   = sum(1 for j in jobs if j.status == "pending")
    completed = sum(1 for j in jobs if j.status == "completed")
    failed    = sum(1 for j in jobs if j.status == "failed")
    return {
        "jobs": [j.to_dict() for j in jobs],
        "total": len(jobs),
        "stats": {
            "running":   running,
            "pending":   pending,
            "completed": completed,
            "failed":    failed,
            "cancelled": sum(1 for j in jobs if j.status == "cancelled"),
        },
    }


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str, user_info = Depends(verify_jwt_token)):
    """Remove a completed/failed job from the store."""
    calling_uid = user_info.get("user_id", 0)
    is_admin    = user_info.get("role") == "admin"
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not is_admin and job.params.get("user_id") != calling_uid:
        raise HTTPException(status_code=403, detail="Access denied")
    if job.status == "running":
        raise HTTPException(status_code=400, detail="Cannot delete a running job")
    job_store.remove(job_id)
    return {"success": True}


@app.delete("/api/jobs")
def clear_finished_jobs(user_info = Depends(verify_jwt_token)):
    """Clear completed, failed, and cancelled jobs owned by the caller (or all if admin)."""
    calling_uid = user_info.get("user_id", 0)
    is_admin    = user_info.get("role") == "admin"
    to_remove = [
        jid for jid, j in job_store.jobs.items()
        if j.status in ("completed", "failed", "cancelled")
        and (is_admin or j.params.get("user_id") == calling_uid)
    ]
    for jid in to_remove:
        job_store.remove(jid)
    return {"success": True, "removed": len(to_remove)}


@app.get("/api/jobs/{job_id}")
def get_job_status(job_id: str, user_info = Depends(verify_jwt_token)):
    """Get the status and progress of a job."""
    calling_uid = user_info.get("user_id", 0)
    is_admin    = user_info.get("role") == "admin"
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not is_admin and job.params.get("user_id") != calling_uid:
        raise HTTPException(status_code=403, detail="Access denied")
    return job.to_dict()


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user_info = Depends(verify_jwt_token)):
    """Cancel a running job."""
    calling_uid = user_info.get("user_id", 0)
    is_admin    = user_info.get("role") == "admin"
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not is_admin and job.params.get("user_id") != calling_uid:
        raise HTTPException(status_code=403, detail="Access denied")
    if job.status == "running":
        job.status = "cancelled"
        job.completed_at = job.completed_at or ""
        return {"success": True, "message": "Job cancelled"}
    else:
        raise HTTPException(status_code=400, detail="Job is not running")


# --------------- Authentication Routes ---------------

class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/login")
def api_login(req: LoginRequest, db: Session = Depends(get_auth_db)):
    """
    Authenticate user and return JWT tokens.
    
    Body:
        email: User email address
        password: User password
    
    Returns:
        {
            "success": true,
            "access_token": "...",
            "refresh_token": "...",
            "token_type": "bearer",
            "user": {"id", "email", "role", "full_name"},
            "expires_in": 28800 (seconds)
        }
    """
    logger.info("[API] POST /api/login email=%r", req.email)
    result = _login_user(req.email, req.password, db)
    
    if not result:
        logger.warning("[AUTH] Login failed for email=%r", req.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return {"success": True, **result}


@app.get("/api/auth/me")
def api_get_current_user(user_info = Depends(verify_jwt_token)):
    """Get current authenticated user information."""
    return {
        "success": True,
        "user": {
            "id": user_info["user_id"],
            "email": user_info["email"],
            "role": user_info["role"],
        },
        "permissions": user_info["permissions"],
    }


# --------------- Release Management Routes ---------------

@app.post("/api/releases", response_model=ReleaseResponse, status_code=201)
def create_release(release: ReleaseCreate, db: Session = Depends(get_db)):
    return crud.create_release(db, release)


@app.get("/api/releases/from-sheet")
def get_releases_from_sheet_endpoint():
    """Fetch release data directly from Google Sheet1 (rows 4+)."""
    return fetch_releases_from_sheet()


@app.get("/api/releases/search")
def releases_search(q: str = "", limit: int = 30):
    """Search releases from sheet by artist, song, or UPC."""
    try:
        rows = fetch_releases_from_sheet()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not q.strip():
        return {"results": rows[:limit], "total": len(rows)}
    q_lower = q.strip().lower()
    matched = [
        r for r in rows
        if q_lower in (r.get("artist") or "").lower()
        or q_lower in (r.get("song") or "").lower()
        or q_lower in (r.get("upc") or "").lower()
    ]
    return {"results": matched[:limit], "total": len(matched)}


@app.get("/api/releases/by-upc/{upc}")
def release_by_upc(upc: str):
    """Look up a release by UPC code."""
    try:
        rows = fetch_releases_from_sheet()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    match = next((r for r in rows if (r.get("upc") or "").strip() == upc.strip()), None)
    if not match:
        raise HTTPException(status_code=404, detail=f"No release found for UPC: {upc}")
    return match


@app.get("/api/releases/missing", response_model=list[ReleaseResponse])
def get_missing_data(db: Session = Depends(get_db)):
    return crud.get_missing_data(db)


@app.get("/api/releases", response_model=list[ReleaseResponse])
def get_all_releases(db: Session = Depends(get_db)):
    return crud.get_all_releases(db)


@app.get("/api/releases/{release_id}", response_model=ReleaseResponse)
def get_release(release_id: int, db: Session = Depends(get_db)):
    release = crud.get_release_by_id(db, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    return release


@app.patch("/api/releases/{release_id}", response_model=ReleaseResponse)
def update_release(release_id: int, release: ReleaseUpdate, db: Session = Depends(get_db)):
    updated = crud.update_release(db, release_id, release)
    if not updated:
        raise HTTPException(status_code=404, detail="Release not found")
    return updated


@app.delete("/api/releases/{release_id}")
def delete_release(release_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_release(db, release_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Release not found")
    return {"detail": "Release deleted"}


# --------------- Google Sheets Sync ---------------

@app.post("/api/sync/google-sheets")
def trigger_google_sheets_sync(db: Session = Depends(get_db)):
    """Manually trigger a sync from Google Sheets."""
    try:
        result = sync_from_google_sheets(db)
        logger.info("Manual sync triggered: %s", result)
        return {
            "status": "success",
            "inserted": result["inserted"],
            "updated": result["updated"],
            "skipped": result["skipped"],
        }
    except FileNotFoundError:
        logger.error("Google credentials file not found")
        raise HTTPException(
            status_code=500,
            detail="Google credentials file not found. Place credentials.json in /var/www/fops/ or set GOOGLE_SHEETS_CREDENTIALS env var.",
        )
    except Exception as e:
        logger.exception("Google Sheets sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


# --------------- Dashboard Stats ---------------

@app.get("/api/dashboard/stats")
def dashboard_stats():
    """Aggregate stats from the Google Sheet for the dashboard."""
    try:
        rows = fetch_releases_from_sheet()
    except Exception as e:
        logger.exception("Failed to fetch sheet for stats")
        raise HTTPException(status_code=500, detail=str(e))

    total = len(rows)
    singles = sum(1 for r in rows if r.get("release_type", "").lower() == "single")
    albums = sum(1 for r in rows if r.get("release_type", "").lower() == "album")
    eps = sum(1 for r in rows if r.get("release_type", "").lower() == "ep")
    concerts = sum(1 for r in rows if r.get("release_type", "").lower() == "concert")
    mv = sum(1 for r in rows if (r.get("video_type") or "").strip().lower() in ("video clip", "music video", "mv"))
    lyrics_videos = sum(1 for r in rows if (r.get("video_type") or "").strip().lower() in ("lyrics video", "lyric video"))
    ai = sum(1 for r in rows if "ai" in (r.get("video_type") or "").strip().lower())

    return {
        "total": total,
        "singles": singles,
        "albums": albums,
        "eps": eps,
        "concerts": concerts,
        "mv": mv,
        "lyrics_videos": lyrics_videos,
        "ai": ai,
    }


@app.get("/api/dashboard/today")
def dashboard_today():
    """Get releases for today (date-based from sheet)."""
    try:
        rows = fetch_releases_from_sheet()
    except Exception as e:
        logger.exception("Failed to fetch sheet for today")
        raise HTTPException(status_code=500, detail=str(e))

    from datetime import date as _date, datetime as _dt
    today = _date.today()

    def _parse(s):
        if not s:
            return None
        for fmt in ["%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%m-%d-%Y"]:
            try:
                return _dt.strptime(s.strip(), fmt).date()
            except ValueError:
                pass
        return None

    results = []
    for r in rows:
        d = _parse(r.get("date", ""))
        if d == today:
            results.append(r)

    return {"date": today.isoformat(), "count": len(results), "releases": results}


@app.get("/api/dashboard/upcoming")
def dashboard_upcoming(limit: int = 7):
    """Get next upcoming releases after today."""
    try:
        rows = fetch_releases_from_sheet()
    except Exception as e:
        logger.exception("Failed to fetch sheet for upcoming")
        raise HTTPException(status_code=500, detail=str(e))

    from datetime import date as _date, datetime as _dt
    today = _date.today()

    def _parse(s):
        if not s:
            return None
        for fmt in ["%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%m-%d-%Y"]:
            try:
                return _dt.strptime(s.strip(), fmt).date()
            except ValueError:
                pass
        return None

    future = []
    for r in rows:
        d = _parse(r.get("date", ""))
        if d and d > today:
            future.append((d, r))

    future.sort(key=lambda x: x[0])
    top = future[:limit]
    return {
        "today": today.isoformat(),
        "count": len(future),
        "releases": [{"release_date": d.isoformat(), **r} for d, r in top],
    }


@app.get("/api/tv/data")
def tv_data():
    """Comprehensive TV mode data: today + upcoming + stats."""
    try:
        rows = fetch_releases_from_sheet()
    except Exception as e:
        logger.exception("Failed to fetch sheet for TV")
        raise HTTPException(status_code=500, detail=str(e))

    from datetime import date as _date, datetime as _dt
    today = _date.today()

    def _parse(s):
        if not s:
            return None
        for fmt in ["%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%m-%d-%Y"]:
            try:
                return _dt.strptime(s.strip(), fmt).date()
            except ValueError:
                pass
        return None

    today_list, future_list = [], []
    for r in rows:
        d = _parse(r.get("date", ""))
        if d == today:
            today_list.append(r)
        elif d and d > today:
            future_list.append((d, r))

    future_list.sort(key=lambda x: x[0])
    upcoming = [{"release_date": d.isoformat(), **r} for d, r in future_list[:10]]

    total = len(rows)
    singles = sum(1 for r in rows if r.get("release_type", "").lower() == "single")
    albums = sum(1 for r in rows if r.get("release_type", "").lower() == "album")
    eps = sum(1 for r in rows if r.get("release_type", "").lower() == "ep")
    concerts = sum(1 for r in rows if r.get("release_type", "").lower() == "concert")

    return {
        "today": today.isoformat(),
        "today_releases": today_list,
        "upcoming": upcoming,
        "stats": {
            "total": total,
            "singles": singles,
            "albums": albums,
            "eps": eps,
            "concerts": concerts,
        },
    }


# --------------- Agent System ---------------

_orchestrator = Orchestrator()


AGENT_PIPELINE_INTERVAL = int(os.getenv("AGENT_PIPELINE_INTERVAL", "5"))  # minutes


@app.get("/api/agents/status")
def agents_status():
    """List all registered agents."""
    return _orchestrator.status()


@app.post("/api/run-agents", dependencies=[Depends(check_permission("can_run_tools"))])
def run_agents_pipeline(user_info = Depends(verify_jwt_token)):
    """Run the full autonomous agent pipeline."""
    logger.info("[API] POST /api/run-agents triggered user=%r", user_info.get("email"))
    try:
        result = _orchestrator.run_pipeline()
        return result
    except Exception as e:
        logger.exception("Agent pipeline failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/run/{agent_name}", dependencies=[Depends(check_permission("can_run_tools"))])
def run_single_agent(agent_name: str, db: Session = Depends(get_db), user_info = Depends(verify_jwt_token)):
    """Trigger a single agent by key name."""
    logger.info("[API] POST /api/agents/run/%s user=%r", agent_name, user_info.get("email"))
    if agent_name not in _orchestrator._agents:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    try:
        if agent_name == "data":
            return _orchestrator.run_agent(agent_name, db=db)
        return _orchestrator.run_agent(agent_name)
    except Exception as e:
        logger.exception("Agent %s failed", agent_name)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/run-all", dependencies=[Depends(check_permission("can_run_tools"))])
def run_all_agents(db: Session = Depends(get_db), user_info = Depends(verify_jwt_token)):
    """Trigger all agents and return aggregated report."""
    logger.info("[API] POST /api/agents/run-all user=%r", user_info.get("email"))
    try:
        return _orchestrator.run_all(db=db)
    except Exception as e:
        logger.exception("Orchestrator run_all failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/alerts")
def get_alerts():
    """Get current alert scan results."""
    try:
        return _orchestrator.alerts.run()
    except Exception as e:
        logger.exception("Alert scan failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/ai/analysis")
def get_ai_analysis():
    """Get AI performance analysis and suggestions."""
    try:
        return _orchestrator.ai_clone.run()
    except Exception as e:
        logger.exception("AI analysis failed")
        raise HTTPException(status_code=500, detail=str(e))


# --------------- Video Formatter ---------------

from pydantic import BaseModel
from typing import Optional


class VideoFormatRequest(BaseModel):
    artist_en: str
    artist_ar: str = ""
    song_en: str
    song_ar: str = ""
    album_en: str = ""
    album_ar: str = ""
    songwriter_en: str = ""
    songwriter_ar: str = ""
    composer_en: str = ""
    composer_ar: str = ""
    arranger_en: str = ""
    arranger_ar: str = ""
    isrc: str = ""
    upc: str = ""
    video_type: str = "Music Video"
    channel: str = "Rotana Music"
    lyrics: Optional[str] = None
    year: Optional[int] = None


@app.post("/api/video/format")
def format_video(req: VideoFormatRequest):
    """Generate YouTube title, description, tags for a release."""
    release = req.model_dump(exclude={"video_type", "channel", "lyrics", "year"})
    try:
        result = _orchestrator.video_formatter.format_release(
            release=release,
            video_type=req.video_type,
            channel=req.channel,
            lyrics=req.lyrics,
            year=req.year,
        )
        return result
    except Exception as e:
        logger.exception("Video format failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/video/format-from-sheet/{row_index}")
def format_from_sheet(row_index: int, video_type: str = "Music Video", channel: str = "Rotana Music", lyrics: Optional[str] = None):
    """Format a specific row from the Google Sheet (0-based index)."""
    try:
        rows = fetch_releases_from_sheet()
        if row_index < 0 or row_index >= len(rows):
            raise HTTPException(status_code=404, detail=f"Row {row_index} not found. Sheet has {len(rows)} rows.")
        result = _orchestrator.video_formatter.format_from_sheet(
            sheet_row=rows[row_index],
            video_type=video_type,
            channel=channel,
            lyrics=lyrics,
        )
        result["sheet_row_index"] = row_index
        result["source_data"] = rows[row_index]
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video format from sheet failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/video/channels")
def get_channels():
    """List all channel descriptions."""
    return _orchestrator.video_formatter.channel.run()


class ChannelUpdateRequest(BaseModel):
    name: str
    description: str


@app.post("/api/video/channels")
def upsert_channel(req: ChannelUpdateRequest):
    """Add or update a channel description."""
    return _orchestrator.video_formatter.channel.set_description(req.name, req.description)


@app.delete("/api/video/channels/{channel_name}")
def delete_channel(channel_name: str):
    """Remove a channel."""
    result = _orchestrator.video_formatter.channel.remove_channel(channel_name)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/video/status")
def video_formatter_status():
    """Status of the video formatter and its sub-agents."""
    return _orchestrator.video_formatter.status()


@app.post("/api/video/export-docx")
def export_docx(req: dict):
    """Generate a DOCX file from publishing output and return it."""
    import io
    from docx import Document
    from docx.shared import Pt, RGBColor
    from fastapi.responses import StreamingResponse

    title = req.get("title", "")
    description = req.get("description", "")
    tags = req.get("tags", "")
    channel = req.get("channel", "")
    video_type = req.get("video_type", "")
    artist = req.get("artist", "")
    song = req.get("song", "")

    doc = Document()
    doc.add_heading(f"{artist} — {song}", 0)

    if video_type or channel:
        p = doc.add_paragraph()
        p.add_run(f"Type: {video_type}  |  Channel: {channel}").italic = True

    doc.add_heading("Title", level=1)
    doc.add_paragraph(title)

    doc.add_heading("Description", level=1)
    doc.add_paragraph(description)

    if tags:
        doc.add_heading("Tags", level=1)
        doc.add_paragraph(tags)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    filename = f"{artist}_{song}_publishing.docx".replace(" ", "_")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------- YouTube Formatter Tool ---------------

from tools.youtube_formatter import generate_video_metadata


class YouTubeFormatRequest(BaseModel):
    row_data: dict
    video_type: str = "Music Video"
    channel: str = "Rotana Music"
    lyrics: Optional[str] = None
    channel_descriptions: dict = {}


@app.post("/api/tools/youtube-format", dependencies=[Depends(check_tool_access("youtube-format"))])
def youtube_format(req: YouTubeFormatRequest, user_info = Depends(verify_jwt_token)):
    """Generate YouTube metadata from raw row data (standalone tool)."""
    try:
        result = generate_video_metadata(
            row_data=req.row_data,
            video_type=req.video_type,
            channel=req.channel,
            lyrics=req.lyrics,
            channel_descriptions=req.channel_descriptions,
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.exception("YouTube format tool failed")
        return {"success": False, "error": str(e), "data": {
            "title": "", "description": "", "tags": "", "isrc": "", "upc": ""
        }}


# --------------- YouTube Tool Pipeline ---------------

from core_orchestrator import run_main_pipeline as _run_tool_pipeline, run_main_pipeline_batch
from tools.youtube_basic import search_youtube_basic
from tools.youtube_advanced import search_youtube_advanced
from tools.fingerprint import download_audio_segment, create_fingerprint, compare_fingerprints, full_compare, clear_cache


class PipelineRequest(BaseModel):
    row_index: Optional[int] = None
    song: str = ""
    artist: str = ""
    channel_filter: Optional[str] = None
    filters: Optional[dict] = None


@app.post("/api/run-pipeline", dependencies=[Depends(check_permission("can_run_tools"))])
@limiter.limit("5/minute")
def api_run_pipeline(request: Request, req: PipelineRequest, user_info = Depends(verify_jwt_token)):
    """Run the full YouTube tool pipeline.

    Returns structured {data, alerts, suggestions, actions, audio_matching, decisions}.
    No actions are auto-executed — user must approve.
    """
    logger.info("[API] POST /api/run-pipeline song=%r artist=%r row=%s user=%r", req.song, req.artist, req.row_index, user_info.get("email"))
    try:
        result = _run_tool_pipeline(
            row_index=req.row_index,
            song=req.song,
            artist=req.artist,
            channel_filter=req.channel_filter,
            filters=req.filters,
        )
        return result
    except Exception as e:
        logger.exception("Pipeline failed")
        raise HTTPException(status_code=500, detail=str(e))


class PipelineBatchRequest(BaseModel):
    max_rows: int = 10


@app.post("/api/run-pipeline/batch", dependencies=[Depends(check_permission("can_run_tools"))])
def api_run_pipeline_batch(req: PipelineBatchRequest, user_info = Depends(verify_jwt_token)):
    """Run the pipeline in batch mode across multiple sheet rows."""
    logger.info("[API] POST /api/run-pipeline/batch max_rows=%d user=%r", req.max_rows, user_info.get("email"))
    try:
        return run_main_pipeline_batch(max_rows=req.max_rows)
    except Exception as e:
        logger.exception("Batch pipeline failed")
        raise HTTPException(status_code=500, detail=str(e))


class YouTubeSearchRequest(BaseModel):
    song: str
    artist: str
    channel_filter: Optional[str] = None
    mode: str = "advanced"  # "basic" or "advanced"


@app.get("/api/tools/youtube-search", dependencies=[Depends(check_tool_access("youtube-search"))])
@limiter.limit("5/minute")
def api_youtube_search(request: Request, song: str, artist: str, channel_filter: str = "", mode: str = "advanced", user_info = Depends(verify_jwt_token)):
    """Search YouTube for a song. Supports basic and advanced mode.

    Query parameters:
        song: Song title.
        artist: Artist name.
        channel_filter: Optional channel name to boost.
        mode: "basic" or "advanced" (default: advanced).
    """
    logger.info("[API] GET /api/tools/youtube-search song=%r artist=%r mode=%s user=%r", song, artist, mode, user_info.get("email"))
    try:
        if mode == "basic":
            result = search_youtube_basic(song, artist)
        else:
            results = search_youtube_advanced(song, artist, channel_filter=channel_filter or None)
            result = {"results": results, "count": len(results)}
        return {"success": True, **result}
    except Exception as e:
        logger.exception("YouTube search tool failed")
        raise HTTPException(status_code=500, detail=str(e))


# --------------- BATCH YOUTUBE SEARCH ---------------

class YouTubeSearchBatchRequest(BaseModel):
    items: list[dict]  # [{artist, song}, ...]
    max_results_per_song: int = 50


@app.post("/api/tools/youtube-search/batch", dependencies=[Depends(check_tool_access("youtube-search"))])
@limiter.limit("10/minute")
def api_youtube_search_batch(request: Request, req: YouTubeSearchBatchRequest, user_info = Depends(verify_jwt_token)):
    """Batch YouTube search — returns job_uid immediately (persistent job system).
    Poll GET /api/protection/jobs/{job_uid} or WS /api/ws/jobs/{job_uid}.
    """
    from services.job_manager import job_manager as _jm

    _uid = user_info.get("user_id", 0)
    _email = user_info.get("email", "")
    _org = user_info.get("org_id")
    _tenant = f"org_{_org}" if _org else f"user_{user_info.get('sub') or _email or 'unknown'}"

    items = req.items
    max_results = req.max_results_per_song

    job_uid = _jm.create(_tenant, _uid, "youtube-search-batch")

    def _worker():
        from tools.youtube_batch_search import batch_search_youtube
        try:
            _jm.log(job_uid, "info", f"[QUERY] YouTube search batch received — {total} items, max_results={max_results}")
            _jm.progress(job_uid, 2.0, "initialising")

            def on_progress(stage, current, total_items, song, message):
                pct = 5 + int((current / max(total_items, 1)) * 88)
                label = f"[{current}/{total_items}]"
                if stage == "variant_generation":
                    _jm.log(job_uid, "info", f"{label} [VARIANT_GENERATION_STARTED] {song}")
                elif stage == "searching":
                    _jm.log(job_uid, "info", f"{label} [SEARCH_STARTED] Querying YouTube for: {song}")
                elif stage == "ranking":
                    _jm.log(job_uid, "info", f"{label} [RANKING_STARTED] Ranking candidates for: {song}")
                elif stage == "completed":
                    _jm.log(job_uid, "success", f"{label} [SEARCH_COMPLETED] {message or song}")
                else:
                    if message:
                        _jm.log(job_uid, "info", f"{label} [{stage.upper()}] {message}")
                _jm.progress(job_uid, pct, stage)
            result = batch_search_youtube(
                items=items,
                on_progress=on_progress,
                max_results_per_song=max_results,
            )
            _jm.complete(job_uid, result)
        except Exception as exc:
            logger.exception("youtube-search-batch worker failed")
            _jm.log(job_uid, "error", f"[ERROR] Worker crashed: {exc}")
            _jm.fail(job_uid, {"error": str(exc)})

    _jm.enqueue(job_uid, _worker)
    return {
        "success": True,
        "job_uid": job_uid,
        "job_url": f"/api/protection/jobs/{job_uid}",
    }


class FingerprintCheckRequest(BaseModel):
    url1: str
    url2: str


@app.get("/api/tools/fingerprint-check", dependencies=[Depends(check_tool_access("fingerprint-check"))])
@limiter.limit("5/minute")
def api_fingerprint_check(request: Request, url1: str, url2: str, mode: str = "full", user_info = Depends(verify_jwt_token)):
    """Compare audio fingerprints of two YouTube URLs.

    Query parameters:
        url1: First YouTube URL (reference).
        url2: Second YouTube URL (candidate).
        mode: "full" (all algorithms) or "quick" (spectral only). Default: full.

    Returns per-algorithm scores and combined confidence percentage.
    """
    logger.info("[API] GET /api/tools/fingerprint-check mode=%s user=%r", mode, user_info.get("email"))
    try:
        if mode == "quick":
            audio1 = download_audio_segment(url1)
            fp1 = create_fingerprint(audio1)
            audio2 = download_audio_segment(url2)
            fp2 = create_fingerprint(audio2)
            confidence = compare_fingerprints(fp1, fp2)
            return {
                "success": True,
                "mode": "quick",
                "confidence": float(confidence),
                "match": bool(confidence > 65.0),
            }
        else:
            result = full_compare(url1, url2)
            return {
                "success": True,
                "mode": "full",
                **result.to_dict(),
            }
    except Exception as e:
        err_str = str(e)
        # Return structured error for known YouTube-side failures (not a server fault)
        _KNOWN_TYPES = (
            "public_extraction_blocked", "youtube_bot_detection",
            "audio_download_unavailable", "metadata_only_available",
            "youtube_rate_limit",
        )
        if any(t in err_str for t in _KNOWN_TYPES):
            error_type = next((t for t in _KNOWN_TYPES if t in err_str), "download_failed")
            return {
                "success": False,
                "error_type": error_type,
                "message": err_str,
                "guidance": "Use POST /api/tools/fingerprint/compare-upload to compare uploaded audio files.",
                "mode": mode,
            }
        logger.exception("Fingerprint check failed")
        raise HTTPException(status_code=500, detail=err_str)


@app.post("/api/tools/fingerprint-cache/clear", dependencies=[Depends(check_permission("can_run_tools"))])
def api_clear_fingerprint_cache(user_info = Depends(verify_jwt_token)):
    """Clear the audio fingerprint download cache."""
    logger.info("[API] POST /api/tools/fingerprint-cache/clear user=%r", user_info.get("email"))
    return {"success": True, **clear_cache()}


# --------------- Fingerprint Database (Optional) ---------------

from storage.fingerprint_db import (
    search_fingerprint as _search_fp_db,
    add_fingerprint as _add_fp_db,
    get_all_fingerprints as _get_all_fps,
    get_stats as _get_fp_stats,
    reset_db as _reset_fp_db,
)


# Pydantic models for fingerprint DB requests
class FingerprintAddRequest(BaseModel):
    song: str
    artist: str
    fingerprint: str  # JSON-encoded
    duration: float = 0.0


@app.post("/api/tools/fingerprint/add", dependencies=[Depends(check_tool_access("audio-match"))])
def api_add_fingerprint(
    req: FingerprintAddRequest,
    user_info = Depends(verify_jwt_token)
):
    """Add or update a fingerprint in the database.
    
    Request body:
        song: Song name
        artist: Artist name
        fingerprint: JSON-encoded fingerprint data
        duration: Audio duration in seconds (optional)
    
    Returns:
        The added/updated fingerprint entry
    """
    logger.info("[API] POST /api/tools/fingerprint/add song=%r artist=%r user=%r", req.song, req.artist, user_info.get("email"))
    
    try:
        # Parse fingerprint if it's JSON string
        if isinstance(req.fingerprint, str):
            fp_data = json.loads(req.fingerprint)
        else:
            fp_data = req.fingerprint
        
        entry = _add_fp_db(req.song, req.artist, fp_data, duration=req.duration)
        return {
            "success": True,
            "message": f"Fingerprint added for {req.artist} - {req.song}",
            "entry": entry,
        }
    except json.JSONDecodeError as e:
        logger.error("[API] fingerprint/add: invalid JSON: %s", e)
        raise HTTPException(status_code=400, detail="Invalid fingerprint JSON")
    except Exception as e:
        logger.error("[API] fingerprint/add: error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tools/fingerprint/search", dependencies=[Depends(check_tool_access("audio-match"))])
def api_search_fingerprint(
    song: str,
    artist: str,
    fuzzy: bool = True,
    user_info = Depends(verify_jwt_token)
):
    """Search for a fingerprint in the database.
    
    Args:
        song: Song name
        artist: Artist name
        fuzzy: Use fuzzy matching (default True)
    
    Returns:
        The matching fingerprint entry or null
    """
    logger.info("[API] GET /api/tools/fingerprint/search song=%r artist=%r fuzzy=%s user=%r", 
                song, artist, fuzzy, user_info.get("email"))
    
    try:
        entry = _search_fp_db(song, artist, fuzzy_match=fuzzy)
        return {
            "success": True,
            "entry": entry,
            "found": entry is not None,
        }
    except Exception as e:
        logger.error("[API] fingerprint/search: error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tools/fingerprint/db/stats", dependencies=[Depends(check_tool_access("audio-match"))])
def api_fingerprint_db_stats(user_info = Depends(verify_jwt_token)):
    """Get fingerprint database statistics."""
    logger.info("[API] GET /api/tools/fingerprint/db/stats user=%r", user_info.get("email"))
    
    try:
        stats = _get_fp_stats()
        # Get recent entries using new paginated function
        all_fps, total = _get_all_fingerprints_paginated(limit=10, page=1)
        return {
            "success": True,
            "stats": stats,
            "recent": [{"song": f["song"], "artist": f["artist"]} for f in all_fps],
        }
    except Exception as e:
        logger.error("[API] fingerprint/db/stats: error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tools/fingerprint/db/reset", dependencies=[Depends(check_permission("can_manage_users"))])
def api_reset_fingerprint_db(user_info = Depends(verify_jwt_token)):
    """Reset fingerprint database (admin only)."""
    logger.warning("[API] POST /api/tools/fingerprint/db/reset user=%r", user_info.get("email"))
    
    try:
        result = _reset_fp_db()
        return {"success": True, **result}
    except Exception as e:
        logger.error("[API] fingerprint/db/reset: error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ────────── NEW ENDPOINTS FOR FINGERPRINT EXPLORER ──────────

from storage.fingerprint_db import (
    get_all_fingerprints as _get_all_fingerprints_paginated,
    get_by_id as _get_fingerprint_by_id,
    delete_by_id as _delete_fingerprint_by_id,
)


@app.get("/api/tools/fingerprint/db/list", dependencies=[Depends(check_permission("can_manage_users"))])
def api_list_fingerprints(
    page: int = 1,
    limit: int = 20,
    sort_by: str = "created_at",
    user_info = Depends(verify_jwt_token)
):
    """List fingerprints with pagination.
    
    Query params:
        page: Page number (1-indexed, default: 1)
        limit: Results per page (default: 20, max: 100)
        sort_by: Sort field ("created_at" or "song", default: "created_at")
    """
    logger.info("[API] GET /api/tools/fingerprint/db/list page=%d limit=%d user=%r", 
                page, limit, user_info.get("email"))
    
    try:
        # Limit max results
        limit = min(limit, 100)
        if page < 1:
            page = 1
        
        entries, total_count = _get_all_fingerprints_paginated(
            limit=limit,
            page=page,
            sort_by=sort_by
        )
        
        total_pages = (total_count + limit - 1) // limit
        
        # Strip fingerprint array from response (too large)
        clean_entries = []
        for e in entries:
            clean_entries.append({
                "id": e.get("id"),
                "song": e.get("song"),
                "artist": e.get("artist"),
                "duration": e.get("duration"),
                "created_at": e.get("created_at"),
                "audio_file": e.get("audio_file"),
                "has_audio": bool(e.get("audio_file"))
            })
        
        return {
            "success": True,
            "entries": clean_entries,
            "pagination": {
                "page": page,
                "limit": limit,
                "total_pages": total_pages,
                "total_entries": total_count
            }
        }
    except Exception as e:
        logger.error("[API] fingerprint/db/list: error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tools/fingerprint/audio/{entry_id}")
def api_stream_fingerprint_audio(
    entry_id: str,
    user_info = Depends(verify_jwt_token)
):
    """Stream audio file for fingerprint entry.
    
    Path params:
        entry_id: Fingerprint entry ID
    
    Returns:
        Audio file with Content-Range support
    """
    logger.info("[API] GET /api/tools/fingerprint/audio/%s user=%r", entry_id, user_info.get("email"))
    
    try:
        from starlette.responses import FileResponse
        
        entry = _get_fingerprint_by_id(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        if not entry.get("audio_file"):
            raise HTTPException(status_code=404, detail="No audio file for this entry")
        
        audio_path = Path(__file__).parent / entry["audio_file"]
        
        if not audio_path.exists():
            logger.warning("[API] audio file not found: %s", audio_path)
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        # Return file with streaming support
        return FileResponse(
            audio_path,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f"inline; filename={entry['song']}.mp3"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[API] fingerprint/audio: error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/tools/fingerprint/{entry_id}", dependencies=[Depends(check_permission("can_manage_users"))])
def api_delete_fingerprint(
    entry_id: str,
    user_info = Depends(verify_jwt_token)
):
    """Delete fingerprint entry and associated audio file.
    
    Path params:
        entry_id: Fingerprint entry ID
    """
    logger.info("[API] DELETE /api/tools/fingerprint/%s user=%r", entry_id, user_info.get("email"))
    
    try:
        result = _delete_fingerprint_by_id(entry_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("message", "Not found"))
        
        # Log deletion in audit trail
        try:
            entry = _get_fingerprint_by_id(entry_id)
            if entry:
                logger.info(f"[AUDIT] Fingerprint deleted: {entry.get('song')} - {entry.get('artist')} by {user_info.get('email')}")
        except:
            pass
        
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[API] fingerprint/delete: error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))



# --------------- Audio Matching ---------------

from tools.audio_matcher import audio_match as _audio_match, cleanup_cache as _cleanup_match_cache
from tools.channel_scraper import get_channel_videos as _get_channel_videos, export_to_json as _export_json, export_to_csv as _export_csv


class AudioMatchRequest(BaseModel):
    song: str
    artist: str
    platforms: list[str] = ["youtube"]
    use_fingerprint: bool = True
    reference_url: Optional[str] = None
    channel_filter: Optional[str] = None
    filters: Optional[dict] = None


class BatchAudioMatchItem(BaseModel):
    artist: str
    song: str


class BatchAudioMatchRequest(BaseModel):
    items: list[BatchAudioMatchItem]
    platforms: list[str] = ["youtube"]
    use_fingerprint: bool = True
    filters: Optional[dict] = None


@app.post("/api/tools/audio-match", dependencies=[Depends(check_tool_access("audio-match"))])
@limiter.limit("5/minute")
def api_audio_match(request: Request, req: AudioMatchRequest, user_info = Depends(verify_jwt_token)):
    """Multi-platform audio matching with fingerprint verification.

    Searches across platforms, scores candidates, and optionally runs
    fingerprint verification on uncertain matches.

    Body:
        song: Song title (required).
        artist: Artist name (required).
        platforms: List of platforms — "youtube", "spotify", "anghami" (default: ["youtube"]).
        use_fingerprint: Run fingerprint on matches below 85% score (default: true).
        reference_url: Optional reference YouTube URL for fingerprint comparison.
        channel_filter: Optional channel name to boost in results (legacy).
        filters: Advanced filter dict with keys:
            channel: {name, id} — channel matching
            min_views, max_views — view count range
            min_duration, max_duration — duration range (seconds)
            search_mode: "hybrid" | "keyword" | "fingerprint"
    """
    logger.info("[API] POST /api/tools/audio-match song=%r artist=%r platforms=%s filters=%s",
                req.song, req.artist, req.platforms, bool(req.filters))
    try:
        result = _audio_match(
            song=req.song,
            artist=req.artist,
            platforms=req.platforms,
            use_fingerprint=req.use_fingerprint,
            reference_url=req.reference_url,
            channel_filter=req.channel_filter,
            filters=req.filters,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.exception("Audio match failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tools/audio-match/cache/clear", dependencies=[Depends(check_permission("can_run_tools"))])
def api_clear_audio_match_cache(user_info = Depends(verify_jwt_token)):
    """Clean expired audio match cache entries."""
    return {"success": True, **_cleanup_match_cache()}


@app.post("/api/tools/audio-match/batch", dependencies=[Depends(check_tool_access("audio-match"))])
@limiter.limit("10/minute")
def api_audio_match_batch(request: Request, req: BatchAudioMatchRequest, user_info = Depends(verify_jwt_token)):
    """Batch audio matching — returns job_uid immediately (persistent job system).
    Poll GET /api/protection/jobs/{job_uid} or WS /api/ws/jobs/{job_uid}.
    """
    import time
    from services.job_manager import job_manager as _jm

    _uid = user_info.get("user_id", 0)
    _email = user_info.get("email", "")
    _org = user_info.get("org_id")
    _tenant = f"org_{_org}" if _org else f"user_{user_info.get('sub') or _email or 'unknown'}"

    items      = list(req.items)
    platforms  = req.platforms
    use_fp     = req.use_fingerprint
    filters_kw = req.filters

    job_uid = _jm.create(_tenant, _uid, "audio-match-batch")

    def _worker():
        import time as _t
        try:
            total = len(items)
            _jm.log(job_uid, "info", f"[QUERY] Audio-match batch received — {total} items")
            _jm.log(job_uid, "info", f"[QUERY] Platforms: {platforms} | Fingerprint: {use_fp}")
            _jm.progress(job_uid, 2.0, "initialising")

            start_time = _t.time()
            results    = []
            successful = 0
            failed_cnt = 0

            for idx, item in enumerate(items, 1):
                pct   = 5 + int((idx / max(total, 1)) * 88)
                label = f"{item.artist} — {item.song}"

                # ── Source lookup ─────────────────────────────────────────
                _jm.log(job_uid, "info", f"[{idx}/{total}] [SOURCE_LOOKUP] {label}")
                _jm.progress(job_uid, pct, "source lookup", f"Looking up: {label}")

                try:
                    # ── Candidate discovery ───────────────────────────────
                    _jm.log(job_uid, "info", f"[{idx}/{total}] [CANDIDATE_DISCOVERY] Searching {platforms} for: {label}")

                    result = _audio_match(
                        song=item.song,
                        artist=item.artist,
                        platforms=platforms,
                        use_fingerprint=use_fp,
                        filters=filters_kw,
                    )

                    # ── Fingerprint verification ──────────────────────────
                    if use_fp:
                        _jm.log(job_uid, "info", f"[{idx}/{total}] [FINGERPRINT_VERIFICATION] Running fingerprint check for: {label}")

                    # ── Final ranking ─────────────────────────────────────
                    candidate_count = len(result.get("results", [])) if isinstance(result, dict) else 0
                    confidence = result.get("confidence") or result.get("best_confidence", 0) if isinstance(result, dict) else 0
                    _jm.log(job_uid, "info",
                        f"[{idx}/{total}] [FINAL_RANKING] {candidate_count} candidates ranked — best confidence: {confidence}%")
                    _jm.log(job_uid, "success",
                        f"[{idx}/{total}] DONE: {label}")

                    results.append({"artist": item.artist, "song": item.song, "result": result, "error": None})
                    successful += 1

                except Exception as exc:
                    logger.exception("Batch item failed: %s - %s", item.artist, item.song)
                    _jm.log(job_uid, "error",
                        f"[{idx}/{total}] [ERROR] {label}: {exc}")
                    results.append({"artist": item.artist, "song": item.song, "result": None, "error": str(exc)})
                    failed_cnt += 1

            duration = _t.time() - start_time
            _jm.log(job_uid, "success",
                f"[DONE] Batch complete — {successful} succeeded, {failed_cnt} failed, {round(duration, 1)}s total")
            _jm.complete(job_uid, {
                "results":    results,
                "total":      total,
                "successful": successful,
                "failed":     failed_cnt,
                "duration":   round(duration, 2),
            })
        except Exception as exc:
            logger.exception("audio-match-batch worker failed")
            _jm.log(job_uid, "error", f"[ERROR] Worker crashed: {exc}")
            _jm.fail(job_uid, {"error": str(exc)})

    _jm.enqueue(job_uid, _worker)
    return {
        "success": True,
        "job_uid": job_uid,
        "job_url": f"/api/protection/jobs/{job_uid}",
    }


# --------------- Channel Scraper ---------------

class ChannelScrapeRequest(BaseModel):
    channel_url: str
    max_results: int = 1000
    export_format: str = "json"  # json or csv


@app.post("/api/tools/channel-scrape", dependencies=[Depends(check_tool_access("channel-scrape"))])
@limiter.limit("5/minute")
def api_channel_scrape(request: Request, req: ChannelScrapeRequest, user_info = Depends(verify_jwt_token)):
    """Extract all videos from a YouTube channel with metadata.

    Body:
        channel_url: YouTube channel URL (e.g., https://www.youtube.com/@RotanaMusic)
        max_results: Maximum videos to extract (default: 1000, max: 10000)
        export_format: Output format - "json" or "csv" (default: json)

    Returns:
        {
            "success": true,
            "channel": {"id", "name", "url", "video_count"},
            "videos": [...],
            "total_collected": number,
            "elapsed_seconds": number,
            "export_format": "json" | "csv",
            "export_data": "..." (CSV string if export_format=csv)
        }
    """
    logger.info(
        "[API] POST /api/tools/channel-scrape url=%r max_results=%d format=%s user=%r",
        req.channel_url,
        req.max_results,
        req.export_format,
        user_info.get("email"),
    )

    try:
        # Validate URL
        if "youtube.com" not in req.channel_url and "youtu.be" not in req.channel_url:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")

        # Cap max_results
        max_results = min(req.max_results, 10000)

        # Get channel videos
        result = _get_channel_videos(req.channel_url, max_results=max_results, metadata_enrichment=True)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Channel scrape failed"))

        # Apply export format
        export_data = None
        if req.export_format.lower() == "csv":
            export_data = _export_csv(result.get("videos", []))
            result["export_data"] = export_data
        else:
            export_data = _export_json(result)
            result["export_data"] = export_data

        result["export_format"] = req.export_format.lower()

        return {"success": True, **result}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Channel scrape failed")
        raise HTTPException(status_code=500, detail=str(e))


# --------------- Actions (Approve / Reject / Re-run) ---------------

from storage.decisions import save_decision as _save_decision, get_decisions as _get_decisions, get_decision_for_song as _get_decision_for_song
from learning.preferences import record_decision as _record_preference, get_preferences_summary as _get_prefs_summary, rebuild_from_decisions as _rebuild_prefs


class ActionRequest(BaseModel):
    song: str
    artist: str
    best_match: str = ""
    confidence: int = 0
    reason: str = ""


@app.post("/api/actions/approve", dependencies=[Depends(check_permission("can_approve"))])
def api_approve(req: ActionRequest, user_info = Depends(verify_jwt_token)):
    """Approve a match decision and persist to DB."""
    logger.info("[API] POST /api/actions/approve song=%r artist=%r user=%r", req.song, req.artist, user_info.get("email"))
    result = _save_decision(
        song=req.song, artist=req.artist, decision="approved",
        best_match=req.best_match, confidence=req.confidence, reason=req.reason,
    )
    _record_preference(channel=req.best_match, artist=req.artist, decision="approved", confidence=req.confidence)
    _push_notification(f"✅ Approved: {req.artist} – {req.song}", "success")
    return {"success": True, **result}


@app.post("/api/actions/reject", dependencies=[Depends(check_permission("can_reject"))])
def api_reject(req: ActionRequest, user_info = Depends(verify_jwt_token)):
    """Reject a match decision and persist to DB."""
    logger.info("[API] POST /api/actions/reject song=%r artist=%r user=%r", req.song, req.artist, user_info.get("email"))
    result = _save_decision(
        song=req.song, artist=req.artist, decision="rejected",
        best_match=req.best_match, confidence=req.confidence, reason=req.reason,
    )
    _record_preference(channel=req.best_match, artist=req.artist, decision="rejected", confidence=req.confidence)
    _push_notification(f"❌ Rejected: {req.artist} – {req.song}", "warning")
    return {"success": True, **result}


class RerunRequest(BaseModel):
    song: str
    artist: str
    channel_filter: Optional[str] = None
    filters: Optional[dict] = None


@app.post("/api/actions/rerun", dependencies=[Depends(check_permission("can_run_tools"))])
def api_rerun(req: RerunRequest, user_info = Depends(verify_jwt_token)):
    """Re-run the pipeline for a specific song/artist."""
    logger.info("[API] POST /api/actions/rerun song=%r artist=%r user=%r", req.song, req.artist, user_info.get("email"))
    try:
        result = _run_tool_pipeline(
            song=req.song, artist=req.artist,
            channel_filter=req.channel_filter, filters=req.filters,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.exception("Rerun failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/actions/decisions", dependencies=[Depends(verify_jwt_token)])
def api_get_decisions(limit: int = 50, filter: str = "", user_info = Depends(verify_jwt_token)):
    """Get saved decisions. Optional filter: 'approved' or 'rejected'."""
    logger.info("[API] GET /api/actions/decisions user=%r", user_info.get("email"))
    decisions = _get_decisions(limit=limit, decision_filter=filter or None)
    return {"success": True, "decisions": decisions, "count": len(decisions)}


@app.get("/api/actions/preferences", dependencies=[Depends(verify_jwt_token)])
def api_get_preferences(user_info = Depends(verify_jwt_token)):
    """Get current learned preferences (channel/artist scores)."""
    logger.info("[API] GET /api/actions/preferences user=%r", user_info.get("email"))
    return {"success": True, **_get_prefs_summary()}


@app.post("/api/actions/preferences/rebuild", dependencies=[Depends(check_permission("can_run_tools"))])
def api_rebuild_preferences(user_info = Depends(verify_jwt_token)):
    """Rebuild preference scores from all stored decisions."""
    logger.info("[API] POST /api/actions/preferences/rebuild user=%r", user_info.get("email"))
    result = _rebuild_prefs()
    return {"success": True, **result}


# --------------- Notifications ---------------

# --------------- Settings ---------------

_CONFIG_PATH = _Path(__file__).parent / "config.json"
_CONFIG_DEFAULTS = {
    "content_id_enabled": False,
    "fingerprint_enabled": True,
    "auto_pipeline_enabled": True,
    "pipeline_interval_minutes": 5,
    "default_platforms": ["youtube"],
}
_VALID_PLATFORMS = {"youtube", "spotify", "anghami"}


def _load_config() -> dict:
    """Load config from disk, falling back to defaults."""
    if _CONFIG_PATH.exists():
        try:
            data = _json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            merged = {**_CONFIG_DEFAULTS, **data}
            return merged
        except (ValueError, OSError):
            pass
    return dict(_CONFIG_DEFAULTS)


def _save_config(config: dict) -> None:
    """Persist config to disk."""
    _CONFIG_PATH.write_text(
        _json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@app.get("/api/settings")
def get_settings():
    """Get current system settings."""
    return {"success": True, "settings": _load_config()}


class SettingsUpdateRequest(BaseModel):
    content_id_enabled: Optional[bool] = None
    fingerprint_enabled: Optional[bool] = None
    auto_pipeline_enabled: Optional[bool] = None
    pipeline_interval_minutes: Optional[int] = None
    default_platforms: Optional[list[str]] = None


@app.post("/api/settings", dependencies=[Depends(verify_api_key)])
def update_settings(req: SettingsUpdateRequest):
    """Update system settings. Only provided fields are changed."""
    config = _load_config()
    updates = req.model_dump(exclude_none=True)

    if "pipeline_interval_minutes" in updates:
        val = updates["pipeline_interval_minutes"]
        if val < 1 or val > 1440:
            raise HTTPException(status_code=400, detail="pipeline_interval_minutes must be 1-1440")

    if "default_platforms" in updates:
        invalid = set(updates["default_platforms"]) - _VALID_PLATFORMS
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid platforms: {invalid}")
        if not updates["default_platforms"]:
            raise HTTPException(status_code=400, detail="At least one platform required")

    config.update(updates)
    _save_config(config)
    logger.info("[API] Settings updated: %s", updates)
    return {"success": True, "settings": config}


# --------------- Notifications Routes ---------------

@app.get("/api/notifications")
def get_notifications(user_info = Depends(verify_jwt_token)):
    """Get all notifications with unread count."""
    notifications = _load_notifications()
    
    # Add ID to each notification
    for i, notif in enumerate(notifications):
        notif['id'] = i
    
    unread_count = sum(1 for n in notifications if not n.get('read', False))
    
    return {
        "success": True,
        "notifications": notifications,
        "count": len(notifications),
        "unread": unread_count,
    }


@app.post("/api/notifications/read")
def mark_notifications_read(user_info = Depends(verify_jwt_token)):
    """Mark all notifications as read."""
    notifications = _load_notifications()
    
    # Mark all as read
    for notif in notifications:
        notif['read'] = True
    
    _save_notifications(notifications)
    
    return {
        "success": True,
        "message": "All notifications marked as read",
    }


# --------------- Dashboard & TV Mode Routes ---------------

from services.google_sheets_service import (
    get_dashboard_overview,
    get_today_releases,
    get_next_releases,
)


@app.get("/api/dashboard/overview")
def dashboard_overview():
    """Get dashboard overview statistics from Google Sheets.
    
    Returns:
        {
            "success": true,
            "total_releases": number,
            "today_releases": number,
            "singles": number,
            "albums": number,
            "videos": number,
            "upcoming_releases": number (next 30 days),
            "last_synced": ISO timestamp,
            "cache_error": null or error message
        }
    """
    logger.info("[API] GET /api/dashboard/overview")
    try:
        overview = get_dashboard_overview()
        return {"success": True, **overview}
    except Exception as e:
        logger.exception("Dashboard overview failed")
        return {
            "success": False,
            "error": str(e),
            "total_releases": 0,
            "today_releases": 0,
            "singles": 0,
            "albums": 0,
            "videos": 0,
            "upcoming_releases": 0,
            "last_synced": None,
            "cache_error": str(e),
        }


@app.get("/api/dashboard/today")
def dashboard_today():
    """Get releases scheduled for today.
    
    Returns:
        {
            "success": true,
            "releases": [
                {
                    "artist": str,
                    "song": str,
                    "release_date": str,
                    "type": str,
                    "label": str,
                    "upc": str,
                    "tracks_count": str,
                    "artwork_status": str,
                    "motion_status": str,
                    "youtube_status": str,
                    "cairo_team": str,
                    "saudi_team": str
                },
                ...
            ],
            "count": number
        }
    """
    logger.info("[API] GET /api/dashboard/today")
    try:
        releases, count = get_today_releases()
        return {
            "success": True,
            "releases": releases,
            "count": count,
        }
    except Exception as e:
        logger.exception("Dashboard today failed")
        return {
            "success": False,
            "error": str(e),
            "releases": [],
            "count": 0,
        }


@app.get("/api/dashboard/next")
def dashboard_next(limit: int = 3):
    """Get next upcoming releases.
    
    Query parameters:
        limit: Number of upcoming releases to return (default: 3, max: 20)
    
    Returns:
        {
            "success": true,
            "releases": [
                {
                    "artist": str,
                    "song": str,
                    "release_date": str,
                    "type": str,
                    "label": str,
                    "upc": str,
                    "tracks_count": str,
                    "artwork_status": str,
                    "motion_status": str,
                    "youtube_status": str,
                    "cairo_team": str,
                    "saudi_team": str,
                    "weekday": str (e.g., "Monday"),
                    "formatted_date": str (e.g., "Jan 15, 2025")
                },
                ...
            ],
            "count": number
        }
    """
    logger.info("[API] GET /api/dashboard/next limit=%d", limit)
    try:
        # Cap limit to 20
        limit = min(limit, 20)
        releases = get_next_releases(limit=limit)
        return {
            "success": True,
            "releases": releases,
            "count": len(releases),
        }
    except Exception as e:
        logger.exception("Dashboard next failed")
        return {
            "success": False,
            "error": str(e),
            "releases": [],
            "count": 0,
        }


@app.get("/api/tv/releases")
def tv_releases():
    """Get releases data for TV Mode display.
    
    Combines today releases, next 3 releases, and dashboard stats.
    Optimized for fullscreen cinematic display with auto-refresh support.
    
    Returns:
        {
            "success": true,
            "today": [release objects],
            "upcoming": [release objects],
            "stats": {
                "total": number,
                "singles": number,
                "albums": number,
                "videos": number,
                "upcoming": number (30 days)
            },
            "last_synced": ISO timestamp,
            "cache_error": null or error message
        }
    """
    logger.info("[API] GET /api/tv/releases")
    try:
        # Get today's releases
        today_releases, today_count = get_today_releases()
        
        # Get next releases (more for TV - up to 5)
        next_releases = get_next_releases(limit=5)
        
        # Get overview stats
        overview = get_dashboard_overview()
        
        return {
            "success": True,
            "today": today_releases,
            "upcoming": next_releases,
            "stats": {
                "total": overview.get("total_releases", 0),
                "singles": overview.get("singles", 0),
                "albums": overview.get("albums", 0),
                "videos": overview.get("videos", 0),
                "upcoming": overview.get("upcoming_releases", 0),
            },
            "last_synced": overview.get("last_synced"),
            "cache_error": overview.get("cache_error"),
        }
    except Exception as e:
        logger.exception("TV releases failed")
        return {
            "success": False,
            "error": str(e),
            "today": [],
            "upcoming": [],
            "stats": {
                "total": 0,
                "singles": 0,
                "albums": 0,
                "videos": 0,
                "upcoming": 0,
            },
            "last_synced": None,
            "cache_error": str(e),
        }


# ============================================================================
# USER MANAGEMENT API — admin-only CRUD
# ============================================================================

from pydantic import EmailStr

class UserCreateRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    role: str = "viewer"

class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    active: bool
    created_at: Optional[str]

    class Config:
        from_attributes = True

@app.get("/api/users", dependencies=[Depends(check_permission("can_manage_users"))])
def list_users(db: Session = Depends(get_auth_db), user_info = Depends(verify_jwt_token)):
    """List all users (admin only)."""
    from storage.users import User as UserModel
    users = db.query(UserModel).order_by(UserModel.id).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": getattr(u, "full_name", None),
            "role": u.role,
            "active": u.active,
            "created_at": str(u.created_at) if getattr(u, "created_at", None) else None,
        }
        for u in users
    ]

@app.post("/api/users", status_code=201, dependencies=[Depends(check_permission("can_manage_users"))])
def create_user_endpoint(req: UserCreateRequest, db: Session = Depends(get_auth_db), user_info = Depends(verify_jwt_token)):
    """Create a new user (admin only)."""
    from storage.users import User as UserModel
    from auth.auth import hash_password
    existing = db.query(UserModel).filter_by(email=req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists")
    allowed_roles = {"admin", "analyst", "operator", "viewer"}
    if req.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(allowed_roles)}")
    user = UserModel(
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        active=True,
    )
    if hasattr(user, "full_name"):
        user.full_name = req.full_name
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": getattr(user, "full_name", None),
        "role": user.role,
        "active": user.active,
        "created_at": str(getattr(user, "created_at", "")),
    }

@app.patch("/api/users/{user_id}", dependencies=[Depends(check_permission("can_manage_users"))])
def update_user_endpoint(user_id: int, req: UserUpdateRequest, db: Session = Depends(get_auth_db), user_info = Depends(verify_jwt_token)):
    """Update a user (admin only)."""
    from storage.users import User as UserModel
    user = db.query(UserModel).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Prevent disabling the only admin
    if req.role and req.role not in {"admin", "analyst", "operator", "viewer"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if req.role is not None:
        user.role = req.role
    if req.active is not None:
        user.active = req.active
    if req.full_name is not None and hasattr(user, "full_name"):
        user.full_name = req.full_name
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": getattr(user, "full_name", None),
        "role": user.role,
        "active": user.active,
        "created_at": str(getattr(user, "created_at", "")),
    }

@app.delete("/api/users/{user_id}", dependencies=[Depends(check_permission("can_manage_users"))])
def delete_user_endpoint(user_id: int, db: Session = Depends(get_auth_db), user_info = Depends(verify_jwt_token)):
    """Delete a user (admin only). Cannot delete self."""
    from storage.users import User as UserModel
    if user_info.get("user_id") == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(UserModel).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"success": True}
