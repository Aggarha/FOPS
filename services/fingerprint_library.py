"""
FOPS Fingerprint Library Service — Business logic for managing the reference fingerprint database.

Responsibilities:
- CRUD operations for artists, albums, tracks
- Reference audio management
- Fingerprint and segment generation/storage
- Lookups by ISRC, UPC, artist/title
- Tenant isolation
- Batch operations
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from sqlalchemy import and_, or_, desc
from sqlalchemy.orm import Session

from database import SessionLocal
from storage.fingerprint_library import (
    Artist, Album, Track, TrackVersion, ReferenceAudio,
    Fingerprint, FingerprintSegment, VersionType, AlgorithmType
)
from services.fingerprint_comparison_service import FingerprintComparisonService

logger = logging.getLogger("services.fingerprint_library")


class FingerprintLibraryService:
    """Service for managing the fingerprint reference library."""

    def __init__(self, db: Session | None = None):
        """Initialize with optional database session."""
        self.db = db
        self.fp_service = FingerprintComparisonService()

    def _get_db(self) -> Session:
        """Get database session (use provided or create new)."""
        if self.db:
            return self.db
        return SessionLocal()

    # ==================== ARTIST OPERATIONS ====================

    def create_or_get_artist(
        self,
        tenant_id: str,
        name: str,
        mbid: Optional[str] = None,
        isni: Optional[str] = None,
    ) -> Artist:
        """Create artist or return existing by name."""
        db = self._get_db()
        try:
            normalized = self._normalize_name(name)
            
            # Look for existing
            artist = db.query(Artist).filter_by(
                tenant_id=tenant_id,
                normalized_name=normalized,
            ).first()
            
            if artist:
                # Update metadata if provided
                if mbid and not artist.mbid:
                    artist.mbid = mbid
                if isni and not artist.isni:
                    artist.isni = isni
                db.commit()
                return artist
            
            # Create new
            artist = Artist(
                uid=str(uuid.uuid4()),
                tenant_id=tenant_id,
                name=name,
                normalized_name=normalized,
                mbid=mbid,
                isni=isni,
            )
            db.add(artist)
            db.commit()
            db.refresh(artist)
            return artist
        finally:
            if not self.db:
                db.close()

    def get_artist_by_id(self, tenant_id: str, artist_id: int) -> Optional[Artist]:
        """Get artist by ID (tenant-scoped)."""
        db = self._get_db()
        try:
            return db.query(Artist).filter_by(
                tenant_id=tenant_id,
                id=artist_id,
            ).first()
        finally:
            if not self.db:
                db.close()

    def list_artists(
        self,
        tenant_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Artist]:
        """List artists (tenant-scoped)."""
        db = self._get_db()
        try:
            return db.query(Artist).filter_by(
                tenant_id=tenant_id,
            ).offset(offset).limit(limit).all()
        finally:
            if not self.db:
                db.close()

    # ==================== ALBUM OPERATIONS ====================

    def create_album(
        self,
        tenant_id: str,
        artist_id: int,
        title: str,
        release_date: Optional[str] = None,
        upc: Optional[str] = None,
        mbid: Optional[str] = None,
    ) -> Album:
        """Create album."""
        db = self._get_db()
        try:
            album = Album(
                uid=str(uuid.uuid4()),
                tenant_id=tenant_id,
                artist_id=artist_id,
                title=title,
                release_date=release_date,
                upc=upc,
                mbid=mbid,
            )
            db.add(album)
            db.commit()
            db.refresh(album)
            return album
        finally:
            if not self.db:
                db.close()

    def get_album_by_id(self, tenant_id: str, album_id: int) -> Optional[Album]:
        """Get album by ID (tenant-scoped)."""
        db = self._get_db()
        try:
            return db.query(Album).filter_by(
                tenant_id=tenant_id,
                id=album_id,
            ).first()
        finally:
            if not self.db:
                db.close()

    def list_albums(
        self,
        tenant_id: str,
        artist_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Album]:
        """List albums (tenant-scoped)."""
        db = self._get_db()
        try:
            query = db.query(Album).filter_by(tenant_id=tenant_id)
            if artist_id:
                query = query.filter_by(artist_id=artist_id)
            return query.offset(offset).limit(limit).all()
        finally:
            if not self.db:
                db.close()

    # ==================== TRACK OPERATIONS ====================

    def create_track(
        self,
        tenant_id: str,
        artist_id: int,
        title: str,
        album_id: Optional[int] = None,
        isrc: Optional[str] = None,
        upc: Optional[str] = None,
        duration_seconds: Optional[int] = None,
    ) -> Track:
        """Create track."""
        db = self._get_db()
        try:
            track = Track(
                uid=str(uuid.uuid4()),
                tenant_id=tenant_id,
                artist_id=artist_id,
                album_id=album_id,
                title=title,
                isrc=isrc,
                upc=upc,
                duration_seconds=duration_seconds,
            )
            db.add(track)
            db.commit()
            db.refresh(track)
            return track
        finally:
            if not self.db:
                db.close()

    def get_track_by_id(self, tenant_id: str, track_id: int) -> Optional[Track]:
        """Get track by ID (tenant-scoped)."""
        db = self._get_db()
        try:
            return db.query(Track).filter_by(
                tenant_id=tenant_id,
                id=track_id,
            ).first()
        finally:
            if not self.db:
                db.close()

    def get_track_by_isrc(self, tenant_id: str, isrc: str) -> Optional[Track]:
        """Get track by ISRC (tenant-scoped)."""
        db = self._get_db()
        try:
            return db.query(Track).filter_by(
                tenant_id=tenant_id,
                isrc=isrc,
            ).first()
        finally:
            if not self.db:
                db.close()

    def get_track_by_upc(self, tenant_id: str, upc: str) -> Optional[Track]:
        """Get track by UPC (tenant-scoped)."""
        db = self._get_db()
        try:
            return db.query(Track).filter_by(
                tenant_id=tenant_id,
                upc=upc,
            ).first()
        finally:
            if not self.db:
                db.close()

    def list_tracks(
        self,
        tenant_id: str,
        artist_id: Optional[int] = None,
        album_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Track]:
        """List tracks (tenant-scoped)."""
        db = self._get_db()
        try:
            query = db.query(Track).filter_by(tenant_id=tenant_id)
            if artist_id:
                query = query.filter_by(artist_id=artist_id)
            if album_id:
                query = query.filter_by(album_id=album_id)
            return query.offset(offset).limit(limit).all()
        finally:
            if not self.db:
                db.close()

    # ==================== TRACK VERSION OPERATIONS ====================

    def create_or_get_version(
        self,
        tenant_id: str,
        track_id: int,
        version_type: str = "original",
        duration_seconds: Optional[int] = None,
    ) -> TrackVersion:
        """Create or get track version."""
        db = self._get_db()
        try:
            # Look for existing
            version = db.query(TrackVersion).filter_by(
                tenant_id=tenant_id,
                track_id=track_id,
                version_type=version_type,
            ).first()
            
            if version:
                return version
            
            # Create new
            version = TrackVersion(
                uid=str(uuid.uuid4()),
                tenant_id=tenant_id,
                track_id=track_id,
                version_type=version_type,
                duration_seconds=duration_seconds,
            )
            db.add(version)
            db.commit()
            db.refresh(version)
            return version
        finally:
            if not self.db:
                db.close()

    def list_versions(
        self,
        tenant_id: str,
        track_id: int,
    ) -> List[TrackVersion]:
        """List versions for a track."""
        db = self._get_db()
        try:
            return db.query(TrackVersion).filter_by(
                tenant_id=tenant_id,
                track_id=track_id,
            ).all()
        finally:
            if not self.db:
                db.close()

    # ==================== REFERENCE AUDIO OPERATIONS ====================

    def create_reference_audio(
        self,
        tenant_id: str,
        version_id: int,
        source_url: str,
        local_path: Optional[str] = None,
        duration_seconds: Optional[int] = None,
        file_hash: Optional[str] = None,
    ) -> ReferenceAudio:
        """Create reference audio entry."""
        db = self._get_db()
        try:
            ref_audio = ReferenceAudio(
                uid=str(uuid.uuid4()),
                tenant_id=tenant_id,
                version_id=version_id,
                source_url=source_url,
                local_path=local_path,
                duration_seconds=duration_seconds,
                file_hash=file_hash,
                status="stored",
            )
            db.add(ref_audio)
            db.commit()
            db.refresh(ref_audio)
            return ref_audio
        finally:
            if not self.db:
                db.close()

    def get_reference_audio(
        self,
        tenant_id: str,
        ref_audio_id: int,
    ) -> Optional[ReferenceAudio]:
        """Get reference audio by ID."""
        db = self._get_db()
        try:
            return db.query(ReferenceAudio).filter_by(
                tenant_id=tenant_id,
                id=ref_audio_id,
            ).first()
        finally:
            if not self.db:
                db.close()

    def list_reference_audio(
        self,
        tenant_id: str,
        version_id: int,
    ) -> List[ReferenceAudio]:
        """List reference audio for a version."""
        db = self._get_db()
        try:
            return db.query(ReferenceAudio).filter_by(
                tenant_id=tenant_id,
                version_id=version_id,
            ).all()
        finally:
            if not self.db:
                db.close()

    def update_reference_audio_status(
        self,
        tenant_id: str,
        ref_audio_id: int,
        status: str,
        error_message: Optional[str] = None,
    ) -> Optional[ReferenceAudio]:
        """Update reference audio processing status."""
        db = self._get_db()
        try:
            ref_audio = db.query(ReferenceAudio).filter_by(
                tenant_id=tenant_id,
                id=ref_audio_id,
            ).first()
            
            if not ref_audio:
                return None
            
            ref_audio.status = status
            if error_message:
                ref_audio.error_message = error_message
            ref_audio.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(ref_audio)
            return ref_audio
        finally:
            if not self.db:
                db.close()

    # ==================== FINGERPRINT OPERATIONS ====================

    def create_fingerprint(
        self,
        tenant_id: str,
        reference_audio_id: int,
        algorithm: str,
        fingerprint_hash: str,
        confidence: Optional[float] = None,
    ) -> Fingerprint:
        """Create fingerprint entry."""
        db = self._get_db()
        try:
            fingerprint = Fingerprint(
                uid=str(uuid.uuid4()),
                tenant_id=tenant_id,
                reference_audio_id=reference_audio_id,
                algorithm=algorithm,
                fingerprint_hash=fingerprint_hash,
                confidence=confidence,
            )
            db.add(fingerprint)
            db.commit()
            db.refresh(fingerprint)
            return fingerprint
        finally:
            if not self.db:
                db.close()

    def get_fingerprints_for_audio(
        self,
        tenant_id: str,
        reference_audio_id: int,
    ) -> List[Fingerprint]:
        """Get all fingerprints for a reference audio."""
        db = self._get_db()
        try:
            return db.query(Fingerprint).filter_by(
                tenant_id=tenant_id,
                reference_audio_id=reference_audio_id,
            ).all()
        finally:
            if not self.db:
                db.close()

    def get_fingerprints_by_algorithm(
        self,
        tenant_id: str,
        algorithm: str,
        limit: int = 1000,
        offset: int = 0,
    ) -> List[Fingerprint]:
        """Get fingerprints by algorithm."""
        db = self._get_db()
        try:
            return db.query(Fingerprint).filter_by(
                tenant_id=tenant_id,
                algorithm=algorithm,
            ).offset(offset).limit(limit).all()
        finally:
            if not self.db:
                db.close()

    # ==================== FINGERPRINT SEGMENT OPERATIONS ====================

    def create_fingerprint_segment(
        self,
        tenant_id: str,
        fingerprint_id: int,
        segment_start_seconds: float,
        segment_end_seconds: float,
        fingerprint_hash: str,
        confidence: Optional[float] = None,
    ) -> FingerprintSegment:
        """Create fingerprint segment."""
        db = self._get_db()
        try:
            segment = FingerprintSegment(
                uid=str(uuid.uuid4()),
                tenant_id=tenant_id,
                fingerprint_id=fingerprint_id,
                segment_start_seconds=segment_start_seconds,
                segment_end_seconds=segment_end_seconds,
                fingerprint_hash=fingerprint_hash,
                confidence=confidence,
            )
            db.add(segment)
            db.commit()
            db.refresh(segment)
            return segment
        finally:
            if not self.db:
                db.close()

    def get_segments_for_fingerprint(
        self,
        tenant_id: str,
        fingerprint_id: int,
    ) -> List[FingerprintSegment]:
        """Get all segments for a fingerprint."""
        db = self._get_db()
        try:
            return db.query(FingerprintSegment).filter_by(
                tenant_id=tenant_id,
                fingerprint_id=fingerprint_id,
            ).order_by(FingerprintSegment.segment_start_seconds).all()
        finally:
            if not self.db:
                db.close()

    # ==================== STATISTICS ====================

    def get_library_stats(self, tenant_id: str) -> Dict[str, Any]:
        """Get comprehensive library statistics."""
        db = self._get_db()
        try:
            artists_count = db.query(Artist).filter_by(tenant_id=tenant_id).count()
            albums_count = db.query(Album).filter_by(tenant_id=tenant_id).count()
            tracks_count = db.query(Track).filter_by(tenant_id=tenant_id).count()
            versions_count = db.query(TrackVersion).filter_by(tenant_id=tenant_id).count()
            ref_audio_count = db.query(ReferenceAudio).filter_by(tenant_id=tenant_id).count()
            fingerprints_count = db.query(Fingerprint).filter_by(tenant_id=tenant_id).count()
            segments_count = db.query(FingerprintSegment).filter_by(tenant_id=tenant_id).count()
            
            return {
                "artists": artists_count,
                "albums": albums_count,
                "tracks": tracks_count,
                "versions": versions_count,
                "reference_audio": ref_audio_count,
                "fingerprints": fingerprints_count,
                "segments": segments_count,
                "timestamp": datetime.utcnow().isoformat(),
            }
        finally:
            if not self.db:
                db.close()

    # ==================== HELPER METHODS ====================

    @staticmethod
    def _normalize_name(name: str) -> str:
        """Normalize artist/track name for comparison."""
        return name.lower().strip()


# Singleton instance
_instance: Optional[FingerprintLibraryService] = None


def get_fingerprint_library_service(db: Session | None = None) -> FingerprintLibraryService:
    """Get fingerprint library service instance."""
    return FingerprintLibraryService(db)
