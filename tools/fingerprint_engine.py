"""
Fingerprint Scoring Engine — Real audio fingerprinting.

Generates fingerprints and compares audio between candidates.

Features:
  - Download audio from YouTube URLs
  - Generate spectral fingerprints (FFT-based)
  - Compare using cosine similarity
  - Real fingerprint_score (0-100)
  - Verifies matches with high accuracy

Reuses tools/fingerprint.py multi-algorithm approach.
"""

import logging
import tempfile
from typing import Optional

import numpy as np
from scipy.spatial.distance import cosine

import yt_dlp

logger = logging.getLogger("tools.fingerprint_engine")

# Import fingerprinting functions from existing module
try:
    from .fingerprint import download_audio_segment, create_fingerprint, compare_fingerprints, full_compare
except ImportError:
    try:
        from fingerprint import download_audio_segment, create_fingerprint, compare_fingerprints, full_compare
    except ImportError:
        logger.warning("fingerprint_engine: could not import fingerprint functions")
        download_audio_segment = None
        create_fingerprint = None
        compare_fingerprints = None
        full_compare = None


def compare_with_reference(candidate_url: str, reference_url: str) -> dict:
    """Compare a candidate URL's audio with a reference URL using fingerprints.

    Args:
        candidate_url: YouTube URL to test
        reference_url: YouTube URL reference

    Returns:
        {
            'fingerprint_score': float (0-100),
            'verified': bool,
            'algorithm_scores': {
                'chromaprint': float,
                'spectral': float,
                'mfcc': float,
                'peaks': float
            },
            'method': str
        }
    """
    if not download_audio_segment or not full_compare:
        logger.warning("fingerprint_engine: fingerprint functions not available, returning placeholder")
        return {
            'fingerprint_score': 0,
            'verified': False,
            'algorithm_scores': {},
            'method': 'unavailable'
        }

    try:
        logger.info(f"fingerprint_engine: comparing candidate vs reference")

        # Download audio from both URLs
        reference_audio = download_audio_segment(reference_url, duration=15)
        candidate_audio = download_audio_segment(candidate_url, duration=15)

        if reference_audio is None or candidate_audio is None:
            logger.warning("fingerprint_engine: failed to download audio segments")
            return {
                'fingerprint_score': 0,
                'verified': False,
                'algorithm_scores': {},
                'method': 'download_failed'
            }

        # Use full multi-algorithm comparison
        result = full_compare(reference_url, candidate_url)

        if result:
            fingerprint_score = result.get('confidence', 0) or 0
            verified = fingerprint_score > 80

            logger.info(f"fingerprint_engine: score={fingerprint_score:.1f}, verified={verified}")

            return {
                'fingerprint_score': float(fingerprint_score),
                'verified': verified,
                'algorithm_scores': {
                    'chromaprint': result.get('chromaprint_score', 0),
                    'spectral': result.get('spectral_score', 0),
                    'mfcc': result.get('mfcc_score', 0),
                    'peaks': result.get('peaks_score', 0),
                },
                'method': result.get('method', 'full_compare')
            }
        else:
            logger.warning("fingerprint_engine: full_compare returned None")
            return {
                'fingerprint_score': 0,
                'verified': False,
                'algorithm_scores': {},
                'method': 'compare_failed'
            }

    except Exception as e:
        logger.exception(f"fingerprint_engine: comparison failed: {e}")
        return {
            'fingerprint_score': 0,
            'verified': False,
            'algorithm_scores': {},
            'method': f'error: {str(e)}'
        }


def batch_fingerprint_compare(candidates: list[dict], reference_url: str) -> list[dict]:
    """Compare multiple candidates against a reference URL.

    Args:
        candidates: List of candidate dicts with 'url' field
        reference_url: Reference YouTube URL

    Returns:
        Updated candidates list with 'fingerprint_score' and 'verified' added
    """
    logger.info(f"fingerprint_engine: batch comparing {len(candidates)} candidates vs reference")

    for i, candidate in enumerate(candidates[:5], 1):  # limit to top 5
        if 'url' not in candidate:
            continue

        try:
            logger.debug(f"fingerprint_engine: candidate {i}/5")
            result = compare_with_reference(candidate['url'], reference_url)

            candidate['fingerprint_score'] = result['fingerprint_score']
            candidate['verified'] = result['verified']
            candidate['fingerprint_method'] = result['method']

        except Exception as e:
            logger.warning(f"fingerprint_engine: candidate {i} failed: {e}")
            candidate['fingerprint_score'] = 0
            candidate['verified'] = False
            candidate['fingerprint_method'] = f'error: {str(e)}'

    return candidates
