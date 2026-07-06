"""
FOPS Protection Job Manager — Persistent, tenant-isolated job execution.

Replaces unbounded threading.Thread() with a bounded ThreadPoolExecutor(4).
All state is persisted in fops.db (protection_jobs + protection_job_logs).

Usage in a route handler:
    job_uid = job_manager.create(tenant_id, user_id, "channel-scraper")

    def _worker():
        try:
            job_manager.log(job_uid, "info", "Starting...")
            result = do_work(...)
            job_manager.complete(job_uid, result)
        except Exception as e:
            job_manager.fail(job_uid, {"error": str(e)})

    job_manager.enqueue(job_uid, _worker)
    return {"job_uid": job_uid}

Or as a one-liner:
    job_uid = job_manager.submit(tenant_id, user_id, "channel-scraper", _worker)
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Callable, Optional

from database import SessionLocal
from storage.protection_jobs import ProtectionJob, ProtectionJobLog

logger = logging.getLogger("services.job_manager")

# Shared bounded executor — 4 workers, never grows unbounded.
_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="prot-worker")

# Event loop reference — populated at FastAPI startup via set_event_loop().
_LOOP: Optional[asyncio.AbstractEventLoop] = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Called once from main.py startup to register the running event loop."""
    global _LOOP
    _LOOP = loop


class JobManager:
    """Thread-safe, SQL-backed job manager for protection tools."""

    # ── Job lifecycle ─────────────────────────────────────────────────────────

    def create(self, tenant_id: str, user_id: int, tool_name: str) -> str:
        """Persist a new job in 'queued' state. Returns job_uid."""
        job_uid = str(uuid.uuid4())
        db = SessionLocal()
        try:
            job = ProtectionJob(
                job_uid=job_uid,
                tenant_id=tenant_id,
                user_id=user_id,
                tool_name=tool_name,
                status="queued",
                progress=0.0,
                created_at=datetime.utcnow(),
            )
            db.add(job)
            db.commit()
        finally:
            db.close()
        return job_uid

    def enqueue(self, job_uid: str, fn: Callable, *args: Any, **kwargs: Any) -> None:
        """Submit fn(*args, **kwargs) to the worker pool.

        Marks the job 'running' immediately before calling fn.
        If fn raises, the job is automatically marked 'failed'.
        """
        def _wrapper() -> None:
            # Mark running
            db = SessionLocal()
            try:
                job = db.query(ProtectionJob).filter_by(job_uid=job_uid).first()
                if not job:
                    logger.error("Job %s not found when starting worker", job_uid)
                    return
                job.status = "running"
                job.started_at = datetime.utcnow()
                db.commit()
            except Exception as exc:
                logger.error("Failed to mark job %s running: %s", job_uid, exc)
                return
            finally:
                db.close()

            try:
                fn(*args, **kwargs)
            except Exception as exc:
                logger.exception("Job %s worker raised unhandled exception", job_uid)
                self.fail(job_uid, {"error": str(exc), "type": type(exc).__name__})

        _EXECUTOR.submit(_wrapper)

    def submit(
        self,
        tenant_id: str,
        user_id: int,
        tool_name: str,
        fn: Callable,
        *args: Any,
        **kwargs: Any,
    ) -> str:
        """Create + enqueue in one call. Returns job_uid."""
        job_uid = self.create(tenant_id, user_id, tool_name)
        self.enqueue(job_uid, fn, *args, **kwargs)
        return job_uid

    # ── Progress / logging ────────────────────────────────────────────────────

    def log(self, job_uid: str, level: str, message: str) -> None:
        """Append a log line and broadcast it over the per-job WebSocket channel."""
        db = SessionLocal()
        entry_id: Optional[int] = None
        ts: Optional[str] = None
        try:
            job = db.query(ProtectionJob).filter_by(job_uid=job_uid).first()
            if not job:
                return
            entry = ProtectionJobLog(
                job_id=job.id,
                timestamp=datetime.utcnow(),
                level=level,
                message=message,
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            entry_id = entry.id
            ts = entry.timestamp.isoformat()
        except Exception as exc:
            logger.debug("job_manager.log DB error: %s", exc)
            return
        finally:
            db.close()

        self._schedule_broadcast(f"job:{job_uid}", {
            "type":    "job_log",
            "job_uid": job_uid,
            "id":      entry_id,
            "ts":      ts,
            "level":   level,
            "message": message,
        })

    def progress(
        self,
        job_uid: str,
        pct: float,
        step: str = "",
        message: str = "",
    ) -> None:
        """Update progress percentage (0–100) and optional step label."""
        db = SessionLocal()
        try:
            job = db.query(ProtectionJob).filter_by(job_uid=job_uid).first()
            if job:
                job.progress = max(0.0, min(100.0, float(pct)))
                if step:
                    job.current_step = step
                db.commit()
        except Exception as exc:
            logger.debug("job_manager.progress DB error: %s", exc)
        finally:
            db.close()

        if message:
            self.log(job_uid, "info", message)

        self._schedule_broadcast(f"job:{job_uid}", {
            "type":    "job_progress",
            "job_uid": job_uid,
            "progress": pct,
            "step":    step,
        })

    def complete(self, job_uid: str, result: dict) -> None:
        """Mark job as completed with a result payload."""
        db = SessionLocal()
        try:
            job = db.query(ProtectionJob).filter_by(job_uid=job_uid).first()
            if job:
                job.status       = "completed"
                job.progress     = 100.0
                job.result_json  = json.dumps(result, default=str)
                job.completed_at = datetime.utcnow()
                db.commit()
        except Exception as exc:
            logger.error("job_manager.complete DB error: %s", exc)
        finally:
            db.close()

        self.log(job_uid, "info", "Job completed successfully")
        self._schedule_broadcast(f"job:{job_uid}", {
            "type":    "job_status",
            "job_uid": job_uid,
            "status":  "completed",
            "progress": 100.0,
        })

    def fail(self, job_uid: str, error: Any) -> None:
        """Mark job as failed with an error payload."""
        err_data = error if isinstance(error, dict) else {"error": str(error)}
        db = SessionLocal()
        try:
            job = db.query(ProtectionJob).filter_by(job_uid=job_uid).first()
            if job:
                job.status       = "failed"
                job.error_json   = json.dumps(err_data, default=str)
                job.completed_at = datetime.utcnow()
                db.commit()
        except Exception as exc:
            logger.error("job_manager.fail DB error: %s", exc)
        finally:
            db.close()

        self.log(job_uid, "error", f"Job failed: {err_data.get('error', 'unknown error')}")
        self._schedule_broadcast(f"job:{job_uid}", {
            "type":    "job_status",
            "job_uid": job_uid,
            "status":  "failed",
        })

    # ── Cancel / read ─────────────────────────────────────────────────────────

    def cancel(
        self,
        job_uid: str,
        tenant_id: str,
        user_id: int,
        is_admin: bool = False,
    ) -> bool:
        """Cancel a queued or running job. Enforces tenant + user ownership."""
        db = SessionLocal()
        try:
            q = db.query(ProtectionJob).filter_by(
                job_uid=job_uid, tenant_id=tenant_id
            )
            if not is_admin:
                q = q.filter_by(user_id=user_id)
            job = q.first()
            if not job or job.status not in ("queued", "running"):
                return False
            job.status       = "cancelled"
            job.completed_at = datetime.utcnow()
            db.commit()
            return True
        except Exception as exc:
            logger.error("job_manager.cancel DB error: %s", exc)
            return False
        finally:
            db.close()

    def get(
        self,
        job_uid: str,
        tenant_id: str,
        user_id: int,
        is_admin: bool = False,
    ) -> Optional[dict]:
        """Fetch a single job. Returns None if not found or not owned."""
        db = SessionLocal()
        try:
            q = db.query(ProtectionJob).filter_by(
                job_uid=job_uid, tenant_id=tenant_id
            )
            if not is_admin:
                q = q.filter_by(user_id=user_id)
            job = q.first()
            return job.to_dict() if job else None
        finally:
            db.close()

    def list_jobs(
        self,
        tenant_id: str,
        user_id: int,
        is_admin: bool = False,
        status: Optional[str] = None,
        tool: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list:
        """List jobs for this tenant, newest first."""
        db = SessionLocal()
        try:
            q = db.query(ProtectionJob).filter_by(tenant_id=tenant_id)
            if not is_admin:
                q = q.filter_by(user_id=user_id)
            if status:
                q = q.filter_by(status=status)
            if tool:
                q = q.filter_by(tool_name=tool)
            jobs = (
                q.order_by(ProtectionJob.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [j.to_dict() for j in jobs]
        finally:
            db.close()

    def get_logs(
        self,
        job_uid: str,
        tenant_id: str,
        user_id: int,
        is_admin: bool = False,
        offset: int = 0,
        limit: int = 500,
    ) -> Optional[list]:
        """Return paginated log lines for a job. Returns None if job not found/owned."""
        db = SessionLocal()
        try:
            q = db.query(ProtectionJob).filter_by(
                job_uid=job_uid, tenant_id=tenant_id
            )
            if not is_admin:
                q = q.filter_by(user_id=user_id)
            job = q.first()
            if not job:
                return None
            logs = (
                db.query(ProtectionJobLog)
                .filter_by(job_id=job.id)
                .order_by(ProtectionJobLog.id)
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [log.to_dict() for log in logs]
        finally:
            db.close()

    # ── Broadcast helper ──────────────────────────────────────────────────────

    def _schedule_broadcast(self, channel: str, message: dict) -> None:
        """Thread-safe: schedule a coroutine on the FastAPI event loop."""
        loop = _LOOP
        if loop is None or not loop.is_running():
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self._async_broadcast(channel, message), loop
            )
        except Exception as exc:
            logger.debug("_schedule_broadcast failed: %s", exc)

    @staticmethod
    async def _async_broadcast(channel: str, message: dict) -> None:
        try:
            from services.ws_manager import ws_manager
            await ws_manager.broadcast(channel, message)
        except Exception as exc:
            logger.debug("WS async_broadcast error: %s", exc)


# Global singleton
job_manager = JobManager()
