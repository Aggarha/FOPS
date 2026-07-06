"""
FOPS Protection Jobs API — REST endpoints for the persistent job system.

Prefix: /api/protection
Tags:   protection-jobs

Endpoints:
  GET  /api/protection/jobs                   — list jobs (tenant-scoped)
  GET  /api/protection/jobs/{job_uid}         — single job detail
  GET  /api/protection/jobs/{job_uid}/logs    — paginated log lines
  POST /api/protection/jobs/{job_uid}/cancel  — cancel a queued/running job
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth.auth import verify_token

logger = logging.getLogger("routes.protection_jobs")

router = APIRouter(prefix="/api/protection", tags=["protection-jobs"])


# ── Auth helpers (mirrors routes/sources.py pattern) ─────────────────────────

def _require_auth(request: Request) -> dict:
    """Decode Bearer JWT. Returns raw payload dict."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    payload = verify_token(auth.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def _tenant(payload: dict) -> str:
    if payload.get("org_id"):
        return f"org_{payload['org_id']}"
    return f"user_{payload.get('sub') or payload.get('email') or 'unknown'}"


def _is_admin(payload: dict) -> bool:
    return payload.get("role") == "admin"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/jobs")
def list_protection_jobs(
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status: queued|running|completed|failed|cancelled"),
    tool:   Optional[str] = Query(None, description="Filter by tool name"),
    limit:  int           = Query(50,  ge=1, le=200),
    offset: int           = Query(0,   ge=0),
    payload: dict         = Depends(_require_auth),
):
    from services.job_manager import job_manager
    tenant_id = _tenant(payload)
    user_id   = payload.get("user_id", 0)
    is_admin  = _is_admin(payload)

    jobs = job_manager.list_jobs(
        tenant_id, user_id, is_admin,
        status=status, tool=tool, limit=limit, offset=offset,
    )
    return {"success": True, "jobs": jobs, "count": len(jobs)}


@router.get("/jobs/{job_uid}")
def get_protection_job(
    job_uid: str,
    request: Request,
    payload: dict = Depends(_require_auth),
):
    from services.job_manager import job_manager
    tenant_id = _tenant(payload)
    user_id   = payload.get("user_id", 0)
    is_admin  = _is_admin(payload)

    job = job_manager.get(job_uid, tenant_id, user_id, is_admin)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"success": True, "job": job}


@router.get("/jobs/{job_uid}/logs")
def get_protection_job_logs(
    job_uid: str,
    request: Request,
    offset: int   = Query(0,   ge=0),
    limit:  int   = Query(500, ge=1, le=2000),
    payload: dict = Depends(_require_auth),
):
    from services.job_manager import job_manager
    tenant_id = _tenant(payload)
    user_id   = payload.get("user_id", 0)
    is_admin  = _is_admin(payload)

    logs = job_manager.get_logs(
        job_uid, tenant_id, user_id, is_admin,
        offset=offset, limit=limit,
    )
    if logs is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"success": True, "logs": logs, "count": len(logs)}


@router.post("/jobs/{job_uid}/cancel")
def cancel_protection_job(
    job_uid: str,
    request: Request,
    payload: dict = Depends(_require_auth),
):
    from services.job_manager import job_manager
    tenant_id = _tenant(payload)
    user_id   = payload.get("user_id", 0)
    is_admin  = _is_admin(payload)

    ok = job_manager.cancel(job_uid, tenant_id, user_id, is_admin)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel: job not found, not owned by you, or not in a cancellable state",
        )
    return {"success": True, "message": "Job cancelled"}
