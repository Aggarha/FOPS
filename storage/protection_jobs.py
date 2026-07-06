"""
FOPS Protection Jobs — Persistent SQLAlchemy models for protection tool jobs.

Tables (in fops.db):
  protection_jobs     — one row per submitted job
  protection_job_logs — append-only log lines emitted by workers

Imported by services/job_manager.py which owns all write operations.
"""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import relationship

from database import Base, engine


class ProtectionJob(Base):
    __tablename__ = "protection_jobs"

    id           = Column(Integer, primary_key=True, index=True)
    job_uid      = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id    = Column(String(128), nullable=False, index=True)
    user_id      = Column(Integer, nullable=False, index=True)
    tool_name    = Column(String(64), nullable=False)
    # queued | running | completed | failed | cancelled
    status       = Column(String(32), default="queued", nullable=False)
    progress     = Column(Float, default=0.0)
    current_step = Column(String(255), nullable=True)
    result_json  = Column(Text, nullable=True)
    error_json   = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at   = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    logs = relationship(
        "ProtectionJobLog",
        backref="job",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict:
        return {
            "job_uid":      self.job_uid,
            "tenant_id":    self.tenant_id,
            "user_id":      self.user_id,
            "tool_name":    self.tool_name,
            "status":       self.status,
            "progress":     self.progress,
            "current_step": self.current_step,
            "result":       json.loads(self.result_json) if self.result_json else None,
            "error":        json.loads(self.error_json)  if self.error_json  else None,
            "created_at":   self.created_at.isoformat()  if self.created_at   else None,
            "started_at":   self.started_at.isoformat()  if self.started_at   else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class ProtectionJobLog(Base):
    __tablename__ = "protection_job_logs"

    id        = Column(Integer, primary_key=True, index=True)
    job_id    = Column(Integer, ForeignKey("protection_jobs.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    level     = Column(String(16), default="info", nullable=False)
    message   = Column(Text, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id":        self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "level":     self.level,
            "message":   self.message,
        }


# Create tables now (idempotent — skips if already exists)
Base.metadata.create_all(bind=engine)
