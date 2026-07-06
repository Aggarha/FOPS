"""
Granular Permissions Management API
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

from auth.auth import verify_token
from storage.users import SessionLocal, User, Permission

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


def require_admin(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = verify_token(auth.split(" ")[1])
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload


def _perm_dict(p: Permission) -> dict:
    return {
        "id": p.id,
        "role": p.role,
        "can_approve": p.can_approve,
        "can_reject": p.can_reject,
        "can_run_tools": p.can_run_tools,
        "can_manage_users": p.can_manage_users,
        "can_view_audit": p.can_view_audit,
        "can_access_settings": p.can_access_settings,
        "can_sync_sheets": p.can_sync_sheets,
        "allowed_tools": p.allowed_tools or [],
        "description": p.description,
    }


class PermissionUpdate(BaseModel):
    can_approve: Optional[bool] = None
    can_reject: Optional[bool] = None
    can_run_tools: Optional[bool] = None
    can_manage_users: Optional[bool] = None
    can_view_audit: Optional[bool] = None
    can_access_settings: Optional[bool] = None
    can_sync_sheets: Optional[bool] = None
    allowed_tools: Optional[List[str]] = None
    description: Optional[str] = None


@router.get("")
def list_permissions(request: Request):
    """List all role permissions."""
    require_admin(request)
    db = SessionLocal()
    try:
        perms = db.query(Permission).all()
        return {"success": True, "permissions": [_perm_dict(p) for p in perms]}
    finally:
        db.close()


@router.get("/{role}")
def get_role_permission(role: str, request: Request):
    """Get permissions for a specific role."""
    require_admin(request)
    db = SessionLocal()
    try:
        p = db.query(Permission).filter(Permission.role == role).first()
        if not p:
            raise HTTPException(status_code=404, detail=f"No permissions defined for role: {role}")
        return {"success": True, "permission": _perm_dict(p)}
    finally:
        db.close()


@router.patch("/{role}")
def update_role_permission(role: str, body: PermissionUpdate, request: Request):
    """Update permissions for a specific role."""
    require_admin(request)
    db = SessionLocal()
    try:
        p = db.query(Permission).filter(Permission.role == role).first()
        if not p:
            # Create if not exists
            p = Permission(role=role)
            db.add(p)
        for field, value in body.dict(exclude_none=True).items():
            setattr(p, field, value)
        db.commit()
        db.refresh(p)
        return {"success": True, "permission": _perm_dict(p)}
    finally:
        db.close()


@router.post("/check")
def check_user_permission(request: Request):
    """Check if the current user has a specific permission."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = verify_token(auth.split(" ")[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    role = payload.get("role", "viewer")
    db = SessionLocal()
    try:
        p = db.query(Permission).filter(Permission.role == role).first()
        if not p:
            return {"role": role, "permissions": {}}
        return {"role": role, "permissions": _perm_dict(p)}
    finally:
        db.close()
