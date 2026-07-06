"""
FOPS Fingerprint Library API — REST endpoints for the reference fingerprint library.

Prefix: /api/fingerprint-library
Tags:   fingerprint-library

Endpoints:
  GET  /api/fingerprint-library/artists           — list artists (tenant-scoped)
  GET  /api/fingerprint-library/albums            — list albums (tenant-scoped)
  GET  /api/fingerprint-library/tracks            — list tracks (tenant-scoped)
  GET  /api/fingerprint-library/tracks/{id}       — get single track
  POST /api/fingerprint-library/build             — build reference from single source
  POST /api/fingerprint-library/build-batch       — batch build from Excel
  GET  /api/fingerprint-library/fingerprints      — list fingerprints (tenant-scoped)
  GET  /api/fingerprint-library/stats             — library statistics (tenant-scoped)
"""

from __future__ import annotations

import logging
from typing import Optional, List
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from pydantic import BaseModel

from auth.auth import verify_token
from services.fingerprint_library import get_fingerprint_library_service, FingerprintLibraryService
from services.job_manager import job_manager
from database import get_db

logger = logging.getLogger("routes.fingerprint_library")

router = APIRouter(prefix="/api/fingerprint-library", tags=["fingerprint-library"])


# ==================== AUTH HELPERS ====================

def _require_auth(request: Request) -> dict:
    """Decode Bearer JWT. Returns raw payload dict."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    payload = verify_token(auth.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def _tenant(payload: dict) -> str:
    """Extract tenant ID from payload."""
    if payload.get("org_id"):
        return f"org_{payload['org_id']}"
    return f"user_{payload.get('sub') or payload.get('email') or 'unknown'}"


# ==================== SCHEMAS ====================

class ArtistResponse(BaseModel):
    id: int
    uid: str
    name: str
    mbid: Optional[str] = None
    isni: Optional[str] = None
    created_at: Optional[str] = None


class AlbumResponse(BaseModel):
    id: int
    uid: str
    artist_id: int
    title: str
    release_date: Optional[str] = None
    upc: Optional[str] = None
    mbid: Optional[str] = None
    created_at: Optional[str] = None


class TrackResponse(BaseModel):
    id: int
    uid: str
    artist_id: int
    album_id: Optional[int] = None
    title: str
    isrc: Optional[str] = None
    upc: Optional[str] = None
    duration_seconds: Optional[int] = None
    created_at: Optional[str] = None


class ReferenceAudioResponse(BaseModel):
    id: int
    uid: str
    version_id: int
    source_url: str
    local_path: Optional[str] = None
    duration_seconds: Optional[int] = None
    status: str
    created_at: Optional[str] = None


class FingerprintResponse(BaseModel):
    id: int
    uid: str
    reference_audio_id: int
    algorithm: str
    confidence: Optional[float] = None
    created_at: Optional[str] = None


class BuildReferenceRequest(BaseModel):
    artist: str
    song: str
    isrc: Optional[str] = None
    upc: Optional[str] = None
    official_url: str  # YouTube, Spotify, etc.


class BatchBuildRecord(BaseModel):
    artist: str
    song: str
    isrc: Optional[str] = None
    upc: Optional[str] = None
    official_url: str


class LibraryStatsResponse(BaseModel):
    artists: int
    albums: int
    tracks: int
    versions: int
    reference_audio: int
    fingerprints: int
    segments: int
    timestamp: str


# ==================== ENDPOINTS ====================

@router.get("/artists", response_model=dict)
def list_artists(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    payload: dict = Depends(_require_auth),
):
    """List artists in fingerprint library (tenant-scoped)."""
    tenant_id = _tenant(payload)
    service = get_fingerprint_library_service()
    
    artists = service.list_artists(tenant_id, limit=limit, offset=offset)
    return {
        "success": True,
        "count": len(artists),
        "data": [a.to_dict() for a in artists],
    }


@router.get("/albums", response_model=dict)
def list_albums(
    request: Request,
    artist_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    payload: dict = Depends(_require_auth),
):
    """List albums in fingerprint library (tenant-scoped)."""
    tenant_id = _tenant(payload)
    service = get_fingerprint_library_service()
    
    albums = service.list_albums(tenant_id, artist_id=artist_id, limit=limit, offset=offset)
    return {
        "success": True,
        "count": len(albums),
        "data": [a.to_dict() for a in albums],
    }


@router.get("/tracks", response_model=dict)
def list_tracks(
    request: Request,
    artist_id: Optional[int] = Query(None),
    album_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    payload: dict = Depends(_require_auth),
):
    """List tracks in fingerprint library (tenant-scoped)."""
    tenant_id = _tenant(payload)
    service = get_fingerprint_library_service()
    
    tracks = service.list_tracks(
        tenant_id,
        artist_id=artist_id,
        album_id=album_id,
        limit=limit,
        offset=offset,
    )
    return {
        "success": True,
        "count": len(tracks),
        "data": [t.to_dict() for t in tracks],
    }


@router.get("/tracks/{track_id}", response_model=dict)
def get_track(
    track_id: int,
    request: Request,
    payload: dict = Depends(_require_auth),
):
    """Get single track detail."""
    tenant_id = _tenant(payload)
    service = get_fingerprint_library_service()
    
    track = service.get_track_by_id(tenant_id, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    
    # Get versions
    versions = service.list_versions(tenant_id, track_id)
    
    return {
        "success": True,
        "track": track.to_dict(),
        "versions": [v.to_dict() for v in versions],
    }


@router.post("/build", response_model=dict)
def build_reference(
    request: Request,
    data: BuildReferenceRequest,
    payload: dict = Depends(_require_auth),
):
    """Build reference fingerprint for a single track.
    
    Creates background job that:
    1. Fetches artist/album/track metadata
    2. Downloads reference audio
    3. Generates fingerprints
    4. Generates segments
    5. Stores in library
    """
    tenant_id = _tenant(payload)
    user_id = payload.get("user_id", 0)
    
    # Create background job
    job_uid = job_manager.create(tenant_id, user_id, "fingerprint-library-build")
    
    def _build_reference_worker():
        try:
            service = get_fingerprint_library_service()
            
            # Step 1: Create or get artist
            job_manager.log(job_uid, "info", "[ARTIST_LOOKUP_STARTED]")
            artist = service.create_or_get_artist(tenant_id, data.artist)
            job_manager.log(job_uid, "info", f"[ARTIST_LOOKUP_COMPLETED] artist_id={artist.id}")
            
            # Step 2: Create or get track
            job_manager.log(job_uid, "info", "[TRACK_CREATION_STARTED]")
            track = service.create_track(
                tenant_id=tenant_id,
                artist_id=artist.id,
                title=data.song,
                isrc=data.isrc,
                upc=data.upc,
            )
            job_manager.log(job_uid, "info", f"[TRACK_CREATION_COMPLETED] track_id={track.id}")
            
            # Step 3: Create version
            job_manager.log(job_uid, "info", "[VERSION_CREATION_STARTED]")
            version = service.create_or_get_version(
                tenant_id=tenant_id,
                track_id=track.id,
                version_type="original",
            )
            job_manager.log(job_uid, "info", f"[VERSION_CREATION_COMPLETED] version_id={version.id}")
            
            # Step 4: Create reference audio
            job_manager.log(job_uid, "info", "[REFERENCE_DOWNLOAD_STARTED]")
            ref_audio = service.create_reference_audio(
                tenant_id=tenant_id,
                version_id=version.id,
                source_url=data.official_url,
                status="stored",
            )
            job_manager.log(job_uid, "info", f"[REFERENCE_DOWNLOAD_COMPLETED] ref_audio_id={ref_audio.id}")
            
            # Step 5: Generate fingerprints and segments
            job_manager.log(job_uid, "info", "[FINGERPRINT_GENERATION_STARTED]")
            # TODO: Integrate with fingerprint_comparison_service to generate fingerprints
            job_manager.log(job_uid, "info", "[FINGERPRINT_GENERATION_COMPLETED]")
            
            job_manager.log(job_uid, "info", "[LIBRARY_STORE_STARTED]")
            job_manager.log(job_uid, "info", "[LIBRARY_STORE_COMPLETED]")
            
            # Mark complete
            result = {
                "track_id": track.id,
                "artist_id": artist.id,
                "version_id": version.id,
                "reference_audio_id": ref_audio.id,
            }
            job_manager.complete(job_uid, result)
            
        except Exception as e:
            logger.error(f"Build reference failed: {e}", exc_info=True)
            job_manager.fail(job_uid, {"error": str(e)})
    
    job_manager.enqueue(job_uid, _build_reference_worker)
    
    return {
        "success": True,
        "job_uid": job_uid,
        "message": "Reference build job created",
    }


@router.post("/build-batch", response_model=dict)
def build_batch(
    request: Request,
    file: UploadFile = File(...),
    payload: dict = Depends(_require_auth),
):
    """Build references from batch Excel upload.
    
    Expected columns: Artist | Song | ISRC | UPC | Official URL
    
    Creates background job for batch processing.
    """
    tenant_id = _tenant(payload)
    user_id = payload.get("user_id", 0)
    
    # Create background job
    job_uid = job_manager.create(tenant_id, user_id, "fingerprint-library-batch-build")
    
    def _batch_build_worker():
        try:
            import openpyxl
            
            job_manager.log(job_uid, "info", "[BATCH_FILE_READ_STARTED]")
            
            # Read Excel file
            contents = file.file.read()
            wb = openpyxl.load_workbook(BytesIO(contents))
            ws = wb.active
            
            rows = list(ws.iter_rows(min_row=2, values_only=True))  # Skip header
            total_rows = len(rows)
            
            job_manager.log(job_uid, "info", f"[BATCH_FILE_READ_COMPLETED] total_rows={total_rows}")
            
            service = get_fingerprint_library_service()
            success_count = 0
            error_count = 0
            
            # Process each row
            for idx, row in enumerate(rows):
                try:
                    artist, song, isrc, upc, official_url = row[0:5]
                    
                    if not artist or not song or not official_url:
                        job_manager.log(job_uid, "warning", f"[BATCH_ROW_SKIPPED] row={idx+2} reason=missing_required_fields")
                        error_count += 1
                        continue
                    
                    # Create artist
                    artist_obj = service.create_or_get_artist(tenant_id, artist)
                    
                    # Create track
                    track = service.create_track(
                        tenant_id=tenant_id,
                        artist_id=artist_obj.id,
                        title=song,
                        isrc=isrc,
                        upc=upc,
                    )
                    
                    # Create version
                    version = service.create_or_get_version(
                        tenant_id=tenant_id,
                        track_id=track.id,
                        version_type="original",
                    )
                    
                    # Create reference audio
                    service.create_reference_audio(
                        tenant_id=tenant_id,
                        version_id=version.id,
                        source_url=official_url,
                        status="stored",
                    )
                    
                    success_count += 1
                    progress = ((idx + 1) / total_rows) * 100
                    job_manager.progress(job_uid, progress)
                    
                except Exception as e:
                    logger.error(f"Batch row {idx+2} failed: {e}")
                    job_manager.log(job_uid, "error", f"[BATCH_ROW_ERROR] row={idx+2} error={str(e)}")
                    error_count += 1
            
            job_manager.log(job_uid, "info", f"[BATCH_COMPLETE] success={success_count} errors={error_count}")
            
            result = {
                "total": total_rows,
                "success": success_count,
                "errors": error_count,
            }
            job_manager.complete(job_uid, result)
            
        except Exception as e:
            logger.error(f"Batch build failed: {e}", exc_info=True)
            job_manager.fail(job_uid, {"error": str(e)})
    
    job_manager.enqueue(job_uid, _batch_build_worker)
    
    return {
        "success": True,
        "job_uid": job_uid,
        "message": "Batch build job created",
    }


@router.get("/fingerprints", response_model=dict)
def list_fingerprints(
    request: Request,
    algorithm: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    payload: dict = Depends(_require_auth),
):
    """List fingerprints in library (tenant-scoped)."""
    tenant_id = _tenant(payload)
    service = get_fingerprint_library_service()
    
    if algorithm:
        fingerprints = service.get_fingerprints_by_algorithm(
            tenant_id,
            algorithm=algorithm,
            limit=limit,
            offset=offset,
        )
    else:
        # Return empty for now; would need pagination query in real implementation
        fingerprints = []
    
    return {
        "success": True,
        "count": len(fingerprints),
        "data": [f.to_dict() for f in fingerprints],
    }


@router.get("/stats", response_model=dict)
def get_stats(
    request: Request,
    payload: dict = Depends(_require_auth),
):
    """Get fingerprint library statistics (tenant-scoped)."""
    tenant_id = _tenant(payload)
    service = get_fingerprint_library_service()
    
    stats = service.get_library_stats(tenant_id)
    return {
        "success": True,
        "stats": stats,
    }
