"""
Job tracking model for batch processing and long-running operations.

Supports real-time progress tracking with stage information.
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, Any
from datetime import datetime
import uuid
import logging

logger = logging.getLogger("models.job")


@dataclass
class JobProgress:
    """Progress information for a job stage."""
    stage: str  # "preparing", "searching", "processing", "scoring", "fingerprinting", "done"
    current: int = 0  # current item number (for batch)
    total: int = 0  # total items (for batch)
    percentage: float = 0.0  # overall progress 0-100
    message: str = ""  # optional status message


@dataclass
class Job:
    """Represents a long-running operation with progress tracking."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: str = ""  # "audio-match", "youtube-search", etc.
    status: str = "pending"  # "pending", "running", "completed", "failed"
    
    # Progress tracking
    progress: JobProgress = field(default_factory=lambda: JobProgress(stage="pending"))
    
    # Input parameters
    params: dict = field(default_factory=dict)
    
    # Results
    result: Optional[dict] = None
    error: Optional[str] = None
    
    # Metadata
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "progress": asdict(self.progress),
            "params": self.params,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }
    
    def start(self):
        """Mark job as started."""
        self.status = "running"
        self.started_at = datetime.utcnow().isoformat()
        logger.info(f"Job {self.id} started: {self.type}")
    
    def update_progress(self, stage: str, current: int = None, total: int = None, message: str = ""):
        """Update job progress."""
        if current is None:
            current = self.progress.current
        if total is None:
            total = self.progress.total
        
        # Calculate percentage
        percentage = (current / total * 100) if total > 0 else 0
        
        self.progress = JobProgress(
            stage=stage,
            current=current,
            total=total,
            percentage=round(percentage, 1),
            message=message,
        )
        logger.debug(f"Job {self.id} progress: {stage} ({current}/{total})")
    
    def complete(self, result: dict):
        """Mark job as completed with result."""
        self.status = "completed"
        self.completed_at = datetime.utcnow().isoformat()
        self.result = result
        self.progress.stage = "done"
        self.progress.percentage = 100.0
        logger.info(f"Job {self.id} completed")
    
    def fail(self, error: str):
        """Mark job as failed with error message."""
        self.status = "failed"
        self.completed_at = datetime.utcnow().isoformat()
        self.error = error
        logger.error(f"Job {self.id} failed: {error}")


class JobStore:
    """In-memory job store for tracking progress."""
    
    def __init__(self):
        self.jobs = {}
    
    def create(self, job_type: str, params: dict = None) -> str:
        """Create a new job and return its ID."""
        job = Job(type=job_type, params=params or {})
        self.jobs[job.id] = job
        logger.info(f"Created job {job.id}: {job_type}")
        return job.id
    
    def get(self, job_id: str) -> Optional[Job]:
        """Retrieve a job by ID."""
        return self.jobs.get(job_id)
    
    def update(self, job_id: str, **kwargs):
        """Update job properties."""
        job = self.jobs.get(job_id)
        if job:
            for key, value in kwargs.items():
                if hasattr(job, key):
                    setattr(job, key, value)
    
    def remove(self, job_id: str):
        """Remove a completed job from memory."""
        if job_id in self.jobs:
            del self.jobs[job_id]


# Global job store
job_store = JobStore()
