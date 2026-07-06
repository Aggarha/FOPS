from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Table, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class Release(Base):
    __tablename__ = "releases"

    id = Column(Integer, primary_key=True, index=True)
    artist_name = Column(String, nullable=False)
    song_title = Column(String, nullable=False)
    release_type = Column(String, nullable=False)  # single / album / ep / concert
    upc = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending / processing / done
    artwork_link = Column(String, nullable=True)
    metadata_link = Column(String, nullable=True)
    lyrics_link = Column(String, nullable=True)
    youtube_link = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# Import User model from auth module for proper relationships
try:
    from storage.users import User
except ImportError:
    pass  # User model defined elsewhere, relationships managed through string references


# ==================== Communication System ====================
# user_id columns are plain integers (no FK) — users live in a separate auth DB

class Message(Base):
    """Global chat messages"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    user_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    is_system = Column(Boolean, default=False)
    attachments = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Conversation(Base):
    """Private conversations between users"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user1_id = Column(Integer, nullable=False, index=True)
    user2_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_message_at = Column(DateTime(timezone=True), server_default=func.now())
    messages = relationship("DirectMessage", back_populates="conversation", cascade="all, delete-orphan")


class DirectMessage(Base):
    """Private chat messages"""
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    sender_id = Column(Integer, nullable=False, index=True)
    sender_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    read = Column(Boolean, default=False)
    attachments = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    conversation = relationship("Conversation", back_populates="messages")


class Comment(Base):
    """Comments on resources (audio matches, jobs, releases, etc.)"""
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    resource_type = Column(String, nullable=False)
    resource_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    user_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("comments.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ==================== Notification & Presence System ====================

class Notification(Base):
    """User notifications"""
    __tablename__ = "comm_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    related_user_id = Column(Integer, nullable=True)
    resource_type = Column(String, nullable=True)
    resource_id = Column(Integer, nullable=True)
    read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserPresence(Base):
    """Track user online/offline status and last activity"""
    __tablename__ = "user_presence"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, unique=True, nullable=False, index=True)
    status = Column(String, default="offline")
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_activity = Column(DateTime(timezone=True), server_default=func.now())
    current_tool = Column(String, nullable=True)


class Mention(Base):
    """Track @mentions in messages and comments"""
    __tablename__ = "mentions"

    id = Column(Integer, primary_key=True, index=True)
    mentioned_user_id = Column(Integer, nullable=False, index=True)
    source_type = Column(String, nullable=False)
    source_id = Column(Integer, nullable=False)
    mentioned_in_content = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Reaction(Base):
    """Emoji reactions on messages and comments"""
    __tablename__ = "reactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    target_type = Column(String, nullable=False)
    target_id = Column(Integer, nullable=False)
    emoji = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ==================== Video Formatter System ====================

class VideoMetadata(Base):
    """Formatted video metadata for YouTube uploads."""
    __tablename__ = "video_metadata"

    id = Column(Integer, primary_key=True, index=True)
    release_id = Column(Integer, ForeignKey("releases.id"), nullable=True)
    video_type = Column(String, nullable=False)  # Lyrics Video / Music Video / Concert
    channel = Column(String, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    tags = Column(Text, nullable=False)
    hashtags = Column(String, nullable=True)
    isrc = Column(String, nullable=True)
    upc = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ==================== YouTube Search System ====================

class YouTubeSearchResult(Base):
    """YouTube search results from advanced search (variants + fuzzy matching)."""
    __tablename__ = "youtube_search_results"

    id = Column(Integer, primary_key=True, index=True)
    release_id = Column(Integer, ForeignKey("releases.id"), nullable=True)
    song = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    video_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    channel = Column(String, nullable=True)
    views = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    similarity_score = Column(Integer, nullable=True)  # 0-100
    fingerprint_confidence = Column(Integer, nullable=True)  # 0-100 or None
    verified = Column(Boolean, default=False)
    variants_count = Column(Integer, nullable=True)
    total_candidates = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class YouTubeExtractedVideo(Base):
    """Videos extracted from channels or playlists."""
    __tablename__ = "youtube_extracted_videos"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String, nullable=False)  # channel / playlist
    source_name = Column(String, nullable=False)
    source_url = Column(String, nullable=False)
    video_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    duration_seconds = Column(Integer, nullable=True)
    views = Column(Integer, nullable=True)
    published_date = Column(DateTime(timezone=True), nullable=True)
    upload_date = Column(String, nullable=True)  # YYYYMMDD format
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ==================== Audio Fingerprint System ====================

class AudioFingerprintResult(Base):
    """Audio fingerprint verification results."""
    __tablename__ = "audio_fingerprint_results"

    id = Column(Integer, primary_key=True, index=True)
    youtube_url = Column(String, nullable=False, index=True)
    reference_url = Column(String, nullable=True)  # For comparisons
    combined_score = Column(Integer, nullable=False)  # 0-100
    verified = Column(Boolean, default=False)
    chromaprint_score = Column(Integer, nullable=True)
    spectral_score = Column(Integer, nullable=True)
    mfcc_score = Column(Integer, nullable=True)
    peaks_score = Column(Integer, nullable=True)
    dominant_algorithm = Column(String, nullable=True)
    processing_time_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ==================== LOGGING SYSTEM ====================

import enum


class LogLevel(str, enum.Enum):
    """Log severity levels."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"
    SUCCESS = "SUCCESS"


class LogCategory(str, enum.Enum):
    """Log event categories."""
    API = "API"
    TOOL = "TOOL"
    SYSTEM = "SYSTEM"
    AGENT = "AGENT"
    DATABASE = "DATABASE"
    WEBSOCKET = "WEBSOCKET"
    BACKGROUND = "BACKGROUND"
    GOOGLE_SHEETS = "GOOGLE_SHEETS"
    AUTH = "AUTH"
    DEPLOYMENT = "DEPLOYMENT"


class ActivityLog(Base):
    """Central activity logging table for all FOPS operations."""
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    
    # Core metadata
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    user_id = Column(Integer, nullable=True, index=True)  # None for system events
    session_id = Column(String(100), nullable=True, index=True)  # Group related operations
    
    # Log content
    level = Column(SQLEnum(LogLevel), default=LogLevel.INFO, index=True)
    category = Column(SQLEnum(LogCategory), nullable=False, index=True)
    title = Column(String(255), nullable=False)  # "Audio Match started", "Tool upload completed"
    message = Column(Text, nullable=True)  # Detailed message/description
    
    # Context
    tool_name = Column(String(100), nullable=True, index=True)  # "audio-match", "youtube-search", etc.
    api_route = Column(String(255), nullable=True)  # "/api/tools/audio-match", etc.
    resource_id = Column(Integer, nullable=True)  # Release ID, Job ID, etc.
    resource_type = Column(String(50), nullable=True)  # "release", "job", "upload", etc.
    
    # Additional data (JSON-serializable)
    event_metadata = Column(Text, nullable=True)  # JSON string with extra context
    
    # Performance metrics
    duration_ms = Column(Integer, nullable=True)  # How long the operation took
    memory_mb = Column(Integer, nullable=True)  # Memory used
    status = Column(String(50), nullable=True)  # "success", "failure", "running", "queued"
    error_message = Column(Text, nullable=True)  # Error details if failed
    
    # Visibility control
    is_admin_only = Column(Boolean, default=False)  # True for sensitive operations
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LogSession(Base):
    """Groups related logs into execution sessions (job, batch, etc.)."""
    __tablename__ = "log_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), unique=True, index=True)
    
    # Session metadata
    user_id = Column(Integer, nullable=True, index=True)
    title = Column(String(255), nullable=False)  # "Batch Audio Match: 5 songs", etc.
    description = Column(Text, nullable=True)
    
    # Timing
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Stats
    total_events = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    warning_count = Column(Integer, default=0)
    
    # Status
    status = Column(String(50), default="running")  # "running", "completed", "failed"
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
