"""
FOPS Fingerprint Library V1 — Persistent storage models for the fingerprinting reference database.

Tables:
  artists              — Artist information (1M-10M rows)
  albums               — Album information (2M-10M rows)
  tracks               — Track information (10M-50M rows)
  track_versions       — Track versions (original, remix, live, etc.) (50M-100M rows)
  reference_audio      — Reference audio files for each version (50M-100M rows)
  fingerprints         — Calculated fingerprints per algorithm (200M-400M rows)
  fingerprint_segments — Per-segment fingerprints (800M-2B rows)
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Column, Integer, String, DateTime, Text, ForeignKey, Float, LargeBinary,
    Index, UniqueConstraint
)
from sqlalchemy.orm import relationship

from database import Base, engine


# ==================== ENUMS ====================

class VersionType(str, Enum):
    """Allowed track version types."""
    ORIGINAL = "original"
    RADIO_EDIT = "radio_edit"
    REMASTER = "remaster"
    CLEAN = "clean"
    INSTRUMENTAL = "instrumental"
    LIVE = "live"
    REMIX = "remix"


class AlgorithmType(str, Enum):
    """Fingerprinting algorithm types."""
    CHROMAPRINT = "chromaprint"
    SPECTRAL = "spectral"
    MFCC = "mfcc"
    PEAKS = "peaks"


# ==================== MODELS ====================

class Artist(Base):
    """Artist information."""
    __tablename__ = "fp_artists"
    __table_args__ = (
        Index("ix_fp_artists_tenant_uid", "tenant_id", "uid"),
        Index("ix_fp_artists_normalized_name", "normalized_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(128), nullable=False, index=True)
    
    # Artist metadata
    name = Column(String(512), nullable=False)
    normalized_name = Column(String(512), nullable=False, index=True)  # lowercase, no accents
    mbid = Column(String(64), nullable=True, index=True)  # MusicBrainz ID
    isni = Column(String(64), nullable=True, index=True)  # International Standard Name ID
    
    # Relationships
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    albums = relationship("Album", back_populates="artist", cascade="all, delete-orphan")
    tracks = relationship("Track", back_populates="artist", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "uid": self.uid,
            "name": self.name,
            "normalized_name": self.normalized_name,
            "mbid": self.mbid,
            "isni": self.isni,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Album(Base):
    """Album information."""
    __tablename__ = "fp_albums"
    __table_args__ = (
        Index("ix_fp_albums_tenant_uid", "tenant_id", "uid"),
        Index("ix_fp_albums_artist_id", "artist_id"),
        Index("ix_fp_albums_upc", "upc"),
    )

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(128), nullable=False, index=True)
    artist_id = Column(Integer, ForeignKey("fp_artists.id"), nullable=False)
    
    # Album metadata
    title = Column(String(512), nullable=False)
    release_date = Column(String(16), nullable=True)  # YYYY-MM-DD format
    upc = Column(String(14), nullable=True, index=True)  # Universal Product Code
    mbid = Column(String(64), nullable=True, index=True)  # MusicBrainz ID
    
    # Relationships
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    artist = relationship("Artist", back_populates="albums")
    tracks = relationship("Track", back_populates="album", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "uid": self.uid,
            "artist_id": self.artist_id,
            "title": self.title,
            "release_date": self.release_date,
            "upc": self.upc,
            "mbid": self.mbid,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Track(Base):
    """Track information (song metadata)."""
    __tablename__ = "fp_tracks"
    __table_args__ = (
        Index("ix_fp_tracks_tenant_uid", "tenant_id", "uid"),
        Index("ix_fp_tracks_artist_id", "artist_id"),
        Index("ix_fp_tracks_album_id", "album_id"),
        Index("ix_fp_tracks_isrc", "isrc"),
        Index("ix_fp_tracks_upc", "upc"),
    )

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(128), nullable=False, index=True)
    artist_id = Column(Integer, ForeignKey("fp_artists.id"), nullable=False)
    album_id = Column(Integer, ForeignKey("fp_albums.id"), nullable=True)
    
    # Track metadata
    title = Column(String(512), nullable=False)
    isrc = Column(String(12), nullable=True, index=True)  # International Standard Recording Code
    upc = Column(String(14), nullable=True, index=True)  # Also used for tracks
    duration_seconds = Column(Integer, nullable=True)  # Song length
    
    # Relationships
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    artist = relationship("Artist", back_populates="tracks")
    album = relationship("Album", back_populates="tracks")
    versions = relationship("TrackVersion", back_populates="track", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "uid": self.uid,
            "artist_id": self.artist_id,
            "album_id": self.album_id,
            "title": self.title,
            "isrc": self.isrc,
            "upc": self.upc,
            "duration_seconds": self.duration_seconds,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TrackVersion(Base):
    """Track version (original, remix, live, etc.)."""
    __tablename__ = "fp_track_versions"
    __table_args__ = (
        Index("ix_fp_track_versions_tenant_uid", "tenant_id", "uid"),
        Index("ix_fp_track_versions_track_id", "track_id"),
        UniqueConstraint("track_id", "version_type", name="uq_track_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(128), nullable=False, index=True)
    track_id = Column(Integer, ForeignKey("fp_tracks.id"), nullable=False)
    
    # Version metadata
    version_type = Column(String(32), nullable=False)  # See VersionType enum
    duration_seconds = Column(Integer, nullable=True)
    
    # Relationships
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    track = relationship("Track", back_populates="versions")
    reference_audio = relationship("ReferenceAudio", back_populates="version", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "uid": self.uid,
            "track_id": self.track_id,
            "version_type": self.version_type,
            "duration_seconds": self.duration_seconds,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ReferenceAudio(Base):
    """Reference audio file for a track version."""
    __tablename__ = "fp_reference_audio"
    __table_args__ = (
        Index("ix_fp_reference_audio_tenant_uid", "tenant_id", "uid"),
        Index("ix_fp_reference_audio_version_id", "version_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(128), nullable=False, index=True)
    version_id = Column(Integer, ForeignKey("fp_track_versions.id"), nullable=False)
    
    # Reference audio metadata
    source_url = Column(String(2048), nullable=False)  # URL where downloaded from
    local_path = Column(String(1024), nullable=True)  # Path in storage
    duration_seconds = Column(Integer, nullable=True)
    file_hash = Column(String(64), nullable=True)  # SHA256 for integrity
    
    # Processing status
    status = Column(String(32), default="stored")  # stored | fingerprinted | indexed | failed
    error_message = Column(Text, nullable=True)
    
    # Relationships
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    version = relationship("TrackVersion", back_populates="reference_audio")
    fingerprints = relationship("Fingerprint", back_populates="reference_audio", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "uid": self.uid,
            "version_id": self.version_id,
            "source_url": self.source_url,
            "local_path": self.local_path,
            "duration_seconds": self.duration_seconds,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Fingerprint(Base):
    """Calculated fingerprint hash for a reference audio."""
    __tablename__ = "fp_fingerprints"
    __table_args__ = (
        Index("ix_fp_fingerprints_tenant_uid", "tenant_id", "uid"),
        Index("ix_fp_fingerprints_reference_audio_id", "reference_audio_id"),
        Index("ix_fp_fingerprints_algorithm", "algorithm"),
        UniqueConstraint("reference_audio_id", "algorithm", name="uq_fingerprint_per_algo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(128), nullable=False, index=True)
    reference_audio_id = Column(Integer, ForeignKey("fp_reference_audio.id"), nullable=False)
    
    # Fingerprint data
    algorithm = Column(String(32), nullable=False)  # See AlgorithmType enum
    fingerprint_hash = Column(Text, nullable=False)  # Serialized fingerprint (JSON or hex)
    confidence = Column(Float, nullable=True)  # Algorithm confidence score 0-1
    
    # Relationships
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    reference_audio = relationship("ReferenceAudio", back_populates="fingerprints")
    segments = relationship("FingerprintSegment", back_populates="fingerprint", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "uid": self.uid,
            "reference_audio_id": self.reference_audio_id,
            "algorithm": self.algorithm,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class FingerprintSegment(Base):
    """Per-segment fingerprint hash (30-second chunks)."""
    __tablename__ = "fp_fingerprint_segments"
    __table_args__ = (
        Index("ix_fp_segments_tenant_uid", "tenant_id", "uid"),
        Index("ix_fp_segments_fingerprint_id", "fingerprint_id"),
        Index("ix_fp_segments_hash", "fingerprint_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(128), nullable=False, index=True)
    fingerprint_id = Column(Integer, ForeignKey("fp_fingerprints.id"), nullable=False)
    
    # Segment position in track
    segment_start_seconds = Column(Float, nullable=False)
    segment_end_seconds = Column(Float, nullable=False)
    
    # Segment fingerprint
    fingerprint_hash = Column(Text, nullable=False)  # Serialized fingerprint for this segment
    confidence = Column(Float, nullable=True)  # Segment-specific confidence
    
    # Relationships
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    fingerprint = relationship("Fingerprint", back_populates="segments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "uid": self.uid,
            "fingerprint_id": self.fingerprint_id,
            "segment_start_seconds": self.segment_start_seconds,
            "segment_end_seconds": self.segment_end_seconds,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ==================== TABLE CREATION ====================

# Create tables (idempotent — skips if already exists)
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    # Ignore "index already exists" errors on SQLite
    if "already exists" not in str(e):
        raise
    logger.debug(f"Ignoring index creation error (already exists): {e}")
