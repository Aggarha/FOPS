"""
User and Permissions Database Models.

Multi-user system with role-based access control.

Tables:
  - users: id, email, password_hash, full_name, role, created_at, active
  - permissions: id, role, can_approve, can_reject, can_run_tools, allowed_tools (JSON list)
  - audit_log: id, user_id, action, resource, timestamp
"""

from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, JSON, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from pathlib import Path

# Database setup
DB_PATH = Path(__file__).parent.parent / "users.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    """User account model."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)  # bcrypt hash
    full_name = Column(String, nullable=True)
    role = Column(String, default="viewer", nullable=False)  # admin, analyst, operator, viewer
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    last_login = Column(DateTime, nullable=True)
    org_id = Column(Integer, nullable=True)  # FK to organizations.id (nullable = no org isolation)

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"


class Permission(Base):
    """Role-based permissions model."""
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String, unique=True, index=True, nullable=False)  # admin, analyst, operator, viewer
    
    # Core action permissions
    can_approve = Column(Boolean, default=False, nullable=False)
    can_reject = Column(Boolean, default=False, nullable=False)
    can_run_tools = Column(Boolean, default=False, nullable=False)
    can_manage_users = Column(Boolean, default=False, nullable=False)
    can_view_audit = Column(Boolean, default=False, nullable=False)
    
    # Tool-specific access (JSON list of tool names)
    allowed_tools = Column(JSON, default=[], nullable=False)
    
    # Platform permissions
    can_access_settings = Column(Boolean, default=False, nullable=False)
    can_sync_sheets = Column(Boolean, default=False, nullable=False)

    # Publishing source permissions (Phase A1)
    can_view_sources    = Column(Boolean, default=False, nullable=False)
    can_manage_sources  = Column(Boolean, default=False, nullable=False)
    can_manage_mappings = Column(Boolean, default=False, nullable=False)

    # Release picker permissions (Phase A2)
    can_view_release_picker = Column(Boolean, default=False, nullable=False)

    # Template permissions (Phase A3)
    can_view_templates          = Column(Boolean, default=False, nullable=False)
    can_manage_templates        = Column(Boolean, default=False, nullable=False)
    can_view_channel_templates  = Column(Boolean, default=False, nullable=False)
    can_manage_channel_templates= Column(Boolean, default=False, nullable=False)

    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<Permission(role={self.role})>"


class Organization(Base):
    """Organization / tenant model for multi-tenant support."""
    __tablename__ = "organizations"

    id           = Column(Integer, primary_key=True, index=True)
    slug         = Column(String, unique=True, index=True, nullable=False)  # url-safe name
    name         = Column(String, nullable=False)
    logo_url     = Column(String, nullable=True)
    primary_color = Column(String, default="#22c55e")  # green
    plan         = Column(String, default="starter")   # starter | pro | enterprise
    settings     = Column(JSON, default={})             # arbitrary org settings
    active       = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Organization(id={self.id}, slug={self.slug})>"


class AuditLog(Base):
    """Audit log for tracking user actions."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    action = Column(String, nullable=False)  # approve, reject, run_tool, login, etc.
    resource = Column(String, nullable=True)  # song, tool_name, etc.
    details = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    def __repr__(self):
        return f"<AuditLog(user_id={self.user_id}, action={self.action})>"


def init_db():
    """Initialize database with default permissions."""
    Base.metadata.create_all(bind=engine)
    
    # Create default permissions if they don't exist
    db = SessionLocal()
    try:
        # Check if permissions already exist
        admin_perm = db.query(Permission).filter_by(role="admin").first()
        if not admin_perm:
            # Admin — full access
            db.add(Permission(
                role="admin",
                can_approve=True,
                can_reject=True,
                can_run_tools=True,
                can_manage_users=True,
                can_view_audit=True,
                allowed_tools=[
                    "audio-match",
                    "youtube-search",
                    "fingerprint-check",
                    "channel-scrape",
                    "youtube-format",
                    "video-formatter"
                ],
                can_access_settings=True,
                can_sync_sheets=True,
                can_view_sources=True,
                can_manage_sources=True,
                can_manage_mappings=True,
                can_view_release_picker=True,
                can_view_templates=True,
                can_manage_templates=True,
                can_view_channel_templates=True,
                can_manage_channel_templates=True,
                description="Administrator with full system access"
            ))
            
            # Analyst — can approve/reject + run tools
            db.add(Permission(
                role="analyst",
                can_approve=True,
                can_reject=True,
                can_run_tools=True,
                can_manage_users=False,
                can_view_audit=True,
                allowed_tools=[
                    "audio-match",
                    "youtube-search",
                    "fingerprint-check",
                    "channel-scrape"
                ],
                can_access_settings=False,
                can_sync_sheets=False,
                can_view_sources=True,
                can_manage_sources=True,
                can_manage_mappings=True,
                can_view_release_picker=True,
                can_view_templates=True,
                can_manage_templates=True,
                can_view_channel_templates=True,
                can_manage_channel_templates=True,
                description="Can approve/reject decisions and run analysis tools"
            ))
            
            # Operator — can run tools but limited actions
            db.add(Permission(
                role="operator",
                can_approve=False,
                can_reject=False,
                can_run_tools=True,
                can_manage_users=False,
                can_view_audit=False,
                allowed_tools=[
                    "audio-match",
                    "youtube-search"
                ],
                can_access_settings=False,
                can_sync_sheets=False,
                can_view_sources=True,
                can_manage_sources=False,
                can_manage_mappings=False,
                can_view_release_picker=True,
                can_view_templates=True,
                can_manage_templates=False,
                can_view_channel_templates=True,
                can_manage_channel_templates=False,
                description="Can run basic search and matching tools"
            ))
            
            # Viewer — read-only access
            db.add(Permission(
                role="viewer",
                can_approve=False,
                can_reject=False,
                can_run_tools=False,
                can_manage_users=False,
                can_view_audit=False,
                allowed_tools=[],
                can_access_settings=False,
                can_sync_sheets=False,
                can_view_sources=False,
                can_manage_sources=False,
                can_manage_mappings=False,
                can_view_release_picker=False,
                can_view_templates=False,
                can_manage_templates=False,
                can_view_channel_templates=False,
                can_manage_channel_templates=False,
                description="Read-only access to dashboard"
            ))
            
            db.commit()
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
