"""
Multi-Tenant Organization Management API
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from auth.auth import verify_token
from storage.users import SessionLocal as UsersSession, User, Organization

router = APIRouter(prefix="/api/orgs", tags=["organizations"])


def require_admin(request: Request):
    """Require admin role from JWT."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = verify_token(auth.split(" ")[1])
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload


def get_caller(request: Request):
    """Get caller payload from JWT (any authenticated user)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = verify_token(auth.split(" ")[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


def _org_dict(o: Organization) -> dict:
    return {
        "id": o.id,
        "slug": o.slug,
        "name": o.name,
        "logo_url": o.logo_url,
        "primary_color": o.primary_color,
        "plan": o.plan,
        "settings": o.settings or {},
        "active": o.active,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


class OrgCreate(BaseModel):
    slug: str
    name: str
    logo_url: Optional[str] = None
    primary_color: Optional[str] = "#22c55e"
    plan: Optional[str] = "starter"
    settings: Optional[dict] = {}


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    plan: Optional[str] = None
    settings: Optional[dict] = None
    active: Optional[bool] = None


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
def list_orgs(request: Request):
    """List all organizations (admin only)."""
    require_admin(request)
    db = UsersSession()
    try:
        orgs = db.query(Organization).all()
        return {"success": True, "orgs": [_org_dict(o) for o in orgs]}
    finally:
        db.close()


@router.get("/mine")
def get_my_org(request: Request):
    """Get the organization for the current user."""
    caller = get_caller(request)
    db = UsersSession()
    try:
        user = db.query(User).filter(User.id == caller.get("user_id")).first()
        if not user or not user.org_id:
            return {"success": True, "org": None}
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        return {"success": True, "org": _org_dict(org) if org else None}
    finally:
        db.close()


@router.post("")
def create_org(body: OrgCreate, request: Request):
    """Create an organization (admin only)."""
    require_admin(request)
    db = UsersSession()
    try:
        if db.query(Organization).filter(Organization.slug == body.slug).first():
            raise HTTPException(status_code=400, detail="Slug already taken")
        org = Organization(
            slug=body.slug, name=body.name, logo_url=body.logo_url,
            primary_color=body.primary_color, plan=body.plan,
            settings=body.settings or {},
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return {"success": True, "org": _org_dict(org)}
    finally:
        db.close()


@router.patch("/{org_id}")
def update_org(org_id: int, body: OrgUpdate, request: Request):
    """Update an organization (admin only)."""
    require_admin(request)
    db = UsersSession()
    try:
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        for field, value in body.dict(exclude_none=True).items():
            setattr(org, field, value)
        db.commit()
        db.refresh(org)
        return {"success": True, "org": _org_dict(org)}
    finally:
        db.close()


@router.delete("/{org_id}")
def delete_org(org_id: int, request: Request):
    """Delete an organization (admin only)."""
    require_admin(request)
    db = UsersSession()
    try:
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(org)
        db.commit()
        return {"success": True}
    finally:
        db.close()


@router.post("/{org_id}/assign/{user_id_param}")
def assign_user_to_org(org_id: int, user_id_param: int, request: Request):
    """Assign a user to an organization (admin only)."""
    require_admin(request)
    db = UsersSession()
    try:
        user = db.query(User).filter(User.id == user_id_param).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        user.org_id = org_id
        db.commit()
        return {"success": True}
    finally:
        db.close()
