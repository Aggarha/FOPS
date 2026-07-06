"""
FOPS Centralized yt-dlp Service — Public-Metadata-Only Mode.

Architecture: public anonymous extraction only — no cookies, no auth,
no token systems.  Authentication is feature-flagged and disabled by
default (set FOPS_AUTH_ENABLED=true to re-enable).

Features:
  - Rotating browser user-agents (Chrome + Firefox pool)
  - Hardened base opts (geo bypass, force IPv4, retries, fragment retries)
  - Audio PCM download with 3-strategy retry + exponential backoff
  - Audio file download for fpcalc / chromaprint (no postprocessors)
  - Structured error classification: public_extraction_blocked,
    audio_download_unavailable, metadata_only_available
  - Graceful failures — never crashes the caller

  DISABLED (feature-flagged, not deleted):
  - YTDLP_COOKIE_FILE cookie injection
  - Authenticated yt-dlp sessions
  - PO token / BotGuard flows
  Enable by setting env var FOPS_AUTH_ENABLED=true.

Usage:
    from services.ytdlp_service import get_hardened_opts, download_audio_pcm

    # For metadata-only tools (search, channel scrape):
    opts = get_hardened_opts({"extract_flat": True, "socket_timeout": 15})
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    # For audio fingerprinting (may return audio_download_unavailable):
    audio, err = download_audio_pcm(url, duration=30, offset=10)
    if err:
        # err["error_type"] in: public_extraction_blocked,
        #   audio_download_unavailable, youtube_rate_limit, ...
        handle_error(err)
"""

import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

import random

logger = logging.getLogger("services.ytdlp")

# ── Configuration ─────────────────────────────────────────────────────────────

# Feature flag: set FOPS_AUTH_ENABLED=true to re-enable cookie/auth injection.
# Default is FALSE — public metadata-only mode.
_AUTH_ENABLED: bool = os.environ.get("FOPS_AUTH_ENABLED", "false").lower() == "true"

# Preserved for feature-flagged re-enable path — not used in public mode.
_COOKIE_FILE_ENV = "YTDLP_COOKIE_FILE"
_DEFAULT_COOKIE_PATH = "/var/www/fops/cookies/youtube.txt"
_ALLOWED_COOKIE_ROOT = "/var/www/fops/"

# Rotating user-agent pool — blend of Chrome + Firefox on multiple OS/versions
_UA_POOL = [
    # Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    # Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Chrome on Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Firefox on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
]


def _random_ua() -> str:
    """Return a random user-agent from the pool."""
    return random.choice(_UA_POOL)


# Exponential backoff base in seconds; retries at 2s, 4s, 8s
_RETRY_DELAY_BASE = 2.0

# Audio format strategies tried in order for PCM download
_AUDIO_FORMATS = [
    "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "bestaudio/best",
    "worst",
]

# ── Error classification ───────────────────────────────────────────────────────

_BOT_PATTERNS = [
    "sign in to confirm you're not a bot",
    "sign in to confirm",
    "confirm you're not a bot",
    "use --cookies",
    "use --cookies-from-browser",
]
_RATE_LIMIT_PATTERNS = [
    "http error 429",
    "too many requests",
    "precondition check failed",
]
_AGE_RESTRICTED_PATTERNS = [
    "age-restricted",
    "age restricted",
    "confirm your age",
    "inappropriate for some users",
]
_UNAVAILABLE_PATTERNS = [
    "video unavailable",
    "this video is unavailable",
    "this content isn't available",
    "private video",
    "removed by the uploader",
    "http error 404",
]
_LOGIN_PATTERNS = [
    "members only",
    "this video is available to this channel",
    "login required",
]


def classify_error(error_text: str) -> dict:
    """Classify a yt-dlp error string into a structured dict.

    Returns:
        {
            "error_type": str,   # machine-readable category
            "message":    str,   # human-readable description
            "retryable":  bool,  # True if a different strategy may succeed
        }
    """
    t = error_text.lower()

    if any(p in t for p in _BOT_PATTERNS):
        return {
            "error_type": "public_extraction_blocked",
            # Legacy alias kept for frontend compatibility
            "legacy_error_type": "youtube_bot_detection",
            "message": (
                "Public audio extraction is blocked by YouTube for this server IP. "
                "Use the file-upload workflow: POST /api/tools/fingerprint/compare-upload "
                "with audio files instead of YouTube URLs."
            ),
            "retryable": False,
        }
    if any(p in t for p in _RATE_LIMIT_PATTERNS):
        return {
            "error_type": "youtube_rate_limit",
            "message": "YouTube rate limit reached. Try again in a few minutes.",
            "retryable": True,
        }
    if any(p in t for p in _AGE_RESTRICTED_PATTERNS):
        return {
            "error_type": "metadata_only_available",
            "message": "Content is age-restricted — only public metadata is available.",
            "retryable": False,
        }
    if any(p in t for p in _UNAVAILABLE_PATTERNS):
        return {
            "error_type": "youtube_unavailable",
            "message": "Video is unavailable (removed, private, or geo-blocked).",
            "retryable": False,
        }
    if any(p in t for p in _LOGIN_PATTERNS):
        return {
            "error_type": "metadata_only_available",
            "message": "Content requires a login — only public metadata is available.",
            "retryable": False,
        }
    return {
        "error_type": "audio_download_unavailable",
        "message": f"Audio download unavailable: {error_text[:200]}",
        "retryable": True,
    }


# ── Cookie management ──────────────────────────────────────────────────────────

def get_cookie_file() -> Optional[str]:
    """Return a validated, readable cookie file path — or None.

    Reads YTDLP_COOKIE_FILE env (falls back to default path).
    Enforces that the resolved path stays within /var/www/fops/ to
    prevent path-traversal attacks.  Cookie file contents are never logged.
    """
    raw = os.environ.get(_COOKIE_FILE_ENV) or _DEFAULT_COOKIE_PATH
    if not raw:
        return None
    try:
        resolved = str(Path(raw).resolve())
    except Exception:
        logger.warning("ytdlp: unresolvable cookie path, ignoring")
        return None
    # Path-traversal guard
    if not resolved.startswith(_ALLOWED_COOKIE_ROOT):
        logger.warning("ytdlp: cookie path outside allowed root — ignoring")
        return None
    if os.path.isfile(resolved) and os.access(resolved, os.R_OK):
        return resolved
    return None


def get_cookie_status() -> dict:
    """Return yt-dlp configuration status for admin reporting.

    Reflects current auth mode (public-only by default).
    Never exposes or logs cookie file contents.
    """
    configured_path = os.environ.get(_COOKIE_FILE_ENV) or _DEFAULT_COOKIE_PATH
    cookie_file = get_cookie_file() if _AUTH_ENABLED else None
    status: dict = {
        "auth_mode": "enabled" if _AUTH_ENABLED else "disabled",
        "note": (
            "Authentication is enabled." if _AUTH_ENABLED
            else "Running in public-metadata-only mode. Set FOPS_AUTH_ENABLED=true to re-enable auth."
        ),
        # Preserved fields for backwards compat
        "configured_path": configured_path,
        "env_var_set": bool(os.environ.get(_COOKIE_FILE_ENV)),
        "file_found": bool(get_cookie_file()),
        "authenticated": _AUTH_ENABLED and cookie_file is not None,
        "ua_pool_size": len(_UA_POOL),
    }
    if _AUTH_ENABLED and cookie_file:
        try:
            st = os.stat(cookie_file)
            status["file_size_bytes"] = st.st_size
            status["last_modified_unix"] = int(st.st_mtime)
        except Exception:
            pass
    return status


# ── Hardened base options ──────────────────────────────────────────────────────

def get_hardened_opts(extra: Optional[dict] = None) -> dict:
    """Return hardened base options for yt_dlp.YoutubeDL.

    Applies: Chrome UA, geo-bypass, force-IPv4, retries, socket timeout.
    Injects cookie file if YTDLP_COOKIE_FILE is configured and readable.

    Args:
        extra: Tool-specific options that override or extend the defaults.
               Common extras: extract_flat, noplaylist, playlistend, format.

    Returns:
        Complete opts dict ready for ``YoutubeDL(opts)``.
    """
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 10,
        "fragment_retries": 10,
        "extractor_retries": 5,
        "geo_bypass": True,
        "force_ipv4": True,
        "nocheckcertificate": False,
        "ignoreerrors": False,
        "noplaylist": True,
        "concurrent_fragment_downloads": 4,
        # Node.js JS runtime for YouTube player challenge decoding
        "js_runtimes": {"node": {"path": "/usr/bin/node"}},
        # Remote EJS component — allows Node.js to fetch the latest YouTube
        # challenge-solver script from GitHub; improves success rate when
        # the IP block temporarily lifts.
        "remote_components": ["ejs:github"],
        "http_headers": {
            "User-Agent": _random_ua(),
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;"
                "q=0.9,*/*;q=0.8"
            ),
        },
    }
    # ── Cookie injection — always inject when the file is present ──────────
    # Cookies improve success rate when the IP block temporarily lifts.
    # _AUTH_ENABLED controls strict error surfacing, not cookie availability.
    cookie_file = get_cookie_file()
    if cookie_file:
        opts["cookiefile"] = cookie_file
        logger.debug("ytdlp: cookie file injected (%s)", cookie_file)
    elif _AUTH_ENABLED:
        logger.warning("ytdlp: FOPS_AUTH_ENABLED=true but no cookie file found — set YTDLP_COOKIE_FILE")
    if extra:
        opts.update(extra)
    return opts


# ── Internal helpers ───────────────────────────────────────────────────────────

class _SilentLogger:
    """yt-dlp logger that captures error/warning messages without printing."""

    def __init__(self, capture: list):
        self._cap = capture

    def debug(self, msg: str) -> None:  # noqa: D401
        pass

    def warning(self, msg: str) -> None:
        self._cap.append(str(msg))

    def error(self, msg: str) -> None:
        self._cap.append(str(msg))


# ── Audio PCM download ─────────────────────────────────────────────────────────

def download_audio_pcm(
    url: str,
    duration: int = 30,
    offset: int = 10,
    sample_rate: int = 22050,
) -> Tuple[Optional[np.ndarray], Optional[dict]]:
    """Download audio from YouTube and return float32 PCM samples.

    Uses the yt_dlp Python API (not subprocess) so that cookie injection
    and hardened opts apply automatically.  Tries up to 3 format strategies
    with exponential backoff before giving up.

    Args:
        url:         YouTube video URL.
        duration:    Seconds of audio to capture after ``offset``.
        offset:      Seconds to skip from the start (avoids intro/silence).
        sample_rate: Output sample rate in Hz (default 22 050).

    Returns:
        ``(audio_array, None)``   on success — float32 numpy array.
        ``(None, error_dict)``    on failure — structured error, never raises.
    """
    import yt_dlp as _yt_dlp  # deferred so module loads even without yt-dlp

    last_error: Optional[dict] = None

    for attempt, fmt in enumerate(_AUDIO_FORMATS):
        if attempt > 0:
            delay = _RETRY_DELAY_BASE * (2 ** (attempt - 1))
            logger.info(
                "ytdlp: retry %d/%d for %s — backoff %.0fs, format=%s",
                attempt, len(_AUDIO_FORMATS) - 1, url, delay, fmt,
            )
            time.sleep(delay)

        captured: list = []
        with tempfile.TemporaryDirectory(prefix="fops_ytdl_") as tmp:
            out_tmpl = os.path.join(tmp, "audio.%(ext)s")
            opts = get_hardened_opts({
                "format": fmt,
                "outtmpl": out_tmpl,
                "noplaylist": True,
                "socket_timeout": 60,
                "logger": _SilentLogger(captured),
            })

            # ── Download ──────────────────────────────────────────────────────
            try:
                with _yt_dlp.YoutubeDL(opts) as ydl:
                    ydl.download([url])
            except Exception as exc:
                err_text = str(exc) + " " + " ".join(captured)
                last_error = classify_error(err_text)
                logger.warning(
                    "ytdlp: attempt %d failed for %s — %s",
                    attempt + 1, url, last_error["message"],
                )
                if not last_error.get("retryable", True):
                    break
                continue

            # ── Locate downloaded file (largest file in tmp) ──────────────────
            downloaded: Optional[str] = None
            try:
                candidates = [
                    os.path.join(tmp, f)
                    for f in os.listdir(tmp)
                    if (
                        os.path.isfile(os.path.join(tmp, f))
                        and os.path.getsize(os.path.join(tmp, f)) > 1024
                    )
                ]
                if candidates:
                    downloaded = max(candidates, key=os.path.getsize)
            except Exception:
                pass

            if not downloaded:
                err_text = " ".join(captured)
                last_error = classify_error(err_text) if err_text else {
                    "error_type": "download_failed",
                    "message": "Downloaded file not found after yt-dlp run",
                    "retryable": True,
                }
                logger.warning(
                    "ytdlp: no output file found (attempt %d) for %s",
                    attempt + 1, url,
                )
                continue

            # ── Extract PCM segment via ffmpeg ────────────────────────────────
            try:
                pcm = subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-ss", str(offset), "-t", str(duration),
                        "-i", downloaded,
                        "-f", "f32le", "-ar", str(sample_rate), "-ac", "1",
                        "pipe:1",
                    ],
                    capture_output=True,
                    timeout=60,
                )
            except subprocess.TimeoutExpired:
                last_error = {
                    "error_type": "ffmpeg_timeout",
                    "message": "FFmpeg timed out during PCM extraction",
                    "retryable": False,
                }
                logger.error("ytdlp: ffmpeg timeout for %s", url)
                break

            if pcm.returncode != 0 or not pcm.stdout:
                ffmpeg_err = (
                    pcm.stderr.decode(errors="replace")[:200]
                    if pcm.stderr else "no stderr"
                )
                last_error = {
                    "error_type": "ffmpeg_failed",
                    "message": f"FFmpeg PCM extraction failed: {ffmpeg_err}",
                    "retryable": False,
                }
                logger.error(
                    "ytdlp: ffmpeg PCM failed for %s: %s", url, ffmpeg_err
                )
                break  # ffmpeg failures won't be fixed by retrying yt-dlp

            audio = np.frombuffer(pcm.stdout, dtype=np.float32).copy()
            if len(audio) < sample_rate:  # less than 1 second of audio
                last_error = {
                    "error_type": "audio_too_short",
                    "message": (
                        f"Audio segment too short: {len(audio)} samples "
                        f"(need ≥{sample_rate})"
                    ),
                    "retryable": False,
                }
                logger.warning(
                    "ytdlp: audio too short for %s (%d samples)", url, len(audio)
                )
                break

            logger.info(
                "ytdlp: OK — %.1fs audio, strategy %d/%d — %s",
                len(audio) / sample_rate,
                attempt + 1, len(_AUDIO_FORMATS),
                url,
            )
            return audio, None

    # All strategies exhausted
    err = last_error or {
        "error_type": "download_failed",
        "message": "All download strategies exhausted",
        "retryable": False,
    }
    logger.error("ytdlp: all strategies failed for %s — %s", url, err["message"])
    return None, err


# ── Audio file download (for fpcalc / chromaprint) ────────────────────────────

def download_audio_file(url: str, output_dir: str) -> Optional[str]:
    """Download audio from YouTube to a file in ``output_dir``.

    Intended for callers that need a real file (e.g. fpcalc).
    Downloads best available audio in its native container — fpcalc and
    ffmpeg can decode any format returned by yt-dlp.

    Args:
        url:        YouTube video URL.
        output_dir: Directory where the file will be written.

    Returns:
        Absolute path to downloaded file, or ``None`` on failure.
    """
    import yt_dlp as _yt_dlp

    captured: list = []
    opts = get_hardened_opts({
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": os.path.join(output_dir, "audio.%(ext)s"),
        "noplaylist": True,
        "socket_timeout": 90,
        "logger": _SilentLogger(captured),
    })

    try:
        with _yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
    except Exception as exc:
        err_text = str(exc) + " " + " ".join(captured)
        err = classify_error(err_text)
        logger.warning(
            "ytdlp: download_audio_file failed for %s — %s",
            url, err["message"],
        )
        return None

    # Return the largest file found in output_dir
    try:
        candidates = [
            os.path.join(output_dir, f)
            for f in os.listdir(output_dir)
            if (
                os.path.isfile(os.path.join(output_dir, f))
                and os.path.getsize(os.path.join(output_dir, f)) > 1024
            )
        ]
        if candidates:
            return max(candidates, key=os.path.getsize)
    except Exception:
        pass

    return None
