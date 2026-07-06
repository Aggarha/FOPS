"""
Audio Fingerprint Matching — Pure function tool (v2).

Multi-algorithm audio fingerprinting system:
  1. Chromaprint (AcoustID) — industry-standard perceptual fingerprint
  2. Spectral Band Energy — spectrogram-based energy comparison
  3. MFCC — Mel-frequency cepstral coefficients (timbral similarity)
  4. Spectral Peak Constellation — Shazam-style landmark matching

Provides per-algorithm scores + weighted combined confidence.
Includes in-memory LRU cache so the same URL is never downloaded twice.

No GUI, no threading, no permanent file I/O — API-ready.
"""

import hashlib
import json
import logging
import os
import re
import subprocess
import tempfile
from collections import OrderedDict
from dataclasses import dataclass, field, asdict

import numpy as np
from scipy.signal import spectrogram, find_peaks
from scipy.fft import dct

logger = logging.getLogger("tools.fingerprint")

# ── constants ──────────────────────────────────────────────────

SAMPLE_DURATION = 30     # seconds to capture
SAMPLE_RATE = 22050      # Hz — good for music analysis
CACHE_MAX = 50           # max cached audio downloads

# Algorithm weights for combined score
WEIGHTS = {
    "chromaprint": 0.35,
    "spectral": 0.25,
    "mfcc": 0.25,
    "peaks": 0.15,
}

# ── cache ──────────────────────────────────────────────────────

_audio_cache: OrderedDict[str, np.ndarray] = OrderedDict()
_chromaprint_cache: OrderedDict[str, str] = OrderedDict()


def _cache_key(url: str) -> str:
    """Stable cache key from URL."""
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def clear_cache() -> dict:
    """Clear the audio + chromaprint download caches."""
    a_count = len(_audio_cache)
    c_count = len(_chromaprint_cache)
    _audio_cache.clear()
    _chromaprint_cache.clear()
    logger.info("fingerprint: cache cleared (%d audio, %d chromaprint)", a_count, c_count)
    return {"cleared_audio": a_count, "cleared_chromaprint": c_count}


# ── download ───────────────────────────────────────────────────

def download_audio_segment(
    url: str,
    duration: int = SAMPLE_DURATION,
    offset: int = 10,
    use_cache: bool = True,
) -> np.ndarray:
    """Download audio from a URL and return raw PCM samples.

    Skips the first `offset` seconds to avoid intros/silence.
    Results are cached in memory (LRU, max CACHE_MAX).

    Args:
        url: YouTube or audio URL.
        duration: Seconds of audio to capture.
        offset: Seconds to skip from the start.
        use_cache: Use in-memory cache (default True).

    Returns:
        1-D numpy float32 array at SAMPLE_RATE Hz.
    """
    if not url:
        raise ValueError("URL is required")

    key = _cache_key(url)
    if use_cache and key in _audio_cache:
        _audio_cache.move_to_end(key)
        logger.info("fingerprint: cache hit for %s", url)
        return _audio_cache[key]

    logger.info("fingerprint: downloading %ds audio (offset %ds) from %s", duration, offset, url)

    from services.ytdlp_service import download_audio_pcm
    audio, err = download_audio_pcm(url, duration=duration, offset=offset, sample_rate=SAMPLE_RATE)
    if err is not None:
        error_type = err.get("error_type", "download_failed")
        raise RuntimeError(f"{error_type}: {err['message']}")

    if len(audio) == 0:
        raise RuntimeError("audio_download_unavailable: Downloaded audio is empty")

    # cache
    if use_cache:
        _audio_cache[key] = audio
        if len(_audio_cache) > CACHE_MAX:
            _audio_cache.popitem(last=False)

    logger.info("fingerprint: captured %d samples (%.1fs)", len(audio), len(audio) / SAMPLE_RATE)
    return audio


# ── bytes → PCM (upload workflow) ────────────────────────────────

def audio_from_bytes(
    audio_bytes: bytes,
    duration: int = SAMPLE_DURATION,
    offset: int = 0,
) -> np.ndarray:
    """Decode uploaded audio bytes to float32 PCM samples.

    PRIMARY upload workflow — no network calls, no YouTube required.
    Accepts any format ffmpeg handles: mp3, wav, m4a, aac, ogg, flac.

    Returns:
        1-D numpy float32 array at SAMPLE_RATE Hz.

    Raises:
        RuntimeError: If ffmpeg fails or produces empty output.
    """
    from services.fingerprint_comparison_service import _bytes_to_pcm
    return _bytes_to_pcm(audio_bytes, sample_rate=SAMPLE_RATE,
                         offset=offset, duration=duration)


# ── chromaprint (acoustid) ─────────────────────────────────────

def get_chromaprint(url: str, duration: int = SAMPLE_DURATION) -> str:
    """Get the Chromaprint fingerprint string for a URL.

    Uses fpcalc (libchromaprint) — the same algorithm as AcoustID/MusicBrainz.
    """
    key = _cache_key(url)
    if key in _chromaprint_cache:
        _chromaprint_cache.move_to_end(key)
        return _chromaprint_cache[key]

    from services.ytdlp_service import download_audio_file
    with tempfile.TemporaryDirectory(prefix="fops_fpcalc_") as tmpdir:
        actual_path = download_audio_file(url, tmpdir)
        if not actual_path:
            raise RuntimeError("Audio download failed for chromaprint")

        # run fpcalc — it uses ffmpeg internally and accepts any audio format
        fp_cmd = ["fpcalc", "-raw", "-length", str(duration), actual_path]
        fp_result = subprocess.run(fp_cmd, capture_output=True, text=True, timeout=30)
        if fp_result.returncode != 0:
            raise RuntimeError(f"fpcalc failed: {fp_result.stderr[:300]}")

        fingerprint = ""
        for line in fp_result.stdout.strip().split("\n"):
            if line.startswith("FINGERPRINT="):
                fingerprint = line.split("=", 1)[1]
                break

    if not fingerprint:
        raise RuntimeError("fpcalc returned empty fingerprint")

    _chromaprint_cache[key] = fingerprint
    if len(_chromaprint_cache) > CACHE_MAX:
        _chromaprint_cache.popitem(last=False)

    return fingerprint


def compare_chromaprints(fp1_raw: str, fp2_raw: str) -> float:
    """Compare two raw chromaprint fingerprint strings.

    Converts comma-separated int arrays to bit-level hamming distance.
    Returns 0–100 similarity score.
    """
    try:
        arr1 = np.array([int(x) for x in fp1_raw.split(",")], dtype=np.int64)
        arr2 = np.array([int(x) for x in fp2_raw.split(",")], dtype=np.int64)
    except (ValueError, AttributeError):
        return 0.0

    min_len = min(len(arr1), len(arr2))
    if min_len == 0:
        return 0.0

    a = arr1[:min_len].astype(np.uint64)
    b = arr2[:min_len].astype(np.uint64)

    # hamming distance per 32-bit int
    xor = np.bitwise_xor(a, b)
    # count set bits
    total_bits = 0
    for shift in range(32):
        total_bits += np.sum((xor >> shift) & 1)

    max_bits = min_len * 32
    similarity = max(0.0, (1 - total_bits / max_bits) * 100)
    return round(similarity, 2)


# ── spectral band energy fingerprint ──────────────────────────

def create_fingerprint(audio: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Create a spectral energy-band fingerprint.

    Divides the spectrogram into 16 frequency bands and computes
    energy over time for each.
    """
    if audio is None or len(audio) == 0:
        raise ValueError("Audio data is empty")

    nperseg = min(2048, len(audio))
    f, t, Sxx = spectrogram(audio, fs=sr, nperseg=nperseg, noverlap=nperseg // 2)
    Sxx_db = 10 * np.log10(Sxx + 1e-10)

    n_bands = 16
    band_size = max(1, len(f) // n_bands)

    bands = []
    for i in range(n_bands):
        start = i * band_size
        end = min(start + band_size, len(f))
        bands.append(np.mean(Sxx_db[start:end, :], axis=0))

    return np.array(bands)


def compare_spectral(fp1: np.ndarray, fp2: np.ndarray) -> float:
    """Compare two spectral fingerprints via normalized cross-correlation."""
    if fp1 is None or fp2 is None:
        return 0.0

    a = fp1.flatten().astype(np.float64)
    b = fp2.flatten().astype(np.float64)

    min_len = min(len(a), len(b))
    if min_len == 0:
        return 0.0
    a, b = a[:min_len], b[:min_len]

    a_norm = a - np.mean(a)
    b_norm = b - np.mean(b)
    a_std, b_std = np.std(a_norm), np.std(b_norm)

    if a_std < 1e-10 or b_std < 1e-10:
        return 0.0

    corr = np.dot(a_norm, b_norm) / (a_std * b_std * min_len)
    return round(max(0.0, (corr + 1) / 2 * 100), 2)


# ── MFCC fingerprint ──────────────────────────────────────────

def create_mfcc(audio: np.ndarray, sr: int = SAMPLE_RATE, n_mfcc: int = 13) -> np.ndarray:
    """Compute MFCC (Mel-frequency cepstral coefficients) from audio.

    Pure numpy/scipy implementation — no librosa dependency.
    """
    # Pre-emphasis
    pre = np.append(audio[0], audio[1:] - 0.97 * audio[:-1])

    # Frame
    frame_len = int(0.025 * sr)   # 25ms
    frame_step = int(0.010 * sr)  # 10ms
    n_frames = max(1, 1 + (len(pre) - frame_len) // frame_step)

    frames = np.zeros((n_frames, frame_len))
    for i in range(n_frames):
        start = i * frame_step
        end = start + frame_len
        chunk = pre[start:end]
        frames[i, :len(chunk)] = chunk

    # Hamming window
    frames *= np.hamming(frame_len)

    # FFT power spectrum
    NFFT = 512
    mag = np.abs(np.fft.rfft(frames, NFFT))
    power = (1.0 / NFFT) * (mag ** 2)

    # Mel filterbank
    n_filt = 40
    low_freq = 0
    high_freq = sr / 2
    low_mel = 2595 * np.log10(1 + low_freq / 700)
    high_mel = 2595 * np.log10(1 + high_freq / 700)
    mel_points = np.linspace(low_mel, high_mel, n_filt + 2)
    hz_points = 700 * (10 ** (mel_points / 2595) - 1)
    bins = np.floor((NFFT + 1) * hz_points / sr).astype(int)

    fbank = np.zeros((n_filt, NFFT // 2 + 1))
    for i in range(1, n_filt + 1):
        left, center, right = bins[i - 1], bins[i], bins[i + 1]
        for j in range(left, center):
            fbank[i - 1, j] = (j - left) / max(1, center - left)
        for j in range(center, right):
            fbank[i - 1, j] = (right - j) / max(1, right - center)

    filter_banks = np.dot(power, fbank.T)
    filter_banks = np.where(filter_banks == 0, np.finfo(float).eps, filter_banks)
    filter_banks = 20 * np.log10(filter_banks)

    # DCT to get MFCCs
    mfcc = dct(filter_banks, type=2, axis=1, norm="ortho")[:, :n_mfcc]
    return mfcc


def compare_mfcc(mfcc1: np.ndarray, mfcc2: np.ndarray) -> float:
    """Compare two MFCC feature matrices via cosine similarity."""
    # Average across time frames
    m1 = np.mean(mfcc1, axis=0)
    m2 = np.mean(mfcc2, axis=0)

    dot = np.dot(m1, m2)
    n1, n2 = np.linalg.norm(m1), np.linalg.norm(m2)

    if n1 < 1e-10 or n2 < 1e-10:
        return 0.0

    sim = dot / (n1 * n2)  # -1 to 1
    return round(max(0.0, (sim + 1) / 2 * 100), 2)


# ── spectral peak constellation (Shazam-style) ────────────────

def create_peak_map(audio: np.ndarray, sr: int = SAMPLE_RATE) -> list[tuple[int, int]]:
    """Extract spectral peak constellation points (time, frequency bin).

    Simplified version of the Shazam landmark fingerprinting approach.
    """
    nperseg = min(2048, len(audio))
    f, t, Sxx = spectrogram(audio, fs=sr, nperseg=nperseg, noverlap=nperseg * 3 // 4)
    Sxx_db = 10 * np.log10(Sxx + 1e-10)

    peaks = []
    for ti in range(Sxx_db.shape[1]):
        col = Sxx_db[:, ti]
        idxs, props = find_peaks(col, height=np.median(col) + 10, distance=5)
        for fi in idxs:
            peaks.append((ti, int(fi)))

    return peaks


def compare_peaks(peaks1: list[tuple], peaks2: list[tuple]) -> float:
    """Compare two peak constellation maps.

    Checks how many peak locations overlap within a tolerance window.
    """
    if not peaks1 or not peaks2:
        return 0.0

    set1 = set(peaks1)
    set2 = set(peaks2)

    # Exact match count
    exact = len(set1 & set2)

    # Fuzzy match: allow ±1 time frame, ±2 freq bin
    fuzzy = 0
    for t1, f1 in peaks1:
        for dt in range(-1, 2):
            for df in range(-2, 3):
                if (t1 + dt, f1 + df) in set2:
                    fuzzy += 1
                    break
            else:
                continue
            break

    max_possible = max(len(peaks1), len(peaks2))
    if max_possible == 0:
        return 0.0

    score = (fuzzy / max_possible) * 100
    return round(min(100.0, score), 2)


# ── combined comparison ────────────────────────────────────────

@dataclass
class FingerprintResult:
    """Full fingerprint comparison result with per-algorithm breakdown."""
    confidence: float = 0.0
    match: bool = False
    chromaprint_score: float = 0.0
    spectral_score: float = 0.0
    mfcc_score: float = 0.0
    peak_score: float = 0.0
    algorithms_used: list = field(default_factory=list)
    algorithms_failed: list = field(default_factory=list)
    url1_duration: float = 0.0
    url2_duration: float = 0.0

    def to_dict(self) -> dict:
        d = asdict(self)
        # Ensure JSON-safe types (numpy bools/ints → Python natives)
        d["match"] = bool(d["match"])
        d["confidence"] = float(d["confidence"])
        d["chromaprint_score"] = float(d["chromaprint_score"])
        d["spectral_score"] = float(d["spectral_score"])
        d["mfcc_score"] = float(d["mfcc_score"])
        d["peak_score"] = float(d["peak_score"])
        return d


def compare_fingerprints(fp1: np.ndarray, fp2: np.ndarray) -> float:
    """Legacy API — compare two spectral fingerprints.

    Kept for backward compatibility. Use full_compare() for detailed results.
    """
    return compare_spectral(fp1, fp2)


def full_compare(url1: str, url2: str) -> FingerprintResult:
    """Run all fingerprint algorithms on two URLs and return a combined result.

    This is the main entry point for the upgraded fingerprint system.
    Downloads audio once per URL (cached), then runs:
      1. Chromaprint (AcoustID)
      2. Spectral band energy
      3. MFCC (timbral)
      4. Spectral peak constellation

    Returns a FingerprintResult with per-algorithm scores and a weighted
    combined confidence percentage.
    """
    result = FingerprintResult()
    scores: dict[str, float] = {}

    # Download audio for both URLs
    try:
        audio1 = download_audio_segment(url1)
        result.url1_duration = round(len(audio1) / SAMPLE_RATE, 2)
    except Exception as exc:
        logger.error("fingerprint: URL1 download failed: %s", exc)
        raise RuntimeError(f"URL1 download failed: {exc}")

    try:
        audio2 = download_audio_segment(url2)
        result.url2_duration = round(len(audio2) / SAMPLE_RATE, 2)
    except Exception as exc:
        logger.error("fingerprint: URL2 download failed: %s", exc)
        raise RuntimeError(f"URL2 download failed: {exc}")

    # 1. Chromaprint
    try:
        cp1 = get_chromaprint(url1)
        cp2 = get_chromaprint(url2)
        score = compare_chromaprints(cp1, cp2)
        result.chromaprint_score = score
        scores["chromaprint"] = score
        result.algorithms_used.append("chromaprint")
        logger.info("fingerprint: chromaprint = %.2f%%", score)
    except Exception as exc:
        logger.warning("fingerprint: chromaprint failed: %s", exc)
        result.algorithms_failed.append(f"chromaprint: {exc}")

    # 2. Spectral
    try:
        sp1 = create_fingerprint(audio1)
        sp2 = create_fingerprint(audio2)
        score = compare_spectral(sp1, sp2)
        result.spectral_score = score
        scores["spectral"] = score
        result.algorithms_used.append("spectral")
        logger.info("fingerprint: spectral = %.2f%%", score)
    except Exception as exc:
        logger.warning("fingerprint: spectral failed: %s", exc)
        result.algorithms_failed.append(f"spectral: {exc}")

    # 3. MFCC
    try:
        m1 = create_mfcc(audio1)
        m2 = create_mfcc(audio2)
        score = compare_mfcc(m1, m2)
        result.mfcc_score = score
        scores["mfcc"] = score
        result.algorithms_used.append("mfcc")
        logger.info("fingerprint: mfcc = %.2f%%", score)
    except Exception as exc:
        logger.warning("fingerprint: mfcc failed: %s", exc)
        result.algorithms_failed.append(f"mfcc: {exc}")

    # 4. Peak constellation
    try:
        p1 = create_peak_map(audio1)
        p2 = create_peak_map(audio2)
        score = compare_peaks(p1, p2)
        result.peak_score = score
        scores["peaks"] = score
        result.algorithms_used.append("peaks")
        logger.info("fingerprint: peaks = %.2f%%", score)
    except Exception as exc:
        logger.warning("fingerprint: peaks failed: %s", exc)
        result.algorithms_failed.append(f"peaks: {exc}")

    # Combined weighted score — only count algorithms that succeeded
    if scores:
        active_weights = {k: WEIGHTS.get(k, 0) for k in scores}
        total_weight = sum(active_weights.values())
        if total_weight > 0:
            combined = sum(scores[k] * active_weights[k] for k in scores) / total_weight
        else:
            combined = sum(scores.values()) / len(scores)
        result.confidence = round(combined, 2)
    else:
        result.confidence = 0.0

    result.match = result.confidence > 65.0

    logger.info(
        "fingerprint: COMBINED = %.2f%% (match=%s, algos=%d/%d)",
        result.confidence, result.match,
        len(result.algorithms_used),
        len(result.algorithms_used) + len(result.algorithms_failed),
    )
    return result
