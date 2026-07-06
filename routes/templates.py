"""
Publishing Suite — Template Library + Channel Templates
Phase A3

Tables created in fops.db:
  publishing_templates
  publishing_channels

Routes prefix: /api/publishing
"""
import re
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

from auth.auth import verify_token
from database import engine as fops_engine

router = APIRouter(prefix="/api/publishing", tags=["publishing-templates"])

# ── DB setup ───────────────────────────────────────────────────────────────
Base = declarative_base()
SessionLocal = sessionmaker(bind=fops_engine)

# ── Template types ─────────────────────────────────────────────────────────
VALID_TYPES = {
    "single", "album", "ep", "music_video", "lyrics_video",
    "concert", "acoustic", "remix", "visualizer",
}

# ── Variable registry ──────────────────────────────────────────────────────
TEMPLATE_VARIABLES = [
    ("artist_en",    "Artist Name (English)"),
    ("artist_ar",    "Artist Name (Arabic)"),
    ("song_en",      "Song Title (English)"),
    ("song_ar",      "Song Title (Arabic)"),
    ("album_en",     "Album Name (English)"),
    ("album_ar",     "Album Name (Arabic)"),
    ("upc",          "UPC / Barcode"),
    ("isrc",         "ISRC Code"),
    ("release_date", "Release Date"),
    ("writer_en",    "Songwriter (English)"),
    ("writer_ar",    "Songwriter (Arabic)"),
    ("composer_en",  "Composer (English)"),
    ("composer_ar",  "Composer (Arabic)"),
    ("arranger_en",  "Arranger (English)"),
    ("arranger_ar",  "Arranger (Arabic)"),
    ("genre",        "Genre"),
    ("nationality",  "Nationality"),
    ("duration",     "Duration"),
    ("track_number", "Track Number"),
    ("track_count",  "Total Tracks"),
]

# ── Models ─────────────────────────────────────────────────────────────────

class PublishingTemplate(Base):
    __tablename__ = "publishing_templates"

    id                   = Column(Integer, primary_key=True, index=True)
    uid                  = Column(String(64), unique=True, nullable=False)
    tenant_id            = Column(String(128), nullable=False, index=True)
    name                 = Column(String(255), nullable=False)
    type                 = Column(String(64), nullable=False, default="single")
    title_template       = Column(Text, nullable=True)
    description_template = Column(Text, nullable=True)
    tags_template        = Column(Text, nullable=True)
    active               = Column(Boolean, default=True, nullable=False)
    created_by           = Column(String(128), nullable=True)
    created_at           = Column(DateTime, default=datetime.utcnow)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PublishingChannel(Base):
    """Channel template — intro, subscribe CTA, social links, footer."""
    __tablename__ = "publishing_channels"

    id             = Column(Integer, primary_key=True, index=True)
    uid            = Column(String(64), unique=True, nullable=False)
    tenant_id      = Column(String(128), nullable=False, index=True)
    channel_name   = Column(String(255), nullable=False)
    intro_text     = Column(Text, nullable=True)
    subscribe_text = Column(Text, nullable=True)
    social_links   = Column(Text, nullable=True)   # JSON: {platform: url}
    footer_text    = Column(Text, nullable=True)
    active         = Column(Boolean, default=True, nullable=False)
    created_by     = Column(String(128), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


Base.metadata.create_all(bind=fops_engine)

# ── Auth helpers (duplicated from sources.py for isolation) ────────────────

def _require_auth(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = verify_token(auth.split(" ")[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


def _require_perm(payload: dict, perm: str):
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

# ── Template rendering ─────────────────────────────────────────────────────

def _render(template: str, variables: dict) -> str:
    """Replace {{var}} placeholders with values."""
    if not template:
        return ""
    def _sub(m: re.Match) -> str:
        return str(variables.get(m.group(1).strip(), ""))
    return re.sub(r'\{\{(\w+)\}\}', _sub, template)


def _build_vars(metadata: dict) -> dict:
    """Normalise metadata dict to template variable namespace."""
    v = {k: str(v or "") for k, v in metadata.items()}
    # songwriter → writer alias
    v.setdefault("writer_en", v.get("songwriter_en", ""))
    v.setdefault("writer_ar", v.get("songwriter_ar", ""))
    return v


def _combine_description(
    tmpl: Optional[PublishingTemplate],
    chan: Optional[PublishingChannel],
    variables: dict,
) -> str:
    """Merge channel intro + template body + subscribe + social links + footer."""
    parts: List[str] = []
    if chan and chan.intro_text:
        rendered = _render(chan.intro_text, variables)
        if rendered.strip():
            parts.append(rendered.strip())
    if tmpl and tmpl.description_template:
        rendered = _render(tmpl.description_template, variables)
        if rendered.strip():
            parts.append(rendered.strip())
    if chan and chan.subscribe_text:
        rendered = _render(chan.subscribe_text, variables)
        if rendered.strip():
            parts.append(rendered.strip())
    if chan and chan.social_links:
        try:
            links = json.loads(chan.social_links)
            link_lines = "\n".join(
                f"{platform}: {url}"
                for platform, url in links.items()
                if url and url.strip()
            )
            if link_lines:
                parts.append(link_lines)
        except Exception:
            pass
    if chan and chan.footer_text:
        rendered = _render(chan.footer_text, variables)
        if rendered.strip():
            parts.append(rendered.strip())
    return "\n\n".join(parts)

# ── Serialisers ────────────────────────────────────────────────────────────

def _tmpl_dict(t: PublishingTemplate) -> dict:
    return {
        "id":                   t.id,
        "uid":                  t.uid,
        "tenant_id":            t.tenant_id,
        "name":                 t.name,
        "type":                 t.type,
        "title_template":       t.title_template       or "",
        "description_template": t.description_template or "",
        "tags_template":        t.tags_template        or "",
        "active":               t.active,
        "created_by":           t.created_by,
        "created_at":           t.created_at.isoformat() if t.created_at else None,
        "updated_at":           t.updated_at.isoformat() if t.updated_at else None,
    }


def _chan_dict(c: PublishingChannel) -> dict:
    return {
        "id":             c.id,
        "uid":            c.uid,
        "tenant_id":      c.tenant_id,
        "channel_name":   c.channel_name,
        "intro_text":     c.intro_text     or "",
        "subscribe_text": c.subscribe_text or "",
        "social_links":   json.loads(c.social_links) if c.social_links else {},
        "footer_text":    c.footer_text    or "",
        "active":         c.active,
        "created_by":     c.created_by,
        "created_at":     c.created_at.isoformat() if c.created_at else None,
        "updated_at":     c.updated_at.isoformat() if c.updated_at else None,
    }

# ── Pydantic models ────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    type: str = "single"
    title_template:       Optional[str] = None
    description_template: Optional[str] = None
    tags_template:        Optional[str] = None


class TemplateUpdate(BaseModel):
    name:                 Optional[str]  = None
    type:                 Optional[str]  = None
    title_template:       Optional[str]  = None
    description_template: Optional[str]  = None
    tags_template:        Optional[str]  = None
    active:               Optional[bool] = None


class ChannelCreate(BaseModel):
    channel_name:   str
    intro_text:     Optional[str]           = None
    subscribe_text: Optional[str]           = None
    social_links:   Optional[Dict[str,str]] = None
    footer_text:    Optional[str]           = None


class ChannelUpdate(BaseModel):
    channel_name:   Optional[str]           = None
    intro_text:     Optional[str]           = None
    subscribe_text: Optional[str]           = None
    social_links:   Optional[Dict[str,str]] = None
    footer_text:    Optional[str]           = None
    active:         Optional[bool]          = None


class PreviewRequest(BaseModel):
    template_id: int
    channel_id:  Optional[int]          = None
    metadata:    Dict[str, Any]         = {}

# ══════════════════════════════════════════════════════════════════════════
# UTILITY ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/template-variables")
def get_template_variables(request: Request):
    """Return all supported template variables with labels."""
    _require_auth(request)
    return {
        "success": True,
        "variables": [{"key": k, "label": l} for k, l in TEMPLATE_VARIABLES],
    }

# ══════════════════════════════════════════════════════════════════════════
# TEMPLATE ENDPOINTS
# IMPORTANT: /templates/preview must be defined BEFORE /templates/{id}
# ══════════════════════════════════════════════════════════════════════════

@router.get("/templates")
def list_templates(
    request: Request,
    type:   Optional[str]  = Query(None),
    active: Optional[bool] = Query(None),
):
    payload = _require_auth(request)
    _require_perm(payload, "can_view_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        q = db.query(PublishingTemplate).filter(
            PublishingTemplate.tenant_id == tenant
        )
        if type:
            q = q.filter(PublishingTemplate.type == type)
        if active is not None:
            q = q.filter(PublishingTemplate.active == active)
        templates = q.order_by(PublishingTemplate.name).all()
        return {"success": True, "templates": [_tmpl_dict(t) for t in templates]}
    finally:
        db.close()


@router.post("/templates/preview")
def preview_template(body: PreviewRequest, request: Request):
    """Render a template with given metadata — no side effects."""
    payload = _require_auth(request)
    _require_perm(payload, "can_view_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        tmpl = db.query(PublishingTemplate).filter(
            PublishingTemplate.id == body.template_id,
            PublishingTemplate.tenant_id == tenant,
        ).first()
        if not tmpl:
            raise HTTPException(status_code=404, detail="Template not found")

        chan = None
        if body.channel_id:
            chan = db.query(PublishingChannel).filter(
                PublishingChannel.id == body.channel_id,
                PublishingChannel.tenant_id == tenant,
            ).first()

        variables = _build_vars(body.metadata)
        return {
            "success":     True,
            "title":       _render(tmpl.title_template or "", variables),
            "description": _combine_description(tmpl, chan, variables),
            "tags":        _render(tmpl.tags_template or "", variables),
            "template":    _tmpl_dict(tmpl),
            "channel":     _chan_dict(chan) if chan else None,
        }
    finally:
        db.close()


@router.post("/templates", status_code=201)
def create_template(body: TemplateCreate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_templates")
    if body.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type. Valid: {sorted(VALID_TYPES)}")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        t = PublishingTemplate(
            uid=str(uuid.uuid4()),
            tenant_id=tenant,
            name=body.name.strip(),
            type=body.type,
            title_template=body.title_template,
            description_template=body.description_template,
            tags_template=body.tags_template,
            created_by=payload.get("email") or payload.get("sub"),
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        _audit(payload.get("sub", 0), "template_created", f"publishing_template:{t.id}",
               {"name": t.name, "type": t.type}, request.client.host if request.client else "")
        return {"success": True, "template": _tmpl_dict(t)}
    finally:
        db.close()


@router.get("/templates/{template_id}")
def get_template(template_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_view_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        t = db.query(PublishingTemplate).filter(
            PublishingTemplate.id == template_id,
            PublishingTemplate.tenant_id == tenant,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"success": True, "template": _tmpl_dict(t)}
    finally:
        db.close()


@router.patch("/templates/{template_id}")
def update_template(template_id: int, body: TemplateUpdate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        t = db.query(PublishingTemplate).filter(
            PublishingTemplate.id == template_id,
            PublishingTemplate.tenant_id == tenant,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Template not found")
        changes: dict = {}
        if body.name  is not None: t.name  = body.name.strip();  changes["name"]  = t.name
        if body.type  is not None:
            if body.type not in VALID_TYPES:
                raise HTTPException(status_code=400, detail=f"Invalid type")
            t.type = body.type;  changes["type"] = t.type
        if body.title_template       is not None: t.title_template       = body.title_template
        if body.description_template is not None: t.description_template = body.description_template
        if body.tags_template        is not None: t.tags_template        = body.tags_template
        if body.active               is not None: t.active               = body.active; changes["active"] = t.active
        t.updated_at = datetime.utcnow()
        db.commit(); db.refresh(t)
        _audit(payload.get("sub", 0), "template_updated", f"publishing_template:{t.id}",
               changes, request.client.host if request.client else "")
        return {"success": True, "template": _tmpl_dict(t)}
    finally:
        db.close()


@router.delete("/templates/{template_id}")
def delete_template(template_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        t = db.query(PublishingTemplate).filter(
            PublishingTemplate.id == template_id,
            PublishingTemplate.tenant_id == tenant,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Template not found")
        name = t.name
        db.delete(t); db.commit()
        _audit(payload.get("sub", 0), "template_deleted", f"publishing_template:{template_id}",
               {"name": name}, request.client.host if request.client else "")
        return {"success": True}
    finally:
        db.close()


@router.post("/templates/{template_id}/clone")
def clone_template(template_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        t = db.query(PublishingTemplate).filter(
            PublishingTemplate.id == template_id,
            PublishingTemplate.tenant_id == tenant,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Template not found")
        clone = PublishingTemplate(
            uid=str(uuid.uuid4()),
            tenant_id=tenant,
            name=f"{t.name} (Copy)",
            type=t.type,
            title_template=t.title_template,
            description_template=t.description_template,
            tags_template=t.tags_template,
            created_by=payload.get("email") or payload.get("sub"),
        )
        db.add(clone); db.commit(); db.refresh(clone)
        return {"success": True, "template": _tmpl_dict(clone)}
    finally:
        db.close()

# ══════════════════════════════════════════════════════════════════════════
# CHANNEL TEMPLATE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/channels")
def list_channels(
    request: Request,
    active: Optional[bool] = Query(None),
):
    payload = _require_auth(request)
    _require_perm(payload, "can_view_channel_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        q = db.query(PublishingChannel).filter(PublishingChannel.tenant_id == tenant)
        if active is not None:
            q = q.filter(PublishingChannel.active == active)
        channels = q.order_by(PublishingChannel.channel_name).all()
        return {"success": True, "channels": [_chan_dict(c) for c in channels]}
    finally:
        db.close()


@router.post("/channels", status_code=201)
def create_channel(body: ChannelCreate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_channel_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        c = PublishingChannel(
            uid=str(uuid.uuid4()),
            tenant_id=tenant,
            channel_name=body.channel_name.strip(),
            intro_text=body.intro_text,
            subscribe_text=body.subscribe_text,
            social_links=json.dumps(body.social_links, ensure_ascii=False) if body.social_links else None,
            footer_text=body.footer_text,
            created_by=payload.get("email") or payload.get("sub"),
        )
        db.add(c); db.commit(); db.refresh(c)
        _audit(payload.get("sub", 0), "channel_created", f"publishing_channel:{c.id}",
               {"channel_name": c.channel_name}, request.client.host if request.client else "")
        return {"success": True, "channel": _chan_dict(c)}
    finally:
        db.close()


@router.get("/channels/{channel_id}")
def get_channel(channel_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_view_channel_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        c = db.query(PublishingChannel).filter(
            PublishingChannel.id == channel_id,
            PublishingChannel.tenant_id == tenant,
        ).first()
        if not c:
            raise HTTPException(status_code=404, detail="Channel not found")
        return {"success": True, "channel": _chan_dict(c)}
    finally:
        db.close()


@router.patch("/channels/{channel_id}")
def update_channel(channel_id: int, body: ChannelUpdate, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_channel_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        c = db.query(PublishingChannel).filter(
            PublishingChannel.id == channel_id,
            PublishingChannel.tenant_id == tenant,
        ).first()
        if not c:
            raise HTTPException(status_code=404, detail="Channel not found")
        changes: dict = {}
        if body.channel_name   is not None: c.channel_name   = body.channel_name.strip(); changes["channel_name"] = c.channel_name
        if body.intro_text     is not None: c.intro_text     = body.intro_text
        if body.subscribe_text is not None: c.subscribe_text = body.subscribe_text
        if body.social_links   is not None: c.social_links   = json.dumps(body.social_links, ensure_ascii=False)
        if body.footer_text    is not None: c.footer_text    = body.footer_text
        if body.active         is not None: c.active         = body.active; changes["active"] = c.active
        c.updated_at = datetime.utcnow()
        db.commit(); db.refresh(c)
        _audit(payload.get("sub", 0), "channel_updated", f"publishing_channel:{c.id}",
               changes, request.client.host if request.client else "")
        return {"success": True, "channel": _chan_dict(c)}
    finally:
        db.close()


@router.delete("/channels/{channel_id}")
def delete_channel(channel_id: int, request: Request):
    payload = _require_auth(request)
    _require_perm(payload, "can_manage_channel_templates")
    tenant = _tenant(payload)
    db = SessionLocal()
    try:
        c = db.query(PublishingChannel).filter(
            PublishingChannel.id == channel_id,
            PublishingChannel.tenant_id == tenant,
        ).first()
        if not c:
            raise HTTPException(status_code=404, detail="Channel not found")
        name = c.channel_name
        db.delete(c); db.commit()
        _audit(payload.get("sub", 0), "channel_deleted", f"publishing_channel:{channel_id}",
               {"channel_name": name}, request.client.host if request.client else "")
        return {"success": True}
    finally:
        db.close()
