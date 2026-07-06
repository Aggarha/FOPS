"""
BACKEND_AGENT — FastAPI backend management.

Responsibilities:
  - Manage API endpoints health and status
  - Monitor database state
  - Provide CRUD statistics
  - Performance checks
"""

import logging
import time

from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Release

logger = logging.getLogger("agents.backend")


class BackendAgent:
    """Monitors and manages the FastAPI backend layer."""

    name = "BACKEND_AGENT"

    # ---- health ----------------------------------------------------------

    def health_check(self) -> dict:
        """Check database connectivity and return basic health."""
        logger.info("[%s] Running health check …", self.name)
        start = time.time()
        try:
            db: Session = SessionLocal()
            try:
                count = db.query(func.count(Release.id)).scalar()
            finally:
                db.close()
            elapsed = round(time.time() - start, 3)
            status = {
                "status": "ok",
                "db_releases": count,
                "response_time_s": elapsed,
            }
        except Exception as exc:
            status = {"status": "error", "detail": str(exc)}
        logger.info("[%s] Health: %s", self.name, status)
        return status

    # ---- statistics ------------------------------------------------------

    def get_db_stats(self) -> dict:
        """Return aggregate statistics from the database."""
        logger.info("[%s] Collecting DB stats …", self.name)
        db: Session = SessionLocal()
        try:
            total = db.query(func.count(Release.id)).scalar() or 0
            pending = (
                db.query(func.count(Release.id))
                .filter(Release.status == "pending")
                .scalar()
                or 0
            )
            processing = (
                db.query(func.count(Release.id))
                .filter(Release.status == "processing")
                .scalar()
                or 0
            )
            done = (
                db.query(func.count(Release.id))
                .filter(Release.status == "done")
                .scalar()
                or 0
            )
        finally:
            db.close()

        stats = {
            "total": total,
            "pending": pending,
            "processing": processing,
            "done": done,
        }
        logger.info("[%s] DB stats: %s", self.name, stats)
        return stats

    # ---- endpoints inventory ---------------------------------------------

    def list_endpoints(self) -> list[str]:
        """Return all registered API routes."""
        return [
            "GET  /",
            "GET  /health",
            "POST /api/releases",
            "GET  /api/releases",
            "GET  /api/releases/missing",
            "GET  /api/releases/from-sheet",
            "GET  /api/releases/{id}",
            "PATCH /api/releases/{id}",
            "DELETE /api/releases/{id}",
            "POST /api/sync/google-sheets",
            "GET  /api/dashboard/stats",
        ]

    # ---- entry point -----------------------------------------------------

    def run(self) -> dict:
        """Execute backend diagnostics."""
        logger.info("[%s] ▶ Running diagnostics …", self.name)
        health = self.health_check()
        stats = self.get_db_stats()
        endpoints = self.list_endpoints()

        result = {
            "health": health,
            "db_stats": stats,
            "endpoint_count": len(endpoints),
        }
        logger.info("[%s] ✔ Diagnostics complete: %s", self.name, result)
        return result
