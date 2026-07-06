"""
Task Management System — SQLAlchemy model + CRUD + FastAPI router.
Tasks support status columns (Kanban), priorities, assignees, and release linking.
"""

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, DateTime, create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session

# ─── DB setup (tasks.db — separate from main fops.db) ────────────────────────

TASKS_DB_URL = "sqlite:///./tasks.db"
engine = create_engine(TASKS_DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Model ────────────────────────────────────────────────────────────────────

class Task(Base):
    __tablename__ = "tasks"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status      = Column(String(20), nullable=False, default="todo")
    # todo | in_progress | review | done
    priority    = Column(String(10), nullable=False, default="medium")
    # low | medium | high | urgent
    assignee    = Column(String(100), nullable=True)   # email or display name
    created_by  = Column(String(100), nullable=True)
    due_date    = Column(String(20), nullable=True)    # ISO date string YYYY-MM-DD
    release_upc = Column(String(40), nullable=True)    # optional link to release
    tags        = Column(String(300), nullable=True)   # comma-separated
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id":          self.id,
            "title":       self.title,
            "description": self.description,
            "status":      self.status,
            "priority":    self.priority,
            "assignee":    self.assignee,
            "created_by":  self.created_by,
            "due_date":    self.due_date,
            "release_upc": self.release_upc,
            "tags":        self.tags.split(",") if self.tags else [],
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }


# Create table on import
Base.metadata.create_all(bind=engine)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title:       str
    description: Optional[str] = None
    status:      str = "todo"
    priority:    str = "medium"
    assignee:    Optional[str] = None
    due_date:    Optional[str] = None
    release_upc: Optional[str] = None
    tags:        Optional[List[str]] = None


class TaskUpdate(BaseModel):
    title:       Optional[str] = None
    description: Optional[str] = None
    status:      Optional[str] = None
    priority:    Optional[str] = None
    assignee:    Optional[str] = None
    due_date:    Optional[str] = None
    release_upc: Optional[str] = None
    tags:        Optional[List[str]] = None


# ─── Router ───────────────────────────────────────────────────────────────────

router = APIRouter()

VALID_STATUSES   = {"todo", "in_progress", "review", "done"}
VALID_PRIORITIES = {"low", "medium", "high", "urgent"}


@router.get("/api/tasks")
def list_tasks(
    status:   Optional[str] = None,
    assignee: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List tasks with optional filters. Returns counts per column."""
    q = db.query(Task)
    if status:
        q = q.filter(Task.status == status)
    if assignee:
        q = q.filter(Task.assignee == assignee)
    if priority:
        q = q.filter(Task.priority == priority)
    tasks = q.order_by(Task.created_at.desc()).all()

    # Column counts (always full, not filtered)
    all_tasks = db.query(Task).all()
    counts = {s: 0 for s in ["todo", "in_progress", "review", "done"]}
    for t in all_tasks:
        if t.status in counts:
            counts[t.status] += 1

    return {
        "tasks":  [t.to_dict() for t in tasks],
        "total":  len(tasks),
        "counts": counts,
        "assignees": sorted(set(t.assignee for t in all_tasks if t.assignee)),
    }


@router.post("/api/tasks", status_code=201)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    """Create a new task."""
    if payload.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {VALID_STATUSES}")
    if payload.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"Invalid priority. Must be one of: {VALID_PRIORITIES}")

    task = Task(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        assignee=payload.assignee,
        due_date=payload.due_date,
        release_upc=payload.release_upc,
        tags=",".join(payload.tags) if payload.tags else None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task.to_dict()


@router.patch("/api/tasks/{task_id}")
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    """Update task fields (partial). Used for status changes (drag-drop) too."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")

    if payload.title is not None:       task.title = payload.title
    if payload.description is not None: task.description = payload.description
    if payload.status is not None:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(400, "Invalid status")
        task.status = payload.status
    if payload.priority is not None:
        if payload.priority not in VALID_PRIORITIES:
            raise HTTPException(400, "Invalid priority")
        task.priority = payload.priority
    if payload.assignee is not None:    task.assignee = payload.assignee
    if payload.due_date is not None:    task.due_date = payload.due_date
    if payload.release_upc is not None: task.release_upc = payload.release_upc
    if payload.tags is not None:        task.tags = ",".join(payload.tags)
    task.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(task)
    return task.to_dict()


@router.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """Delete a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
    return {"success": True}


@router.get("/api/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db)):
    """Get a single task by ID."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    return task.to_dict()
