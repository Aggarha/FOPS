"""
Publishing Suite — Source Library, Excel Import Engine, Column Mapping
Phase A1

Tables created in fops.db:
  publishing_sources
  publishing_imports
  publishing_column_mappings

Routes prefix: /api/publishing
"""
import os
import io
import csv
import json
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, JSON,
    create_engine, ForeignKey,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# ── Auth helpers ───────────────────────────────────────────────────────────
from auth.auth import verify_token

router = APIRouter(prefix="/api/publishing", tags=["publishing-sources"])

# ── DB setup (fops.db) ─────────────────────────────────────────────────────
from database import engine as fops_engine

Base = declarative_base()

UPLOAD_DIR = Path("/var/www/fops/uploads/sources")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── Models ─────────────────────────────────────────────────────────────────

class PublishingSource(Base):
    __tablename__ = "publishing_sources"

    id          = Column(Integer, primary_key=True, index=True)
    uid         = Column(String(64), unique=True, nullable=False)
    tenant_id   = Column(String(128), nullable=False, index=True)
    source_name = Column(String(255), nullable=False)
    source_type = Column(String(64), nullable=False, default="metadata")
    # source_type values: metadata | credits | combined | other
    file_path   = Column(String(512), nullable=True)
    file_name   = Column(String(255), nullable=True)
    active      = Column(Boolean, default=True, nullable=False)
    created_by  = Column(String(128), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PublishingImport(Base):
    """One row per parsed record from an uploaded file."""
    __tablename__ = "publishing_imports"

    id          = Column(Integer, primary_key=True, index=True)
    source_id   = Column(Integer, nullable=False, index=True)
    tenant_id   = Column(String(128), nullable=False, index=True)
    import_uid  = Column(String(64), nullable=False, index=True)  # batch key
    row_index   = Column(Integer, nullable=False)

    # Canonical fields (normalised by mapping)
    artist_en   = Column(String(255), nullable=True)
    artist_ar   = Column(String(255), nullable=True)
    song_en     = Column(String(255), nullable=True)
    song_ar     = Column(String(255), nullable=True)
    album_en    = Column(String(255), nullable=True)
    album_ar    = Column(String(255), nullable=True)
    upc         = Column(String(64),  nullable=True)
    isrc        = Column(String(64),  nullable=True)
    genre       = Column(String(128), nullable=True)
    nationality = Column(String(128), nullable=True)
    release_date= Column(String(64),  nullable=True)
    duration    = Column(String(64),  nullable=True)
    track_number= Column(String(16),  nullable=True)
    track_count = Column(String(16),  nullable=True)
    songwriter_en = Column(String(512), nullable=True)
    songwriter_ar = Column(String(512), nullable=True)
    composer_en = Column(String(512), nullable=True)
    composer_ar = Column(String(512), nullable=True)
    arranger_en = Column(String(512), nullable=True)
    arranger_ar = Column(String(512), nullable=True)

    raw_data    = Column(Text, nullable=True)   # JSON of original row
    created_at  = Column(DateTime, default=datetime.utcnow)


class PublishingColumnMapping(Base):
    """Column mapping set — maps raw column names to canonical field names."""
    __tablename__ = "publishing_column_mappings"

    id          = Column(Integer, primary_key=True, index=True)
    uid         = Column(String(64), unique=True, nullable=False)
    source_id   = Column(Integer, nullable=True)   # NULL = global/reusable
    tenant_id   = Column(String(128), nullable=False, index=True)
    mapping_name= Column(String(255), nullable=False)
    mappings    = Column(Text, nullable=False)  # JSON: { "canonical_field": "raw_col_name" }
    created_by  = Column(String(128), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


Base.metadata.create_all(bind=fops_engine)

SessionLocal = sessionmaker(bind=fops_engine)

# ── Canonical field registry ───────────────────────────────────────────────

CANONICAL_FIELDS = [
    ("artist_en",     "Artist EN",       "Artist Name English"),
    ("artist_ar",     "Artist AR",       "Artist Name Arabic"),
    ("song_en",       "Song EN",         "Song Name English"),
    ("song_ar",       "Song AR",         "Song Name Arabic"),
    ("album_en",      "Album EN",        "Album Name English"),
    ("album_ar",      "Album AR",        "Album Name Arabic"),
    ("upc",           "UPC",             "UPC / Barcode"),
    ("isrc",          "ISRC",            "ISRC Code"),
    ("genre",         "Genre",           "Genre"),
    ("nationality",   "Nationality",     "Nationality"),
    ("release_date",  "Release Date",    "Release Date"),
    ("duration",      "Duration",        "Duration"),
    ("track_number",  "Track Number",    "Track Number"),
    ("track_count",   "Track Count",     "Total Tracks"),
    ("songwriter_en", "Songwriter EN",   "Song Writer English"),
    ("songwriter_ar", "Songwriter AR",   "Song Writer Arabic"),
    ("composer_en",   "Composer EN",     "Composer English"),
    ("composer_ar",   "Composer AR",     "Composer Arabic"),
    ("arranger_en",   "Arranger EN",     "Arranger English"),
    ("arranger_ar",   "Arranger AR",     "Arranger Arabic"),
]

# ── Auth helpers ───────────────────────────────────────────────────────────

def _require_auth(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = verify_token(auth.split(" ")[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


def _require_perm(payload: dict, perm: str):
    """Check permission from payload. Admin always passes."""
    if payload.get("role") == "admin":
        return
    from storage.users import SessionLocal as UserSession, Permission
    db = UserSession()
    try:
        p = db.query(Permission).filter(Permission.role == payload.get("role", "viewer")).first()
        if not p or not getattr(p, perm, False):
            raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")
    finally:
        db.close()


def _tenant(payload: dict) -> str:
    """Derive tenant_id from JWT. Uses org_id if present, else role+email fallback."""
    if payload.get("org_id"):
        return f"org_{payload['org_id']}"
    return f"user_{payload.get('sub') or payload.get('email') or 'unknown'}"


def _audit(user_id: Any, action: str, resource: str, details: dict, ip: str = ""):
    from storage.users import SessionLocal as UserSession, AuditLog
    db = UserSession()
    try:
        entry = AuditLog(
            user_id=int(user_id) if str(user_id).isdigit() else 0,
            action=action,
            resource=resource,
            details=details,
            ip_address=ip,
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

# ── Serialisers ────────────────────────────────────────────────────────────

def _src_dict(s: PublishingSource) -> dict:
    return {
        "id":          s.id,
        "uid":         s.uid,
        "tenant_id":   s.tenant_id,
        "source_name": s.source_name,
        "source_type": s.source_type,
        "file_name":   s.file_name,
        "has_file":    bool(s.file_path and Path(s.file_path).exists()),
        "active":      s.active,
        "created_by":  s.created_by,
        "created_at":  s.created_at.isoformat() if s.created_at else None,
        "updated_at":  s.updated_at.isoformat() if s.updated_at else None,
    }


def _map_dict(m: PublishingColumnMapping) -> dict:
    return {
        "id":           m.id,
        "uid":          m.uid,
        "source_id":    m.source_id,
        "tenant_id":    m.tenant_id,
        "mapping_name": m.mapping_name,
        "mappings":     json.loads(m.mappings) if m.mappings else {},
        "created_by":   m.created_by,
        "created_at":   m.created_at.isoformat() if m.created_at else None,
        "updated_at":   m.updated_at.isoformat() if m.updated_at else None,
    }

# ── File parser ────────────────────────────────────────────────────────────

def _parse_file(file_path: str, max_rows: Optional[int] = None) -> tuple[list[str], list[dict]]:
    """
    Parse XLSX, XLS, or CSV file.
    Returns (headers: list[str], rows: list[dict])
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext in (".xlsx",):
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        headers = [str(c).strip() if c is not None else "" for c in next(rows_iter, [])]
        data = []
        for i, row in enumerate(rows_iter):
            if max_rows and i >= max_rows:
                break
            data.append({headers[j]: (str(v).strip() if v is not None else "") for j, v in enumerate(row) if j < len(headers)})
        wb.close()
        return headers, data

    elif ext in (".xls",):
        # xlrd not installed — return a helpful error
        raise HTTPException(status_code=400, detail=".xls (legacy Excel) not supported. Please convert to .xlsx or .csv first.")

    elif ext in (".csv",):
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            headers = [h.strip() for h in headers]
            data = []
            for i, row in enumerate(reader):
                if max_rows and i >= max_rows:
                    break
                data.append({k.strip(): (v.strip() if v else "") for k, v in row.items()})
        return headers, data

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Use .xlsx or .csv")


def _apply_mapping(raw_row: dict, mappings: dict) -> dict:
    """Apply a column mapping to a raw row. mappings = { canonical_field: raw_col_name }"""
    result = {}
    for canonical, raw_col in mappings.items():
        result[canonical] = raw_row.get(raw_col, "") or ""
    return result

# ══════════════════════════════════════════════════════════════════════════
# SOURCE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

class SourceCreate(BaseModel):
    source_name: str
    source_type: str = "metadata"


class SourceUpdate(BaseModel):
    source_name: Optional[str] = None
    source_type: Optional[str] = None
    active: Optional[bool] = None


@router.get("/sources")
def list_sources(request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_view_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        sources = db.query(PublishingSource).filter(
            PublishingSource.tenant_id == tenant
        ).order_by(PublishingSource.created_at.desc()).all()
        return {"success": True, "sources": [_src_dict(s) for s in sources]}
    finally:
        db.close()


@router.post("/sources", status_code=201)
def create_source(body: SourceCreate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        src = PublishingSource(
            uid=str(uuid.uuid4()),
            tenant_id=tenant,
            source_name=body.source_name.strip(),
            source_type=body.source_type,
            created_by=payload.get("email") or payload.get("sub"),
        )
        db.add(src)
        db.commit()
        db.refresh(src)
        _audit(
            payload.get("sub", 0), "source_created", f"publishing_source:{src.id}",
            {"source_name": src.source_name, "source_type": src.source_type},
            request.client.host if request.client else "",
        )
        return {"success": True, "source": _src_dict(src)}
    finally:
        db.close()


@router.get("/sources/{source_id}")
def get_source(source_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_view_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")
        return {"success": True, "source": _src_dict(src)}
    finally:
        db.close()


@router.patch("/sources/{source_id}")
def update_source(source_id: int, body: SourceUpdate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")
        changes = {}
        if body.source_name is not None:
            src.source_name = body.source_name.strip()
            changes["source_name"] = src.source_name
        if body.source_type is not None:
            src.source_type = body.source_type
            changes["source_type"] = src.source_type
        if body.active is not None:
            src.active = body.active
            changes["active"] = src.active
        src.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(src)
        _audit(
            payload.get("sub", 0), "source_updated", f"publishing_source:{src.id}",
            changes, request.client.host if request.client else "",
        )
        return {"success": True, "source": _src_dict(src)}
    finally:
        db.close()


@router.delete("/sources/{source_id}")
def delete_source(source_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")
        # Remove file if exists
        if src.file_path and Path(src.file_path).exists():
            Path(src.file_path).unlink()
        name = src.source_name
        db.delete(src)
        db.commit()
        _audit(
            payload.get("sub", 0), "source_deleted", f"publishing_source:{source_id}",
            {"source_name": name}, request.client.host if request.client else "",
        )
        return {"success": True}
    finally:
        db.close()


@router.post("/sources/{source_id}/upload")
async def upload_source_file(
    source_id: int,
    request: Request,
    file: UploadFile = File(...),
):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_sources")
    tenant = _tenant(payload)

    ext = Path(file.filename or "file").suffix.lower()
    if ext not in (".xlsx", ".csv"):
        raise HTTPException(status_code=400, detail="Only .xlsx and .csv are supported")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    db = SessionLocal()
    try:
        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")

        # Remove old file
        if src.file_path and Path(src.file_path).exists():
            Path(src.file_path).unlink()

        stored_name = f"{src.uid}{ext}"
        dest = UPLOAD_DIR / stored_name
        dest.write_bytes(content)

        src.file_path = str(dest)
        src.file_name = file.filename
        src.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(src)
        return {"success": True, "source": _src_dict(src)}
    finally:
        db.close()


@router.post("/sources/{source_id}/test")
def test_source(source_id: int, request: Request):
    """Preview first 10 rows parsed from the source file."""
    payload = _require_auth(request)
    _require_perm(payload, "can_view_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")
        if not src.file_path or not Path(src.file_path).exists():
            raise HTTPException(status_code=400, detail="No file uploaded for this source")

        headers, rows = _parse_file(src.file_path, max_rows=10)
        return {
            "success": True,
            "headers": headers,
            "preview": rows,
            "row_count": len(rows),
        }
    finally:
        db.close()


@router.post("/sources/{source_id}/import")
def import_source(
    source_id: int,
    request: Request,
    mapping_id: Optional[int] = Query(None),
):
    """Parse full file and store normalised records."""
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")
        if not src.file_path or not Path(src.file_path).exists():
            raise HTTPException(status_code=400, detail="No file uploaded for this source")

        # Load mapping if specified
        mapping_dict: dict = {}
        if mapping_id:
            m = db.query(PublishingColumnMapping).filter(
                PublishingColumnMapping.id == mapping_id,
                PublishingColumnMapping.tenant_id == tenant,
            ).first()
            if m:
                mapping_dict = json.loads(m.mappings) if m.mappings else {}

        headers, rows = _parse_file(src.file_path)
        import_uid = str(uuid.uuid4())

        # Delete previous imports for this source
        db.query(PublishingImport).filter(
            PublishingImport.source_id == source_id
        ).delete()

        saved = 0
        for i, raw in enumerate(rows):
            if mapping_dict:
                mapped = _apply_mapping(raw, mapping_dict)
            else:
                # Auto-map by guessing common column names
                mapped = _auto_map(raw)

            record = PublishingImport(
                source_id=source_id,
                tenant_id=tenant,
                import_uid=import_uid,
                row_index=i,
                artist_en=mapped.get("artist_en", ""),
                artist_ar=mapped.get("artist_ar", ""),
                song_en=mapped.get("song_en", ""),
                song_ar=mapped.get("song_ar", ""),
                album_en=mapped.get("album_en", ""),
                album_ar=mapped.get("album_ar", ""),
                upc=mapped.get("upc", ""),
                isrc=mapped.get("isrc", ""),
                genre=mapped.get("genre", ""),
                nationality=mapped.get("nationality", ""),
                release_date=mapped.get("release_date", ""),
                duration=mapped.get("duration", ""),
                track_number=mapped.get("track_number", ""),
                track_count=mapped.get("track_count", ""),
                songwriter_en=mapped.get("songwriter_en", ""),
                songwriter_ar=mapped.get("songwriter_ar", ""),
                composer_en=mapped.get("composer_en", ""),
                composer_ar=mapped.get("composer_ar", ""),
                arranger_en=mapped.get("arranger_en", ""),
                arranger_ar=mapped.get("arranger_ar", ""),
                raw_data=json.dumps(raw, ensure_ascii=False),
            )
            db.add(record)
            saved += 1

        db.commit()
        return {
            "success": True,
            "import_uid": import_uid,
            "total_rows": saved,
            "source_id": source_id,
        }
    finally:
        db.close()


@router.get("/sources/{source_id}/records")
def list_records(
    source_id: int,
    request: Request,
    q: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
):
    payload = _require_auth(request)
    _require_perm(payload, "can_view_sources")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        # Verify source ownership
        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")

        query = db.query(PublishingImport).filter(
            PublishingImport.source_id == source_id,
            PublishingImport.tenant_id == tenant,
        )
        if q:
            query = query.filter(
                (PublishingImport.artist_en.ilike(f"%{q}%")) |
                (PublishingImport.song_en.ilike(f"%{q}%")) |
                (PublishingImport.upc.ilike(f"%{q}%"))
            )
        total = query.count()
        records = query.order_by(PublishingImport.row_index).offset(offset).limit(limit).all()

        def _rec(r: PublishingImport) -> dict:
            return {
                "id": r.id,
                "row_index": r.row_index,
                "artist_en": r.artist_en,
                "artist_ar": r.artist_ar,
                "song_en": r.song_en,
                "song_ar": r.song_ar,
                "album_en": r.album_en,
                "upc": r.upc,
                "isrc": r.isrc,
                "genre": r.genre,
                "release_date": r.release_date,
                "raw_data": json.loads(r.raw_data) if r.raw_data else {},
            }

        return {"success": True, "total": total, "records": [_rec(r) for r in records]}
    finally:
        db.close()

# ── Auto-mapper (heuristic fallback) ───────────────────────────────────────

_AUTO_HINTS: dict[str, list[str]] = {
    "artist_en":     ["artist name english", "artist_en", "artist english", "artist name en", "artist"],
    "artist_ar":     ["artist name arabic", "artist_ar", "artist arabic", "artist name ar", "فنان"],
    "song_en":       ["song name english", "song_en", "song english", "track name english", "song title", "song"],
    "song_ar":       ["song name arabic", "song_ar", "song arabic", "track name arabic", "اسم الأغنية"],
    "album_en":      ["album name english", "album_en", "album english", "album"],
    "album_ar":      ["album name arabic", "album_ar", "album arabic"],
    "upc":           ["upc", "barcode", "upc code", "upc/ean"],
    "isrc":          ["isrc", "isrc code"],
    "genre":         ["genre", "musical genre"],
    "nationality":   ["nationality", "country", "origin"],
    "release_date":  ["release date", "release_date", "date"],
    "duration":      ["duration", "length", "time"],
    "track_number":  ["track number", "track_number", "track no", "track #"],
    "track_count":   ["track count", "total tracks", "num tracks"],
    "songwriter_en": ["song writer english", "songwriter english", "songwriter en", "lyrics by en", "lyricist english"],
    "songwriter_ar": ["song writer arabic", "songwriter arabic", "songwriter ar", "lyrics by ar", "lyricist arabic"],
    "composer_en":   ["composer english", "composer en", "composed by english"],
    "composer_ar":   ["composer arabic", "composer ar", "composed by arabic"],
    "arranger_en":   ["arranger english", "arranger en", "arranged by english"],
    "arranger_ar":   ["arranger arabic", "arranger ar", "arranged by arabic"],
}


def _auto_map(raw: dict) -> dict:
    """Best-effort heuristic mapping for raw row."""
    result: dict[str, str] = {}
    raw_lower = {k.lower().strip(): v for k, v in raw.items()}
    for canonical, hints in _AUTO_HINTS.items():
        for hint in hints:
            if hint in raw_lower:
                result[canonical] = raw_lower[hint]
                break
    return result

# ══════════════════════════════════════════════════════════════════════════
# CANONICAL FIELDS ENDPOINT
# ══════════════════════════════════════════════════════════════════════════

@router.get("/canonical-fields")
def get_canonical_fields(request: Request):
    _require_auth(request)
    return {
        "success": True,
        "fields": [
            {"key": key, "label": label, "hint": hint}
            for key, label, hint in CANONICAL_FIELDS
        ],
    }

# ══════════════════════════════════════════════════════════════════════════
# COLUMN MAPPING ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

class MappingCreate(BaseModel):
    mapping_name: str
    source_id: Optional[int] = None
    mappings: Dict[str, str]   # { canonical_field: raw_column_name }


class MappingUpdate(BaseModel):
    mapping_name: Optional[str] = None
    mappings: Optional[Dict[str, str]] = None


@router.get("/mappings")
def list_mappings(request: Request, source_id: Optional[int] = Query(None)):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_mappings")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        query = db.query(PublishingColumnMapping).filter(
            PublishingColumnMapping.tenant_id == tenant
        )
        if source_id is not None:
            query = query.filter(PublishingColumnMapping.source_id == source_id)
        mappings = query.order_by(PublishingColumnMapping.created_at.desc()).all()
        return {"success": True, "mappings": [_map_dict(m) for m in mappings]}
    finally:
        db.close()


@router.get("/mappings/{mapping_id}")
def get_mapping(mapping_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_mappings")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        m = db.query(PublishingColumnMapping).filter(
            PublishingColumnMapping.id == mapping_id,
            PublishingColumnMapping.tenant_id == tenant,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapping not found")
        return {"success": True, "mapping": _map_dict(m)}
    finally:
        db.close()


@router.post("/mappings", status_code=201)
def create_mapping(body: MappingCreate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_mappings")
    tenant = _tenant(payload)

    # Validate canonical keys
    valid_keys = {f[0] for f in CANONICAL_FIELDS}
    bad = [k for k in body.mappings if k not in valid_keys]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown canonical fields: {bad}")

    db = SessionLocal()
    try:
        m = PublishingColumnMapping(
            uid=str(uuid.uuid4()),
            tenant_id=tenant,
            source_id=body.source_id,
            mapping_name=body.mapping_name.strip(),
            mappings=json.dumps(body.mappings, ensure_ascii=False),
            created_by=payload.get("email") or payload.get("sub"),
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        _audit(
            payload.get("sub", 0), "mapping_created", f"publishing_mapping:{m.id}",
            {"mapping_name": m.mapping_name, "field_count": len(body.mappings)},
            request.client.host if request.client else "",
        )
        return {"success": True, "mapping": _map_dict(m)}
    finally:
        db.close()


@router.patch("/mappings/{mapping_id}")
def update_mapping(mapping_id: int, body: MappingUpdate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_mappings")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        m = db.query(PublishingColumnMapping).filter(
            PublishingColumnMapping.id == mapping_id,
            PublishingColumnMapping.tenant_id == tenant,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapping not found")
        changes = {}
        if body.mapping_name is not None:
            m.mapping_name = body.mapping_name.strip()
            changes["mapping_name"] = m.mapping_name
        if body.mappings is not None:
            valid_keys = {f[0] for f in CANONICAL_FIELDS}
            bad = [k for k in body.mappings if k not in valid_keys]
            if bad:
                raise HTTPException(status_code=400, detail=f"Unknown canonical fields: {bad}")
            m.mappings = json.dumps(body.mappings, ensure_ascii=False)
            changes["field_count"] = len(body.mappings)
        m.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(m)
        _audit(
            payload.get("sub", 0), "mapping_updated", f"publishing_mapping:{m.id}",
            changes, request.client.host if request.client else "",
        )
        return {"success": True, "mapping": _map_dict(m)}
    finally:
        db.close()


@router.delete("/mappings/{mapping_id}")
def delete_mapping(mapping_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_mappings")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        m = db.query(PublishingColumnMapping).filter(
            PublishingColumnMapping.id == mapping_id,
            PublishingColumnMapping.tenant_id == tenant,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapping not found")
        name = m.mapping_name
        db.delete(m)
        db.commit()
        _audit(
            payload.get("sub", 0), "mapping_deleted", f"publishing_mapping:{mapping_id}",
            {"mapping_name": name}, request.client.host if request.client else "",
        )
        return {"success": True}
    finally:
        db.close()


@router.post("/mappings/{mapping_id}/clone")
def clone_mapping(mapping_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_mappings")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        m = db.query(PublishingColumnMapping).filter(
            PublishingColumnMapping.id == mapping_id,
            PublishingColumnMapping.tenant_id == tenant,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapping not found")
        clone = PublishingColumnMapping(
            uid=str(uuid.uuid4()),
            tenant_id=tenant,
            source_id=m.source_id,
            mapping_name=f"{m.mapping_name} (Copy)",
            mappings=m.mappings,
            created_by=payload.get("email") or payload.get("sub"),
        )
        db.add(clone)
        db.commit()
        db.refresh(clone)
        return {"success": True, "mapping": _map_dict(clone)}
    finally:
        db.close()


@router.post("/mappings/{mapping_id}/test")
def test_mapping(mapping_id: int, request: Request, source_id: int = Query(...)):
    """Apply this mapping to the source file preview (first 5 rows)."""
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_mappings")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        m = db.query(PublishingColumnMapping).filter(
            PublishingColumnMapping.id == mapping_id,
            PublishingColumnMapping.tenant_id == tenant,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail="Mapping not found")

        src = db.query(PublishingSource).filter(
            PublishingSource.id == source_id,
            PublishingSource.tenant_id == tenant,
        ).first()
        if not src:
            raise HTTPException(status_code=404, detail="Source not found")
        if not src.file_path or not Path(src.file_path).exists():
            raise HTTPException(status_code=400, detail="No file uploaded for this source")

        mapping_dict = json.loads(m.mappings) if m.mappings else {}
        headers, rows = _parse_file(src.file_path, max_rows=5)
        mapped_rows = [_apply_mapping(row, mapping_dict) for row in rows]

        return {
            "success": True,
            "raw_headers": headers,
            "mapped_preview": mapped_rows,
        }
    finally:
        db.close()

# ══════════════════════════════════════════════════════════════════════════
# RELEASE PICKER ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

def _import_full_dict(r: PublishingImport) -> dict:
    """Full serialiser — all 20 canonical fields for autofill."""
    return {
        "id":            r.id,
        "source_id":     r.source_id,
        "import_uid":    r.import_uid,
        "row_index":     r.row_index,
        "artist_en":     r.artist_en     or "",
        "artist_ar":     r.artist_ar     or "",
        "song_en":       r.song_en       or "",
        "song_ar":       r.song_ar       or "",
        "album_en":      r.album_en      or "",
        "album_ar":      r.album_ar      or "",
        "upc":           r.upc           or "",
        "isrc":          r.isrc          or "",
        "genre":         r.genre         or "",
        "nationality":   r.nationality   or "",
        "release_date":  r.release_date  or "",
        "duration":      r.duration      or "",
        "track_number":  r.track_number  or "",
        "track_count":   r.track_count   or "",
        "songwriter_en": r.songwriter_en or "",
        "songwriter_ar": r.songwriter_ar or "",
        "composer_en":   r.composer_en   or "",
        "composer_ar":   r.composer_ar   or "",
        "arranger_en":   r.arranger_en   or "",
        "arranger_ar":   r.arranger_ar   or "",
    }


@router.get("/releases/search")
def search_releases(
    request: Request,
    q:      Optional[str] = Query(None),
    artist: Optional[str] = Query(None),
    song:   Optional[str] = Query(None),
    upc:    Optional[str] = Query(None),
    isrc:   Optional[str] = Query(None),
    limit:  int = Query(25, le=100),
    offset: int = Query(0, ge=0),
):
    """Search published import records — tenant-isolated, partial match."""
    payload = _require_auth(request)
    _require_perm(payload, "can_view_release_picker")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        q_obj = db.query(PublishingImport).filter(
            PublishingImport.tenant_id == tenant
        )
        # General search across all key fields
        if q:
            term = f"%{q.strip()}%"
            q_obj = q_obj.filter(
                (PublishingImport.artist_en.ilike(term)) |
                (PublishingImport.artist_ar.ilike(term)) |
                (PublishingImport.song_en.ilike(term))   |
                (PublishingImport.song_ar.ilike(term))   |
                (PublishingImport.upc.ilike(term))        |
                (PublishingImport.isrc.ilike(term))
            )
        # Targeted filters
        if artist:
            t = f"%{artist.strip()}%"
            q_obj = q_obj.filter(
                (PublishingImport.artist_en.ilike(t)) |
                (PublishingImport.artist_ar.ilike(t))
            )
        if song:
            t = f"%{song.strip()}%"
            q_obj = q_obj.filter(
                (PublishingImport.song_en.ilike(t)) |
                (PublishingImport.song_ar.ilike(t))
            )
        if upc:
            q_obj = q_obj.filter(PublishingImport.upc.ilike(f"%{upc.strip()}%"))
        if isrc:
            q_obj = q_obj.filter(PublishingImport.isrc.ilike(f"%{isrc.strip()}%"))

        total = q_obj.count()
        records = (
            q_obj
            .order_by(PublishingImport.artist_en, PublishingImport.song_en)
            .offset(offset)
            .limit(limit)
            .all()
        )
        return {
            "success":  True,
            "total":    total,
            "offset":   offset,
            "limit":    limit,
            "releases": [_import_full_dict(r) for r in records],
        }
    finally:
        db.close()


@router.get("/releases/{record_id}")
def get_release(record_id: int, request: Request):
    """Fetch a single import record (all canonical fields)."""
    payload = _require_auth(request)
    _require_perm(payload, "can_view_release_picker")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        r = db.query(PublishingImport).filter(
            PublishingImport.id == record_id,
            PublishingImport.tenant_id == tenant,
        ).first()
        if not r:
            raise HTTPException(status_code=404, detail="Release not found")
        return {"success": True, "release": _import_full_dict(r)}
    finally:
        db.close()
