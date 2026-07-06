"""
FingerprintAgent — Validates YouTube results using multi-algorithm audio fingerprinting (v2).

Algorithms: Chromaprint (AcoustID), Spectral Energy, MFCC, Peak Constellation.
Returns per-algorithm scores + weighted combined confidence.
"""

import logging

from tools.fingerprint import (
    download_audio_segment,
    create_fingerprint,
    compare_fingerprints,
    full_compare,
    clear_cache,
    get_chromaprint,
    FingerprintResult,
)

logger = logging.getLogger("agents.tools.fingerprint_agent")


class FingerprintAgent:
    name = "FINGERPRINT"

    def run(self, url1: str, url2: str) -> dict:
        """Full multi-algorithm fingerprint comparison of two URLs.

        Args:
            url1: First YouTube/audio URL (e.g. known reference).
            url2: Second YouTube/audio URL (e.g. candidate result).

        Returns:
            dict with per-algorithm scores, combined confidence, and match status.
        """
        logger.info("[%s] Comparing: %s vs %s", self.name, url1, url2)

        try:
            result = full_compare(url1, url2)
            return {
                "agent": self.name,
                "success": True,
                "error": None,
                **result.to_dict(),
            }
        except Exception as exc:
            logger.exception("[%s] Comparison failed", self.name)
            return {
                "agent": self.name,
                "success": False,
                "error": str(exc),
                "confidence": 0.0,
                "match": False,
            }

    def validate_url(self, url: str) -> dict:
        """Fingerprint a single URL and return its metadata.

        Args:
            url: YouTube/audio URL to fingerprint.

        Returns:
            dict with success status, duration, fingerprint shape, and chromaprint.
        """
        logger.info("[%s] Validating single URL: %s", self.name, url)
        try:
            audio = download_audio_segment(url)
            fp = create_fingerprint(audio)

            chromaprint_str = None
            try:
                chromaprint_str = get_chromaprint(url)
                chromaprint_len = len(chromaprint_str.split(","))
            except Exception:
                chromaprint_len = 0

            return {
                "agent": self.name,
                "success": True,
                "url": url,
                "samples": len(audio),
                "fingerprint_shape": list(fp.shape),
                "duration_seconds": round(len(audio) / 22050, 2),
                "chromaprint_available": chromaprint_str is not None,
                "chromaprint_points": chromaprint_len,
            }
        except Exception as exc:
            logger.error("[%s] Validation failed: %s", self.name, exc)
            return {"agent": self.name, "success": False, "url": url, "error": str(exc)}

    def clear_cache(self) -> dict:
        """Clear the audio download cache."""
        return {"agent": self.name, **clear_cache()}
