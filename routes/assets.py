"""
Asset Management API — Phase 12
Handles artwork, motion graphics, lyrics, and other release assets.
"""
import os
import uuid
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

router = APIRouter(prefix="/api/assets", tags=["assets"])

# ── DB setup ───────────────────────────────────────────────────────────────
Base = declarative_base()

class Asset(Base):
    __tablename__ = "assets"
    id        = Column(Integer, primary_key=True, index=True)
    uid       = Column(String, unique=True, nullable=False)       # UUID for file key
    name      = Column(String, nullable=False)
    type      = Column(String, nullable=False)                    # artwork / motion / lyrics / other
    mime_type = Column(String, nullable=True)
    size      = Column(Integer, nullable=True)                    # bytes
    upc       = Column(String, nullable=True, index=True)         # linked release
    version   = Column(Integer, default=1)
    notes     = Column(Text, nullable=True)
    tags      = Column(Text, nullable=True)                       # JSON list
    filename  = Column(String, nullable=False)                    # stored filename
    uploaded_by = Column(String, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

engine = create_engine("sqlite:////var/www/fops/assets.db", connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(bind=engine)

# Upload directory
UPLOAD_DIR = Path("/var/www/fops/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {
    'artwork': ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.gif'],
    'motion':  ['.mp4', '.mov', '.avi', '.webm', '.mkv'],
    'lyrics':  ['.txt', '.pdf', '.docx', '.lrc'],
    'other':   [],  # any extension
}
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB

# ── Auth helper ────────────────────────────────────────────────────────────
def _get_user(request: Request):
    from auth.auth import verify_token
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = verify_token(auth.split(" ")[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


def _require_admin(request: Request):
    payload = _get_user(request)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload


def _asset_dict(a: Asset) -> dict:
    return {
        "id": a.id,
        "uid": a.uid,
        "name": a.name,
        "type": a.type,
        "mime_type": a.mime_type,
        "size": a.size,
        "upc": a.upc,
        "version": a.version,
        "notes": a.notes,
        "tags": json.loads(a.tags) if a.tags else [],
        "filename": a.filename,
        "uploaded_by": a.uploaded_by,
        "download_url": f"/api/assets/{a.uid}/download",
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────
@router.get("")
def list_assets(request: Request, upc: Optional[str] = None, type: Optional[str] = None, q: Optional[str] = None):
    """List assets with optional filters."""
    _get_user(request)
    db = SessionLocal()
    try:
        query = db.query(Asset)
        if upc:
            query = query.filter(Asset.upc == upc)
        if type:
            query = query.filter(Asset.type == type)
        if q:
            query = query.filter(Asset.name.ilike(f"%{q}%"))
        assets = query.order_by(Asset.created_at.desc()).all()
        return {"success": True, "assets": [_asset_dict(a) for a in assets], "total": len(assets)}
    finally:
        db.close()


@router.post("")
async def upload_asset(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(...),
    type: str = Form("other"),
    upc: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
):
    """Upload a new asset file."""
    payload = _get_user(request)

    # Validate type
    if type not in ALLOWED_TYPES:
        type = "other"

    # Read file and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")

    # Check extension for non-other types
    ext = Path(file.filename or "file").suffix.lower()
    if type != "other" and ALLOWED_TYPES[type] and ext not in ALLOWED_TYPES[type]:
        raise HTTPException(status_code=400, detail=f"Invalid file type for {type}. Allowed: {ALLOWED_TYPES[type]}")

    # Save file
    uid = str(uuid.uuid4())
    stored_name = f"{uid}{ext}"
    dest = UPLOAD_DIR / stored_name
    dest.write_bytes(content)

    # Parse tags
    tags_list = []
    if tags:
        try:
            tags_list = json.loads(tags)
        except Exception:
            tags_list = [t.strip() for t in tags.split(",") if t.strip()]

    db = SessionLocal()
    try:
        asset = Asset(
            uid=uid,
            name=name,
            type=type,
            mime_type=file.content_type,
            size=len(content),
            upc=upc or None,
            notes=notes,
            tags=json.dumps(tags_list),
            filename=stored_name,
            uploaded_by=payload.get("email") or payload.get("sub"),
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        return {"success": True, "asset": _asset_dict(asset)}
    finally:
        db.close()


@router.get("/{uid}/download")
def download_asset(uid: str, request: Request):
    """Get asset download info (URL for frontend to use directly)."""
    _get_user(request)
    db = SessionLocal()
    try:
        a = db.query(Asset).filter(Asset.uid == uid).first()
        if not a:
            raise HTTPException(status_code=404, detail="Asset not found")
        file_path = UPLOAD_DIR / a.filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        from fastapi.responses import FileResponse
        return FileResponse(str(file_path), filename=a.name + Path(a.filename).suffix, media_type=a.mime_type or "application/octet-stream")
    finally:
        db.close()


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    upc: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list] = None


@router.patch("/{uid}")
def update_asset(uid: str, body: AssetUpdate, request: Request):
    """Update asset metadata."""
    _get_user(request)
    db = SessionLocal()
    try:
        a = db.query(Asset).filter(Asset.uid == uid).first()
        if not a:
            raise HTTPException(status_code=404, detail="Asset not found")
        if body.name is not None:
            a.name = body.name
        if body.upc is not None:
            a.upc = body.upc
        if body.notes is not None:
            a.notes = body.notes
        if body.tags is not None:
            a.tags = json.dumps(body.tags)
        a.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(a)
        return {"success": True, "asset": _asset_dict(a)}
    finally:
        db.close()


@router.delete("/{uid}")
def delete_asset(uid: str, request: Request):
    """Delete an asset and its file."""
    _require_admin(request)
    db = SessionLocal()
    try:
        a = db.query(Asset).filter(Asset.uid == uid).first()
        if not a:
            raise HTTPException(status_code=404, detail="Asset not found")
        # Delete file
        file_path = UPLOAD_DIR / a.filename
        if file_path.exists():
            file_path.unlink()
        db.delete(a)
        db.commit()
        return {"success": True}
    finally:
        db.close()
