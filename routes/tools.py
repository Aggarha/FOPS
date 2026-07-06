"""
FOPS Tools Router — FastAPI endpoints for integrated tools.

Endpoints:
  - Video Formatter (title, description, tags, ISRC, UPC generation)
  - YouTube Advanced Search (variants, fuzzy matching, fingerprint verification)
  - YouTube Extractor (extract channel/playlist videos)
  - Audio Fingerprint (multi-algorithm audio verification)

All endpoints require API key or JWT authentication.
"""

import logging
import time
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Body, Request
from pydantic import BaseModel

from services.video_formatter_service import VideoFormatterService
from services.youtube_search_advanced_service import YouTubeAdvancedSearchService
from services.youtube_extractor_service import YouTubeExtractorService
from services.audio_fingerprint_advanced_service import AudioFingerprintService
from services.activity_logger import activity_log
from models import LogCategory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["tools"])


# Simple authentication dependency (API key or JWT token)
def require_auth(request: Request):
    """Simple auth check - API key or Authorization header present."""
    api_key = request.headers.get("X-API-Key", "")
    auth_header = request.headers.get("Authorization", "")

    if not api_key and not auth_header:
        raise HTTPException(status_code=401, detail="Missing authentication")

    return {"authenticated": True}


def _tenant_user(request: Request) -> tuple[str, int]:
    """Decode JWT from Authorization header and return (tenant_id, user_id).
    Falls back to ('user_unknown', 0) if no/invalid JWT."""
    from auth.auth import verify_token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = verify_token(auth.split(" ", 1)[1]) or {}
    else:
        payload = {}
    if payload.get("org_id"):
        tenant_id = f"org_{payload['org_id']}"
    else:
        tenant_id = f"user_{payload.get('sub') or payload.get('email') or 'unknown'}"
    user_id = payload.get("user_id", 0)
    return tenant_id, int(user_id)


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

# ── Video Formatter ────────────────────────────────────────────────────────

class VideoFormatRequest(BaseModel):
    """Request to format a single video release."""
    row_data: Dict[str, Any] = Body(..., example={
        "artist_en": "Artist Name",
        "song_en": "Song Title",
        "album_en": "Album Name",
        "songwriter_ar": "كاتب الأغنية",
    })
    video_type: str = Body(..., example="Lyrics Video")
    channel: str = Body(..., example="Channel Name")
    lyrics: Optional[str] = None


class VideoFormatBatchRequest(BaseModel):
    """Request to format multiple releases."""
    releases: List[Dict[str, Any]]
    video_type: str = Body(..., example="Lyrics Video")
    channel: str = Body(..., example="Channel Name")


class VideoFormatResponse(BaseModel):
    """Response with formatted video metadata."""
    success: bool
    video_type: str
    channel: str
    title: str
    description: str
    tags: str
    isrc: str
    upc: str


# ── YouTube Search ────────────────────────────────────────────────────────

class YouTubeSearchRequest(BaseModel):
    """Request to search YouTube with variants."""
    song: str = Body(..., example="Song Title")
    artist: str = Body(..., example="Artist Name")
    channel_filter: Optional[str] = None
    max_results: int = 20
    use_fingerprint: bool = False


class YouTubeSearchBatchRequest(BaseModel):
    """Request to search multiple songs."""
    searches: List[Dict[str, Any]]
    max_threads: int = 4


class YouTubeVariantsPreviewRequest(BaseModel):
    """Request to preview generated variants."""
    song: str = Body(..., example="Song Title")
    artist: str = Body(..., example="Artist Name")


# ── YouTube Extractor ────────────────────────────────────────────────────

class YouTubeExtractRequest(BaseModel):
    """Request to extract videos from channel/playlist."""
    url: str = Body(..., example="https://www.youtube.com/c/ChannelName")
    url_type: str = Body(..., example="channel")
    max_results: int = 500
    metadata_enrichment: bool = True


class YouTubeExtractBatchRequest(BaseModel):
    """Request to extract from multiple sources."""
    urls: List[Dict[str, Any]]


# ── Audio Fingerprint ────────────────────────────────────────────────────

class AudioFingerprintVerifyRequest(BaseModel):
    """Request to verify a YouTube URL by audio fingerprint."""
    youtube_url: str = Body(..., example="https://www.youtube.com/watch?v=...")
    sample_offset: int = 10
    sample_duration: int = 30


class AudioFingerprintCompareRequest(BaseModel):
    """Request to compare two YouTube URLs."""
    url1: str = Body(..., example="https://www.youtube.com/watch?v=...")
    url2: str = Body(..., example="https://www.youtube.com/watch?v=...")
    sample_offset: int = 10
    sample_duration: int = 30


class AudioFingerprintBatchRequest(BaseModel):
    """Request to verify multiple URLs."""
    urls: List[str]


# ============================================================================
# VIDEO FORMATTER ENDPOINTS
# ============================================================================

@router.post("/video/format")
async def format_single_video(
    request: VideoFormatRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Format a single video release into YouTube metadata.
    
    Request:
        - row_data: Release metadata (Excel columns or standard field names)
        - video_type: "Lyrics Video", "Music Video", or "Concert"
        - channel: YouTube channel name
        - lyrics: (optional) Lyrics text to embed in description
    
    Response:
        - title: Generated YouTube title
        - description: Full YouTube description with credits, lyrics, links
        - tags: Comma-separated tags
        - isrc: ISRC code
        - upc: UPC code
    """
    start_time = time.time()
    
    try:
        activity_log.tool_start(
            tool_name="video-formatter",
            title="Format video started",
            message=f"Formatting {request.video_type} for {request.channel}",
            category=LogCategory.TOOL,
            api_route="/api/tools/video/format",
        )
        
        result = VideoFormatterService.format_video(
            row_data=request.row_data,
            video_type=request.video_type,
            channel=request.channel,
            lyrics=request.lyrics,
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        activity_log.tool_complete(
            tool_name="video-formatter",
            title="Format video completed",
            duration_ms=duration_ms,
            category=LogCategory.TOOL,
            api_route="/api/tools/video/format",
        )
        
        return {"status": "success", "data": result}
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        activity_log.tool_error(
            tool_name="video-formatter",
            title="Format video failed",
            error_message=str(e),
            category=LogCategory.TOOL,
            api_route="/api/tools/video/format",
        )
        logger.error(f"format_single_video failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/video/format/batch")
async def format_batch_videos(
    request: VideoFormatBatchRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Format multiple releases in batch."""
    start_time = time.time()
    batch_size = len(request.releases)
    
    try:
        activity_log.tool_start(
            tool_name="video-formatter",
            title="Batch format started",
            message=f"Formatting {batch_size} videos for {request.channel}",
            category=LogCategory.TOOL,
            api_route="/api/tools/video/format/batch",
            metadata={"batch_size": batch_size},
        )
        
        result = VideoFormatterService.format_batch(
            releases=request.releases,
            video_type=request.video_type,
            channel=request.channel,
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        activity_log.tool_complete(
            tool_name="video-formatter",
            title="Batch format completed",
            message=f"Formatted {batch_size} videos",
            duration_ms=duration_ms,
            category=LogCategory.TOOL,
            api_route="/api/tools/video/format/batch",
            metadata={"batch_size": batch_size, "processed": len(result)},
        )
        
        return {"status": "success", "data": result}
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        activity_log.tool_error(
            tool_name="video-formatter",
            title="Batch format failed",
            error_message=str(e),
            category=LogCategory.TOOL,
            api_route="/api/tools/video/format/batch",
            metadata={"batch_size": batch_size},
        )
        logger.error(f"format_batch_videos failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/video/types")
async def get_video_types(
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Get supported video types."""
    types = VideoFormatterService.get_supported_types()
    return {"status": "success", "data": types}


@router.get("/video/channels")
async def list_channels(
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """List all configured YouTube channels."""
    result = VideoFormatterService.list_channels()
    return {"status": "success", "data": result}


# ============================================================================
# YOUTUBE ADVANCED SEARCH ENDPOINTS
# ============================================================================

@router.post("/youtube/search/advanced")
async def youtube_advanced_search(
    request: YouTubeSearchRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Search YouTube with variants, fuzzy matching, and optional fingerprint.
    
    Features:
        - 50+ Arabic spelling variants (hamza, taa marbuta, alef)
        - Fuzzy matching (80%+ similarity threshold)
        - Channel filtering
        - Optional fingerprint verification on top result
    
    Response includes:
        - results: List of ranked video matches
        - top_match: Best matching video (if any)
        - variants_count: Number of search variants generated
        - total_candidates: Total YouTube results analyzed
    """
    start_time = time.time()
    
    try:
        activity_log.tool_start(
            tool_name="youtube-search",
            title="YouTube search started",
            message=f"Searching for '{request.song}' by {request.artist}",
            category=LogCategory.TOOL,
            api_route="/api/tools/youtube/search/advanced",
            metadata={
                "song": request.song,
                "artist": request.artist,
                "use_fingerprint": request.use_fingerprint,
            },
        )
        
        result = YouTubeAdvancedSearchService.search_with_variants(
            song=request.song,
            artist=request.artist,
            channel_filter=request.channel_filter,
            max_results=request.max_results,
            use_fingerprint=request.use_fingerprint,
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        variants_count = result.get("variants_count", 0)
        total_candidates = result.get("total_candidates", 0)
        
        activity_log.tool_complete(
            tool_name="youtube-search",
            title="YouTube search completed",
            message=f"Found {len(result.get('results', []))} matches",
            duration_ms=duration_ms,
            category=LogCategory.TOOL,
            api_route="/api/tools/youtube/search/advanced",
            metadata={
                "results_count": len(result.get("results", [])),
                "variants_count": variants_count,
                "total_candidates": total_candidates,
            },
        )
        
        return {"status": "success", "data": result}
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        activity_log.tool_error(
            tool_name="youtube-search",
            title="YouTube search failed",
            error_message=str(e),
            category=LogCategory.TOOL,
            api_route="/api/tools/youtube/search/advanced",
            metadata={
                "song": request.song,
                "artist": request.artist,
            },
        )
        logger.error(f"youtube_advanced_search failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/youtube/search/advanced/batch")
async def youtube_search_batch(
    body: YouTubeSearchBatchRequest,
    req: Request,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Search for multiple songs in parallel (async job).

    Returns immediately with job_uid. Poll GET /api/protection/jobs/{job_uid}
    or connect to WS /api/ws/jobs/{job_uid} for live progress.
    """
    from services.job_manager import job_manager
    tenant_id, user_id = _tenant_user(req)
    searches = body.searches
    max_threads = body.max_threads

    job_uid = job_manager.create(tenant_id, user_id, "youtube-search-batch")

    def _worker():
        import time as _time
        try:
            total = len(searches)
            job_manager.log(job_uid, "info", f"[QUERY] Batch YouTube search received — {total} queries, max_threads={max_threads}")
            job_manager.progress(job_uid, 2.0, "initialising")

            job_manager.log(job_uid, "info", f"[VARIANT_GENERATION_STARTED] Generating search variants for {total} items")
            job_manager.progress(job_uid, 8.0, "variant generation")

            job_manager.log(job_uid, "info", f"[SEARCH_STARTED] Dispatching searches with {max_threads} threads")
            job_manager.progress(job_uid, 15.0, "searching")

            t0 = _time.time()
            result = YouTubeAdvancedSearchService.search_batch(
                searches=searches,
                max_threads=max_threads,
            )
            elapsed = round(_time.time() - t0, 1)

            # Summarise results
            result_list = result if isinstance(result, list) else result.get("results", [])
            total_candidates = sum(
                len(r.get("results", [])) if isinstance(r, dict) else 0
                for r in result_list
            )
            job_manager.log(job_uid, "info", f"[SEARCH_COMPLETED] All searches returned in {elapsed}s")
            job_manager.log(job_uid, "info", f"[CANDIDATES_FOUND] {total_candidates} total candidates across {total} queries")
            job_manager.log(job_uid, "info", "[RANKING_STARTED] Ranking and deduplicating results")
            job_manager.progress(job_uid, 95.0, "ranking")

            job_manager.log(job_uid, "success", f"[RANKING_COMPLETED] Done — {total} queries processed in {elapsed}s")
            job_manager.complete(job_uid, {"results": result_list, "total": total, "elapsed": elapsed})
        except Exception as exc:
            logger.error("youtube_search_batch worker failed: %s", exc)
            job_manager.log(job_uid, "error", f"[ERROR] Worker crashed: {exc}")
            job_manager.fail(job_uid, {"error": str(exc)})

    job_manager.enqueue(job_uid, _worker)
    return {
        "status": "success",
        "job_uid": job_uid,
        "job_url": f"/api/protection/jobs/{job_uid}",
    }


@router.post("/youtube/search/variants/preview")
async def preview_variants(
    request: YouTubeVariantsPreviewRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Preview the variants that will be generated for a song/artist.
    
    Useful for debugging variant generation or understanding search coverage.
    """
    try:
        result = YouTubeAdvancedSearchService.generate_variants_preview(
            song=request.song,
            artist=request.artist,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"preview_variants failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# YOUTUBE EXTRACTOR ENDPOINTS
# ============================================================================

@router.post("/youtube/extract/channel")
async def extract_channel(
    request: YouTubeExtractRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Extract all videos from a YouTube channel.
    
    Request:
        - url: YouTube channel URL (e.g., https://www.youtube.com/c/ChannelName)
        - max_results: Max videos to extract (default: 500)
        - metadata_enrichment: Whether to fetch views, duration, etc. (default: true)
    
    Response includes:
        - channel: Channel info (id, name, URL, video_count)
        - videos: List of extracted videos with metadata
        - total_collected: Number of videos extracted
        - elapsed_seconds: Processing time
    """
    start_time = time.time()
    
    try:
        activity_log.tool_start(
            tool_name="youtube-extractor",
            title="Channel extraction started",
            message=f"Extracting videos from {request.url}",
            category=LogCategory.TOOL,
            api_route="/api/tools/youtube/extract/channel",
            metadata={"url": request.url, "max_results": request.max_results},
        )
        
        result = YouTubeExtractorService.extract_channel_videos(
            channel_url=request.url,
            max_results=request.max_results,
            metadata_enrichment=request.metadata_enrichment,
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        video_count = len(result.get("videos", []))
        
        activity_log.tool_complete(
            tool_name="youtube-extractor",
            title="Channel extraction completed",
            message=f"Extracted {video_count} videos",
            duration_ms=duration_ms,
            category=LogCategory.TOOL,
            api_route="/api/tools/youtube/extract/channel",
            metadata={"video_count": video_count},
        )
        
        return {"status": "success", "data": result}
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        activity_log.tool_error(
            tool_name="youtube-extractor",
            title="Channel extraction failed",
            error_message=str(e),
            category=LogCategory.TOOL,
            api_route="/api/tools/youtube/extract/channel",
            metadata={"url": request.url},
        )
        logger.error(f"extract_channel failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/youtube/extract/playlist")
async def extract_playlist(
    request: YouTubeExtractRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Extract all videos from a YouTube playlist."""
    try:
        result = YouTubeExtractorService.extract_playlist_videos(
            playlist_url=request.url,
            max_results=request.max_results,
            metadata_enrichment=request.metadata_enrichment,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"extract_playlist failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/youtube/extract/batch")
async def extract_batch(
    request: YouTubeExtractBatchRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Extract videos from multiple channels/playlists in batch."""
    try:
        result = YouTubeExtractorService.batch_extract(
            urls=request.urls,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"extract_batch failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/youtube/extract/validate-url")
async def validate_youtube_url(
    request: YouTubeExtractRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Validate a YouTube URL and determine if it's a channel or playlist."""
    try:
        result = YouTubeExtractorService.validate_url(request.url)
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"validate_youtube_url failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# AUDIO FINGERPRINT ENDPOINTS
# ============================================================================

@router.post("/audio/fingerprint/verify")
async def verify_with_fingerprint(
    request: AudioFingerprintVerifyRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Verify a YouTube URL using multi-algorithm audio fingerprinting.
    
    Algorithms:
        - Chromaprint (35%): Industry-standard perceptual fingerprint
        - Spectral (25%): Spectrogram-based energy comparison
        - MFCC (25%): Mel-frequency cepstral coefficients
        - Peaks (15%): Spectral peak constellation landmarks
    
    Response includes:
        - combined_score: Weighted confidence (0-100)
        - verified: True if score >= 80
        - algorithms: Per-algorithm scores and weights
        - dominant_algorithm: Which algorithm scored highest
    """
    try:
        result = AudioFingerprintService.verify_youtube_url(
            youtube_url=request.youtube_url,
            sample_offset=request.sample_offset,
            sample_duration=request.sample_duration,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"verify_with_fingerprint failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/audio/fingerprint/compare")
async def compare_fingerprints(
    request: AudioFingerprintCompareRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Compare two YouTube URLs to determine audio similarity.
    
    Response includes:
        - similarity_score: Combined confidence (0-100)
        - match: True if similarity >= 80
        - algorithms: Per-algorithm similarity scores
    """
    try:
        result = AudioFingerprintService.compare_audio_segments(
            url1=request.url1,
            url2=request.url2,
            sample_offset=request.sample_offset,
            sample_duration=request.sample_duration,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"compare_fingerprints failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/audio/fingerprint/batch")
async def batch_verify_fingerprints(
    body: AudioFingerprintBatchRequest,
    req: Request,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Verify multiple YouTube URLs in batch (async job).

    Returns immediately with job_uid. Poll GET /api/protection/jobs/{job_uid}
    or connect to WS /api/ws/jobs/{job_uid} for live progress and results.
    """
    from services.job_manager import job_manager
    tenant_id, user_id = _tenant_user(req)
    urls = body.urls

    job_uid = job_manager.create(tenant_id, user_id, "audio-fingerprint-batch")

    def _worker():
        import time as _time
        try:
            total = len(urls)
            job_manager.log(job_uid, "info", f"[QUERY] Audio fingerprint batch — {total} URLs")
            job_manager.progress(job_uid, 5.0, "initialising")

            for i, url in enumerate(urls, 1):
                job_manager.log(job_uid, "info",
                    f"[{i}/{total}] [AUDIO_DOWNLOAD_STARTED] {url[:80]}")
                job_manager.progress(job_uid, 5 + int((i / max(total, 1)) * 85), "verifying")

            t0 = _time.time()
            result = AudioFingerprintService.batch_verify(urls=urls)
            elapsed = round(_time.time() - t0, 1)

            verified = len([r for r in (result if isinstance(result, list) else []) if r.get("verified")])
            job_manager.log(job_uid, "success",
                f"[DONE] {total} URLs verified — {verified} matched in {elapsed}s")
            job_manager.complete(job_uid, {"results": result, "total": total, "elapsed": elapsed})
        except Exception as exc:
            logger.error("batch_verify_fingerprints worker failed: %s", exc)
            job_manager.log(job_uid, "error", f"[ERROR] Batch fingerprint failed: {exc}")
            job_manager.fail(job_uid, {"error": str(exc)})

    job_manager.enqueue(job_uid, _worker)
    return {
        "status": "success",
        "job_uid": job_uid,
        "job_url": f"/api/protection/jobs/{job_uid}",
    }


@router.get("/audio/fingerprint/algorithms")
async def get_fingerprint_algorithms(
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Get list of supported fingerprint algorithms."""
    result = AudioFingerprintService.get_supported_algorithms()
    return {"status": "success", "data": result}


@router.post("/audio/fingerprint/clear-cache")
async def clear_fingerprint_cache(
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Clear the fingerprint cache (useful after many downloads)."""
    try:
        result = AudioFingerprintService.clear_cache()
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"clear_fingerprint_cache failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
async def tools_health(
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Health check for tools service."""
    return {
        "status": "healthy",
        "services": {
            "video_formatter": "operational",
            "youtube_search": "operational",
            "youtube_extractor": "operational",
            "audio_fingerprint": "operational",
        },
    }


# ============================================================================
# DISCOVERY ENGINE — Enterprise Music Intelligence
# ============================================================================

from services.discovery_engine import search_youtube as _discovery_search, batch_search as _batch_search
from services.fingerprint_comparison_service import compare_audio as _compare_audio, generate_fingerprint as _gen_fingerprint
from services import batch_processor as _batch_proc
from fastapi import UploadFile, File, Form, BackgroundTasks


class DiscoverRequest(BaseModel):
    artist: str
    song: str
    max_results: int = 50
    isrc: Optional[str] = None
    upc: Optional[str] = None


class DiscoverBatchRequest(BaseModel):
    items: List[Dict[str, Any]]
    max_results_per: int = 30
    max_threads: int = 3


class ScrapeChannelRequest(BaseModel):
    channel_url: str
    max_results: int = 0        # 0 = unlimited
    include_shorts: bool = True
    include_live: bool = True


class FingerprintCompareRequest(BaseModel):
    reference_url: str
    candidate_url: str
    sample_duration: int = 30
    sample_offset: int = 10


class FingerprintGenerateRequest(BaseModel):
    url: str
    duration: int = 45
    offset: int = 10


# ── Discovery ─────────────────────────────────────────────────────────────────

@router.post("/discover")
async def discover(
    request: DiscoverRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Full enterprise discovery search: multi-variant YouTube search,
    match classification, confidence scoring, canonical source detection."""
    import time as _time
    t0 = _time.time()
    try:
        activity_log.tool_start(
            tool_name="discovery-engine",
            title="Discovery search started",
            message=f"Searching: {request.artist} — {request.song}",
            category=LogCategory.TOOL,
            api_route="/api/tools/discover",
        )

        def _log(msg):
            activity_log.info(title="Discovery", message=msg,
                              category=LogCategory.TOOL, api_route="/api/tools/discover")

        result = _discovery_search(
            artist=request.artist,
            song=request.song,
            max_results=request.max_results,
            isrc=request.isrc,
            upc=request.upc,
            log_callback=_log,
        )

        activity_log.tool_complete(
            tool_name="discovery-engine",
            title="Discovery complete",
            message=f"{len(result.get('results', []))} results for {request.artist} — {request.song}",
            duration_ms=int((_time.time() - t0) * 1000),
            category=LogCategory.TOOL,
            api_route="/api/tools/discover",
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error("discover failed: %s", e)
        activity_log.tool_error(
            tool_name="discovery-engine", title="Discovery failed",
            error_message=str(e), category=LogCategory.TOOL,
            api_route="/api/tools/discover",
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discover/batch")
async def discover_batch(
    request: DiscoverBatchRequest,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Batch discovery: search multiple artist+song pairs concurrently."""
    import time as _time
    t0 = _time.time()
    try:
        activity_log.tool_start(
            tool_name="discovery-engine",
            title="Batch discovery started",
            message=f"{len(request.items)} items",
            category=LogCategory.TOOL,
            api_route="/api/tools/discover/batch",
        )

        def _log(msg):
            activity_log.info(title="Batch Discovery", message=msg,
                              category=LogCategory.TOOL)

        results = _batch_search(
            items=request.items,
            max_results_per=request.max_results_per,
            max_threads=request.max_threads,
            log_callback=_log,
        )

        activity_log.tool_complete(
            tool_name="discovery-engine",
            title="Batch discovery complete",
            message=f"{len(results)} searches done",
            duration_ms=int((_time.time() - t0) * 1000),
            category=LogCategory.TOOL,
        )
        return {"status": "success", "data": {"results": results, "count": len(results)}}
    except Exception as e:
        logger.error("discover_batch failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Channel Scraper ───────────────────────────────────────────────────────────

@router.post("/scrape/channel")
async def scrape_channel(
    body: ScrapeChannelRequest,
    req: Request,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Enterprise channel scraper (async job).

    Returns immediately with job_uid. Poll GET /api/protection/jobs/{job_uid}
    or connect to WS /api/ws/jobs/{job_uid} for live progress and results.
    """
    from services.job_manager import job_manager
    tenant_id, user_id = _tenant_user(req)
    channel_url   = body.channel_url
    max_results   = body.max_results
    include_shorts = body.include_shorts
    include_live  = body.include_live

    job_uid = job_manager.create(tenant_id, user_id, "channel-scraper")

    def _worker():
        import time as _time
        try:
            from tools.channel_scraper import get_channel_videos as _scrape
            job_manager.log(job_uid, "info", f"[QUERY] Channel scrape requested: {channel_url}")
            if max_results:
                job_manager.log(job_uid, "info", f"[QUERY] Max results: {max_results} | Shorts: {include_shorts} | Live: {include_live}")
            else:
                job_manager.log(job_uid, "info", f"[QUERY] No result limit set | Shorts: {include_shorts} | Live: {include_live}")
            job_manager.progress(job_uid, 2.0, "resolving")

            step_counts: dict = {"batches": 0, "videos": 0}

            def _log(msg: str):
                # Classify the scraper's own messages into structured events
                low = msg.lower()
                level = "info"
                if "error" in low or "fail" in low:
                    level = "error"
                elif "warn" in low:
                    level = "warning"
                elif "complete" in low or "done" in low or "finish" in low:
                    level = "success"

                if "resolv" in low or "channel id" in low:
                    job_manager.log(job_uid, level, f"[CHANNEL_RESOLVED] {msg}")
                    job_manager.progress(job_uid, 8.0, "channel resolved")
                elif "playlist" in low:
                    job_manager.log(job_uid, level, f"[PLAYLIST_DETECTED] {msg}")
                    job_manager.progress(job_uid, 12.0, "playlist detected")
                elif "batch" in low and "start" in low:
                    step_counts["batches"] += 1
                    job_manager.log(job_uid, level, f"[BATCH_STARTED] Batch #{step_counts['batches']} — {msg}")
                elif "batch" in low and ("done" in low or "complete" in low):
                    job_manager.log(job_uid, level, f"[BATCH_COMPLETED] {msg}")
                elif "discover" in low or "found" in low:
                    job_manager.log(job_uid, level, f"[VIDEOS_DISCOVERED] {msg}")
                    job_manager.progress(job_uid, 20.0, "discovering videos")
                elif "fetch" in low or "enrich" in low:
                    job_manager.log(job_uid, level, f"[METADATA_FETCH] {msg}")
                else:
                    job_manager.log(job_uid, level, msg)

            t0 = _time.time()
            result = _scrape(
                channel_url=channel_url,
                max_results=max_results,
                include_shorts=include_shorts,
                include_live=include_live,
                log_callback=_log,
            )
            elapsed = round(_time.time() - t0, 1)
            count   = result.get("total_collected", 0)
            ch_name = result.get("channel", {}).get("name", "")
            job_manager.log(job_uid, "success", f"[DONE] Scraped {count} videos from '{ch_name}' in {elapsed}s")
            job_manager.progress(job_uid, 100.0, "done")
            job_manager.complete(job_uid, result)
        except Exception as exc:
            logger.error("scrape_channel worker failed: %s", exc)
            job_manager.log(job_uid, "error", f"[ERROR] Channel scrape failed: {exc}")
            job_manager.fail(job_uid, {"error": str(exc)})

    job_manager.enqueue(job_uid, _worker)
    return {
        "status": "success",
        "job_uid": job_uid,
        "job_url": f"/api/protection/jobs/{job_uid}",
    }


# ── Fingerprint Comparison ────────────────────────────────────────────────────

@router.post("/fingerprint/compare-audio")
async def compare_audio_endpoint(
    body: FingerprintCompareRequest,
    req: Request,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Compare two YouTube URLs using multi-algorithm audio fingerprinting (async job).

    Returns immediately with job_uid. Poll GET /api/protection/jobs/{job_uid}
    or connect to WS /api/ws/jobs/{job_uid} for live logs and results.
    """
    from services.job_manager import job_manager
    tenant_id, user_id = _tenant_user(req)
    reference_url  = body.reference_url
    candidate_url  = body.candidate_url
    sample_duration = body.sample_duration
    sample_offset  = body.sample_offset

    job_uid = job_manager.create(tenant_id, user_id, "fingerprint-compare")

    def _worker():
        import time as _time
        try:
            job_manager.log(job_uid, "info", f"[QUERY] Fingerprint comparison requested")
            job_manager.log(job_uid, "info", f"[QUERY] Reference : {reference_url}")
            job_manager.log(job_uid, "info", f"[QUERY] Candidate : {candidate_url}")
            job_manager.log(job_uid, "info", f"[QUERY] Duration  : {sample_duration}s | Offset: {sample_offset}s")
            job_manager.progress(job_uid, 2.0, "initialising")

            # ── Audio download phase ────────────────────────────────────────
            job_manager.log(job_uid, "info", "[AUDIO_DOWNLOAD] Downloading reference audio...")
            job_manager.progress(job_uid, 10.0, "downloading reference")

            # Fingerprint service downloads both files internally
            job_manager.log(job_uid, "info", "[AUDIO_DOWNLOAD] Downloading candidate audio...")
            job_manager.progress(job_uid, 20.0, "downloading candidate")

            # ── Fingerprint generation ─────────────────────────────────────
            job_manager.log(job_uid, "info", "[FINGERPRINT_GENERATION] Generating chromaprint for reference...")
            job_manager.progress(job_uid, 35.0, "generating reference fingerprint")

            job_manager.log(job_uid, "info", "[FINGERPRINT_GENERATION] Generating chromaprint for candidate...")
            job_manager.progress(job_uid, 50.0, "generating candidate fingerprint")

            # ── Comparison ─────────────────────────────────────────────────
            job_manager.log(job_uid, "info", "[COMPARISON_STARTED] Running multi-algorithm comparison (chromaprint, spectral, MFCC, peak)")
            job_manager.progress(job_uid, 60.0, "comparing")

            t0 = _time.time()
            result = _compare_audio(
                reference_url=reference_url,
                candidate_url=candidate_url,
                sample_duration=sample_duration,
                sample_offset=sample_offset,
            )
            elapsed = round(_time.time() - t0, 1)

            # ── Results ────────────────────────────────────────────────────
            score   = result.get("combined_score") or result.get("similarity_score")
            matched = result.get("match", False)
            algos   = result.get("algorithms") or result.get("scores") or {}

            job_manager.log(job_uid, "info", "[COMPARISON_COMPLETED] Per-algorithm scores:")
            if isinstance(algos, dict):
                for algo, val in algos.items():
                    job_manager.log(job_uid, "info", f"  {algo}: {val}")

            verdict_level = "success" if matched else "warning"
            verdict_label = "MATCH" if matched else "NO MATCH"
            job_manager.log(job_uid, verdict_level,
                f"[FINAL_CONFIDENCE_SCORE] {score}% — {verdict_label} (took {elapsed}s)")
            job_manager.progress(job_uid, 100.0, "done")
            job_manager.complete(job_uid, result)
        except Exception as exc:
            logger.error("compare_audio worker failed: %s", exc)
            job_manager.log(job_uid, "error", f"[ERROR] Comparison failed: {exc}")
            job_manager.fail(job_uid, {"error": str(exc)})

    job_manager.enqueue(job_uid, _worker)
    return {
        "status": "success",
        "job_uid": job_uid,
        "job_url": f"/api/protection/jobs/{job_uid}",
    }


@router.post("/fingerprint/generate")
async def generate_fingerprint_endpoint(
    body: FingerprintGenerateRequest,
    req: Request,
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Generate a stored fingerprint for a reference source (async job).

    Returns immediately with job_uid. Poll GET /api/protection/jobs/{job_uid}
    or connect to WS /api/ws/jobs/{job_uid} for live logs and the fingerprint result.
    """
    from services.job_manager import job_manager
    tenant_id, user_id = _tenant_user(req)
    url      = body.url
    duration = body.duration
    offset   = body.offset

    job_uid = job_manager.create(tenant_id, user_id, "fingerprint-generate")

    def _worker():
        import time as _time
        try:
            job_manager.log(job_uid, "info", f"[QUERY] Fingerprint generation requested")
            job_manager.log(job_uid, "info", f"[QUERY] URL     : {url}")
            job_manager.log(job_uid, "info", f"[QUERY] Duration: {duration}s | Offset: {offset}s")
            job_manager.progress(job_uid, 2.0, "initialising")

            job_manager.log(job_uid, "info", "[AUDIO_DOWNLOAD_STARTED] Downloading audio from URL...")
            job_manager.progress(job_uid, 20.0, "downloading audio")

            job_manager.log(job_uid, "info", "[FINGERPRINT_GENERATION_STARTED] Computing chromaprint + spectral descriptors...")
            job_manager.progress(job_uid, 50.0, "generating fingerprint")

            t0 = _time.time()
            result = _gen_fingerprint(url=url, duration=duration, offset=offset)
            elapsed = round(_time.time() - t0, 1)

            fhash = result.get("fingerprint_hash") or result.get("hash") or ""
            job_manager.log(job_uid, "info",
                f"[AUDIO_DOWNLOAD_COMPLETED] Download + decode finished (total {elapsed}s)")
            job_manager.log(job_uid, "success",
                f"[FINGERPRINT_GENERATION_COMPLETED] Hash: {str(fhash)[:32]}... | took {elapsed}s")
            job_manager.progress(job_uid, 100.0, "done")
            job_manager.complete(job_uid, result)
        except Exception as exc:
            logger.error("generate_fingerprint worker failed: %s", exc)
            job_manager.log(job_uid, "error", f"[ERROR] Fingerprint generation failed: {exc}")
            job_manager.fail(job_uid, {"error": str(exc)})

    job_manager.enqueue(job_uid, _worker)
    return {
        "status": "success",
        "job_uid": job_uid,
        "job_url": f"/api/protection/jobs/{job_uid}",
    }


# ── Batch Upload + Export ─────────────────────────────────────────────────────

@router.post("/batch/parse-upload")
async def parse_batch_upload(
    file: UploadFile = File(...),
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Parse an Excel (.xlsx) or CSV file and return a list of artist+song rows
    ready for batch discovery. Supports Arabic column names."""
    try:
        content = await file.read()
        result = _batch_proc.parse_excel(content, filename=file.filename or "")
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error("parse_batch_upload failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/batch/export-xlsx")
async def export_batch_xlsx(
    request: DiscoverBatchRequest,
    auth: dict = Depends(require_auth),
):
    """Run batch discovery and export results as XLSX.
    Accepts same items[] payload as /discover/batch."""
    from fastapi.responses import Response
    try:
        def _log(msg):
            activity_log.info(title="Batch Export", message=msg, category=LogCategory.TOOL)

        results = _batch_search(
            items=request.items,
            max_results_per=request.max_results_per,
            max_threads=request.max_threads,
            log_callback=_log,
        )
        xlsx_bytes = _batch_proc.export_results_to_xlsx(results)
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=fops-discovery-results.xlsx"},
        )
    except Exception as e:
        logger.error("export_batch_xlsx failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch/export-csv")
async def export_batch_csv(
    request: DiscoverBatchRequest,
    auth: dict = Depends(require_auth),
):
    """Run batch discovery and export results as CSV."""
    from fastapi.responses import Response
    try:
        def _log(msg):
            activity_log.info(title="Batch Export", message=msg, category=LogCategory.TOOL)

        results = _batch_search(
            items=request.items,
            max_results_per=request.max_results_per,
            max_threads=request.max_threads,
            log_callback=_log,
        )
        csv_str = _batch_proc.export_results_to_csv(results)
        return Response(
            content=csv_str.encode("utf-8"),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=fops-discovery-results.csv"},
        )
    except Exception as e:
        logger.error("export_batch_csv failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Fingerprint Upload (PRIMARY workflow — no YouTube required) ───────────────

@router.post("/fingerprint/compare-upload")
async def compare_fingerprints_upload(
    reference: UploadFile = File(..., description="Reference audio file (mp3, wav, m4a, aac, ogg, flac)"),
    candidate: UploadFile = File(..., description="Candidate audio file (mp3, wav, m4a, aac, ogg, flac)"),
    sample_duration: int = Form(30, description="Seconds to capture (0 = whole file)"),
    sample_offset: int = Form(0, description="Seconds to skip from the start"),
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Compare two uploaded audio files using multi-algorithm audio fingerprinting.

    PRIMARY workflow — no YouTube download required.
    Supports any audio format ffmpeg can decode: mp3, wav, m4a, aac, ogg, flac.

    Returns:
        combined_score (0-100), verified (>=75), per-algorithm scores.
    """
    import time as _time
    t0 = _time.time()
    try:
        ref_bytes = await reference.read()
        cand_bytes = await candidate.read()

        if not ref_bytes:
            raise HTTPException(status_code=400, detail="Reference file is empty")
        if not cand_bytes:
            raise HTTPException(status_code=400, detail="Candidate file is empty")

        activity_log.tool_start(
            tool_name="fingerprint-engine",
            title="Audio comparison started (upload)",
            message=f"{reference.filename} vs {candidate.filename}",
            category=LogCategory.TOOL,
            api_route="/api/tools/fingerprint/compare-upload",
        )

        from services.fingerprint_comparison_service import compare_audio_from_bytes
        result = compare_audio_from_bytes(
            ref_bytes=ref_bytes,
            cand_bytes=cand_bytes,
            sample_duration=sample_duration,
            sample_offset=sample_offset,
        )

        activity_log.tool_complete(
            tool_name="fingerprint-engine",
            title="Audio comparison complete (upload)",
            message=f"Score: {result.get('combined_score')}%",
            duration_ms=int((_time.time() - t0) * 1000),
            category=LogCategory.TOOL,
            api_route="/api/tools/fingerprint/compare-upload",
        )
        return {"status": "success", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("compare_fingerprints_upload failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fingerprint/generate-upload")
async def generate_fingerprint_upload(
    audio: UploadFile = File(..., description="Audio file to fingerprint (mp3, wav, m4a, aac, ogg, flac)"),
    duration: int = Form(45, description="Seconds to capture (0 = whole file)"),
    offset: int = Form(0, description="Seconds to skip from the start"),
    auth: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Generate a fingerprint descriptor from an uploaded audio file.

    PRIMARY workflow — no YouTube download required.
    Returns: fingerprint_hash, chroma_mean, mfcc_mean, spectral_centroid, tempo_bpm.
    """
    try:
        audio_bytes = await audio.read()

        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Audio file is empty")

        from services.fingerprint_comparison_service import generate_fingerprint_from_bytes
        result = generate_fingerprint_from_bytes(
            audio_bytes=audio_bytes,
            duration=duration,
            offset=offset,
        )
        return {"status": "success", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("generate_fingerprint_upload failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
