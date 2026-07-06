"""
FOPS Fingerprint Comparison Service — Audio Reference Matching.

Architecture (public-metadata-only mode):

  PRIMARY workflow — internal audio (preferred, always available):
    compare_audio_arrays(ref_arr, cand_arr)        — numpy arrays already in memory
    compare_audio_from_bytes(ref_bytes, cand_bytes) — uploaded file bytes
    generate_fingerprint_from_bytes(audio_bytes)    — uploaded file bytes

  SECONDARY workflow — optional public YouTube extraction (may be blocked):
    compare_audio(reference_url, candidate_url)    — YouTube URLs
    generate_fingerprint(url)                      — YouTube URL

  When secondary extraction fails the functions return structured errors:
    error_type: "public_extraction_blocked"
    error_type: "audio_download_unavailable"
    error_type: "metadata_only_available"

Uses:
  - ffmpeg (audio conversion + trim)
  - librosa (spectral analysis, MFCC)
  - scipy (peak constellation)
  - numpy (fingerprint math)
  - yt-dlp via ytdlp_service (optional, public-only, may fail gracefully)
"""

import hashlib
import logging
import os
import subprocess
import tempfile
from collections import OrderedDict
from typing import Optional

import numpy as np

logger = logging.getLogger("services.fingerprint_comparison")

SAMPLE_RATE = 22050
SAMPLE_DURATION = 30
SAMPLE_OFFSET = 10
CACHE_MAX = 30

# Algorithm weights
WEIGHTS = {
    "chromaprint": 0.35,
    "spectral": 0.30,
    "mfcc": 0.25,
    "peaks": 0.10,
}

_audio_cache: OrderedDict = OrderedDict()


def _cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


# ── Audio decode helpers ──────────────────────────────────────────────────────

def _bytes_to_pcm(audio_bytes: bytes, sample_rate: int = SAMPLE_RATE,
                  offset: int = 0, duration: int = 0) -> np.ndarray:
    """Decode arbitrary audio bytes to float32 PCM via ffmpeg.

    Supports any format ffmpeg handles: mp3, wav, aac, m4a, ogg, flac, etc.

    Raises:
        RuntimeError: If ffmpeg fails or produces empty output.
    """
    if not audio_bytes:
        raise RuntimeError("Empty audio data received")

    with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as f:
        f.write(audio_bytes)
        tmppath = f.name

    try:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", tmppath]
        if offset > 0:
            cmd += ["-ss", str(offset)]
        if duration > 0:
            cmd += ["-t", str(duration)]
        cmd += ["-ac", "1", "-ar", str(sample_rate), "-f", "f32le", "pipe:1"]

        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            raise RuntimeError(f"ffmpeg decode failed: {stderr[:300]}")

        audio = np.frombuffer(result.stdout, dtype=np.float32).copy()
        if len(audio) == 0:
            raise RuntimeError("ffmpeg produced empty audio output")
        return audio
    finally:
        try:
            os.unlink(tmppath)
        except Exception:
            pass


def _download_audio(url: str, duration: int = SAMPLE_DURATION,
                    offset: int = SAMPLE_OFFSET) -> Optional[np.ndarray]:
    """Attempt public YouTube audio download.  Returns None on any failure.

    Uses ytdlp_service (public-only mode, no auth).  Caller handles None.
    Results are cached in-memory (LRU, max CACHE_MAX).
    """
    key = _cache_key(url)
    if key in _audio_cache:
        _audio_cache.move_to_end(key)
        return _audio_cache[key]

    from services.ytdlp_service import download_audio_pcm
    audio, err = download_audio_pcm(url, duration=duration, offset=offset,
                                    sample_rate=SAMPLE_RATE)
    if err is not None:
        logger.warning(
            "fingerprint_comparison: download failed for %s — [%s] %s",
            url, err.get("error_type", "unknown"), err.get("message", ""),
        )
        return None

    _audio_cache[key] = audio
    if len(_audio_cache) > CACHE_MAX:
        _audio_cache.popitem(last=False)
    return audio


# ── Per-algorithm fingerprint functions ──────────────────────────────────────

def _chromaprint_score(ref: np.ndarray, cand: np.ndarray) -> float:
    """Chromaprint-style chroma feature comparison."""
    try:
        import librosa
        ref_chroma = librosa.feature.chroma_cqt(y=ref, sr=SAMPLE_RATE, bins_per_octave=36)
        cand_chroma = librosa.feature.chroma_cqt(y=cand, sr=SAMPLE_RATE, bins_per_octave=36)
        min_frames = min(ref_chroma.shape[1], cand_chroma.shape[1])
        if min_frames < 10:
            return 0.0
        r = ref_chroma[:, :min_frames].flatten()
        c = cand_chroma[:, :min_frames].flatten()
        norm_r = np.linalg.norm(r)
        norm_c = np.linalg.norm(c)
        if norm_r < 1e-6 or norm_c < 1e-6:
            return 0.0
        return max(0.0, float(np.dot(r, c) / (norm_r * norm_c)) * 100.0)
    except Exception as e:
        logger.debug("chromaprint_score error: %s", e)
        return 0.0


def _mfcc_score(ref: np.ndarray, cand: np.ndarray) -> float:
    """MFCC timbral comparison."""
    try:
        import librosa
        r_mfcc = librosa.feature.mfcc(y=ref, sr=SAMPLE_RATE, n_mfcc=20)
        c_mfcc = librosa.feature.mfcc(y=cand, sr=SAMPLE_RATE, n_mfcc=20)
        min_frames = min(r_mfcc.shape[1], c_mfcc.shape[1])
        if min_frames < 10:
            return 0.0
        r_mean = r_mfcc[:, :min_frames].mean(axis=1)
        c_mean = c_mfcc[:, :min_frames].mean(axis=1)
        norm_r = np.linalg.norm(r_mean)
        norm_c = np.linalg.norm(c_mean)
        if norm_r < 1e-6 or norm_c < 1e-6:
            return 0.0
        return max(0.0, float(np.dot(r_mean, c_mean) / (norm_r * norm_c)) * 100.0)
    except Exception as e:
        logger.debug("mfcc_score error: %s", e)
        return 0.0


def _spectral_score(ref: np.ndarray, cand: np.ndarray) -> float:
    """Spectral energy band comparison."""
    try:
        import librosa
        n_bands = 8
        hop = 512
        r_spec = np.abs(librosa.stft(ref, hop_length=hop))
        c_spec = np.abs(librosa.stft(cand, hop_length=hop))
        band_size = r_spec.shape[0] // n_bands
        r_energy = np.array([r_spec[i * band_size:(i + 1) * band_size].mean() for i in range(n_bands)])
        c_energy = np.array([c_spec[i * band_size:(i + 1) * band_size].mean() for i in range(n_bands)])
        norm_r = np.linalg.norm(r_energy)
        norm_c = np.linalg.norm(c_energy)
        if norm_r < 1e-6 or norm_c < 1e-6:
            return 0.0
        return max(0.0, float(np.dot(r_energy, c_energy) / (norm_r * norm_c)) * 100.0)
    except Exception as e:
        logger.debug("spectral_score error: %s", e)
        return 0.0


def _peaks_score(ref: np.ndarray, cand: np.ndarray) -> float:
    """Spectral peak constellation (Shazam-style landmark similarity)."""
    try:
        from scipy.signal import spectrogram, find_peaks

        def _peaks(audio):
            f, t, Sxx = spectrogram(audio, fs=SAMPLE_RATE, nperseg=1024)
            energy = Sxx.mean(axis=1)
            peaks, _ = find_peaks(energy, height=np.percentile(energy, 70))
            return set(peaks.tolist())

        r_peaks = _peaks(ref)
        c_peaks = _peaks(cand)
        if not r_peaks or not c_peaks:
            return 0.0
        intersection = len(r_peaks & c_peaks)
        union = len(r_peaks | c_peaks)
        return (intersection / union) * 100.0 if union > 0 else 0.0
    except Exception as e:
        logger.debug("peaks_score error: %s", e)
        return 0.0


def _run_comparison(ref_audio: np.ndarray, cand_audio: np.ndarray,
                    t0: float, extra_fields: Optional[dict] = None) -> dict:
    """Core comparison: run all algorithms and return result dict."""
    import time
    scores = {
        "chromaprint": _chromaprint_score(ref_audio, cand_audio),
        "spectral":    _spectral_score(ref_audio, cand_audio),
        "mfcc":        _mfcc_score(ref_audio, cand_audio),
        "peaks":       _peaks_score(ref_audio, cand_audio),
    }
    combined = round(sum(scores[k] * WEIGHTS[k] for k in WEIGHTS), 1)
    result = {
        "success":                  True,
        "algorithms":               {k: {"score": round(v, 1), "weight": WEIGHTS[k]} for k, v in scores.items()},
        "combined_score":           combined,
        "verified":                 combined >= 75.0,
        "processing_time_seconds":  round(time.time() - t0, 2),
        "error":                    None,
        "workflow":                 "internal",
    }
    if extra_fields:
        result.update(extra_fields)
    return result


def _error_result(message: str, t0: float, error_type: str = "audio_download_unavailable") -> dict:
    import time
    return {
        "success":                  False,
        "error_type":               error_type,
        "error":                    message,
        "message":                  message,
        "combined_score":           0.0,
        "verified":                 False,
        "processing_time_seconds":  round(time.time() - t0, 2),
    }


def _compute_fingerprint_descriptor(audio: np.ndarray, t0: float, source: str) -> dict:
    """Compute fingerprint descriptor from PCM array."""
    import time
    try:
        import librosa
        chroma = librosa.feature.chroma_cqt(y=audio, sr=SAMPLE_RATE, bins_per_octave=36)
        chroma_mean = chroma.mean(axis=1).tolist()
        mfcc = librosa.feature.mfcc(y=audio, sr=SAMPLE_RATE, n_mfcc=20)
        mfcc_mean = mfcc.mean(axis=1).tolist()
        centroid = float(librosa.feature.spectral_centroid(y=audio, sr=SAMPLE_RATE).mean())
        tempo, _ = librosa.beat.beat_track(y=audio, sr=SAMPLE_RATE)
        tempo = float(tempo) if hasattr(tempo, "__float__") else 0.0
        fp_hash = hashlib.sha256(
            (str(chroma_mean[:6]) + str(mfcc_mean[:6])).encode()
        ).hexdigest()[:32]
        return {
            "success":                  True,
            "source":                   source,
            "fingerprint_hash":         fp_hash,
            "chroma_mean":              chroma_mean,
            "mfcc_mean":                mfcc_mean,
            "spectral_centroid":        centroid,
            "tempo_bpm":                tempo,
            "processing_time_seconds":  round(time.time() - t0, 2),
        }
    except Exception as e:
        logger.error("_compute_fingerprint_descriptor error: %s", e)
        return {
            "success":                  False,
            "error_type":               "audio_decode_failed",
            "error":                    str(e),
            "processing_time_seconds":  round(time.time() - t0, 2),
        }


# ── Public API — PRIMARY (upload-first, no network required) ─────────────────

def compare_audio_arrays(ref_audio: np.ndarray, cand_audio: np.ndarray) -> dict:
    """Compare two in-memory float32 PCM arrays.

    PRIMARY workflow — no downloads, no external calls.
    """
    import time
    t0 = time.time()
    if ref_audio is None or len(ref_audio) == 0:
        return _error_result("Reference audio array is empty", t0)
    if cand_audio is None or len(cand_audio) == 0:
        return _error_result("Candidate audio array is empty", t0)
    return _run_comparison(ref_audio, cand_audio, t0)


def compare_audio_from_bytes(
    ref_bytes: bytes,
    cand_bytes: bytes,
    sample_duration: int = SAMPLE_DURATION,
    sample_offset: int = 0,
) -> dict:
    """Compare two uploaded audio files (raw bytes).

    PRIMARY workflow — decodes via ffmpeg, no YouTube calls.
    Accepts any format ffmpeg supports: mp3, wav, aac, m4a, ogg, flac, etc.
    """
    import time
    t0 = time.time()
    try:
        ref_audio = _bytes_to_pcm(ref_bytes, SAMPLE_RATE, offset=sample_offset,
                                   duration=sample_duration)
    except Exception as e:
        return _error_result(f"Failed to decode reference audio: {e}", t0)
    try:
        cand_audio = _bytes_to_pcm(cand_bytes, SAMPLE_RATE, offset=sample_offset,
                                    duration=sample_duration)
    except Exception as e:
        return _error_result(f"Failed to decode candidate audio: {e}", t0)
    return _run_comparison(ref_audio, cand_audio, t0, extra_fields={"workflow": "upload"})


def generate_fingerprint_from_bytes(
    audio_bytes: bytes,
    duration: int = 45,
    offset: int = 0,
) -> dict:
    """Generate fingerprint descriptor from uploaded audio bytes.

    PRIMARY workflow — no YouTube calls.
    """
    import time
    t0 = time.time()
    try:
        audio = _bytes_to_pcm(audio_bytes, SAMPLE_RATE, offset=offset, duration=duration)
    except Exception as e:
        return {
            "success":                  False,
            "error_type":               "audio_decode_failed",
            "error":                    str(e),
            "processing_time_seconds":  round(time.time() - t0, 2),
        }
    return _compute_fingerprint_descriptor(audio, t0, source="upload")


# ── Public API — SECONDARY (optional YouTube, graceful failure) ───────────────

def compare_audio(
    reference_url: str,
    candidate_url: str,
    sample_duration: int = SAMPLE_DURATION,
    sample_offset: int = SAMPLE_OFFSET,
    log_callback=None,
) -> dict:
    """Compare audio of two YouTube URLs (SECONDARY / optional workflow).

    Returns public_extraction_blocked or audio_download_unavailable if
    YouTube rejects the request.  Never crashes.
    """
    import time
    t0 = time.time()

    def _log(msg: str):
        if log_callback:
            try:
                log_callback(msg)
            except Exception:
                pass

    _log(f"[compare] Downloading reference audio — {reference_url[:70]} (sample: {sample_duration}s offset: {sample_offset}s)")
    ref_audio = _download_audio(reference_url, sample_duration, sample_offset)
    if ref_audio is None:
        _log("[compare] Reference audio download failed — YouTube extraction blocked on this server")
        return {
            "success":                  False,
            "error_type":               "public_extraction_blocked",
            "error":                    "public_extraction_blocked",
            "message":                  (
                "YouTube audio extraction is unavailable from this server. "
                "Use the file-upload endpoint: POST /api/tools/fingerprint/compare-upload"
            ),
            "guidance":                 "upload_workflow_required",
            "combined_score":           0.0,
            "verified":                 False,
            "processing_time_seconds":  round(time.time() - t0, 2),
        }
    _log(f"[compare] Reference audio downloaded ({len(ref_audio)} samples @ {SAMPLE_RATE}Hz)")

    _log(f"[compare] Downloading candidate audio — {candidate_url[:70]}")
    cand_audio = _download_audio(candidate_url, sample_duration, sample_offset)
    if cand_audio is None:
        _log("[compare] Candidate audio download failed")
        return {
            "success":                  False,
            "error_type":               "audio_download_unavailable",
            "error":                    "audio_download_unavailable",
            "message":                  "Failed to download candidate audio from YouTube.",
            "combined_score":           0.0,
            "verified":                 False,
            "processing_time_seconds":  round(time.time() - t0, 2),
        }
    _log(f"[compare] Candidate audio downloaded ({len(cand_audio)} samples @ {SAMPLE_RATE}Hz)")
    _log("[compare] Running algorithms: chromaprint (35%), spectral (30%), MFCC (25%), peak constellation (10%)")
    result = _run_comparison(
        ref_audio, cand_audio, t0,
        extra_fields={
            "reference_url": reference_url,
            "candidate_url": candidate_url,
            "workflow":      "youtube_public",
        },
    )
    score  = result.get("combined_score", 0)
    verified = result.get("verified", False)
    algos  = result.get("algorithms", {})
    _log(
        f"[compare] Algorithm scores — "
        f"chromaprint: {algos.get('chromaprint', {}).get('score', 0):.1f}% | "
        f"spectral: {algos.get('spectral', {}).get('score', 0):.1f}% | "
        f"MFCC: {algos.get('mfcc', {}).get('score', 0):.1f}% | "
        f"peaks: {algos.get('peaks', {}).get('score', 0):.1f}%"
    )
    _log(f"[compare] Final confidence: {score:.1f}% — {'MATCH ✓' if verified else 'no match ✗'} (threshold: 75%)")
    return result


def generate_fingerprint(url: str, duration: int = 45, offset: int = 10, log_callback=None) -> dict:
    """Generate fingerprint from a YouTube URL (SECONDARY / optional workflow).

    Returns public_extraction_blocked if YouTube rejects the request.
    """
    import time
    t0 = time.time()

    def _log(msg: str):
        if log_callback:
            try:
                log_callback(msg)
            except Exception:
                pass

    _log(f"[fingerprint] Downloading audio — {url[:70]} (duration: {duration}s offset: {offset}s)")
    audio = _download_audio(url, duration, offset)
    if audio is None:
        _log("[fingerprint] Audio download failed — YouTube extraction blocked on this server")
        return {
            "success":                  False,
            "error_type":               "public_extraction_blocked",
            "error":                    "public_extraction_blocked",
            "message":                  (
                "YouTube audio extraction is unavailable from this server. "
                "Use the file-upload endpoint: POST /api/tools/fingerprint/generate-upload"
            ),
            "url":                      url,
            "processing_time_seconds":  round(time.time() - t0, 2),
        }
    _log(f"[fingerprint] Audio downloaded ({len(audio)} samples) — computing chroma, MFCC, spectral centroid, tempo")
    result = _compute_fingerprint_descriptor(audio, t0, source=url)
    if result.get("success"):
        fp_hash  = result.get("fingerprint_hash", "")[:12]
        tempo    = result.get("tempo_bpm", 0)
        centroid = result.get("spectral_centroid", 0)
        _log(f"[fingerprint] Descriptor computed — hash: {fp_hash}... | tempo: {tempo:.1f} BPM | centroid: {centroid:.0f} Hz")
    else:
        _log(f"[fingerprint] Descriptor computation failed: {result.get('error', 'unknown')}")
    return result
