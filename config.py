"""
FOPS — Central configuration.

All tunable settings in one place instead of hardcoded across files.
Import as: from config import SETTINGS
"""

import os

SETTINGS = {
    # --- Fingerprint ---
    "fingerprint_enabled": True,
    "fingerprint_mode": "snippet",          # "snippet" (30s) or "full"
    "fingerprint_snippet_duration": 30,     # seconds
    "fingerprint_snippet_offset": 10,       # seconds from start
    "fingerprint_cache_max": 50,            # max cached audio segments
    "fingerprint_match_threshold": 65.0,    # % confidence to consider a match
    "fingerprint_weights": {
        "chromaprint": 0.35,
        "spectral": 0.25,
        "mfcc": 0.25,
        "peaks": 0.15,
    },

    # --- YouTube ---
    "platforms": ["youtube"],
    "youtube_max_search_variants": 6,
    "youtube_max_results": 3,

    # --- Matching ---
    "matching_weights": {
        "title": 0.45,
        "partial": 0.35,
        "channel": 0.20,
    },

    # --- Background tasks ---
    "sync_interval_minutes": int(os.getenv("SYNC_INTERVAL_MINUTES", "30")),
    "agent_pipeline_interval_minutes": int(os.getenv("AGENT_PIPELINE_INTERVAL", "5")),

    # --- Content ID (optional plugin) ---
    "content_id_enabled": os.getenv("CONTENT_ID_ENABLED", "false").lower() in ("true", "1", "yes"),
    "content_id_mode": os.getenv("CONTENT_ID_MODE", "verify_only"),  # "verify_only" or "full"

    # --- Audio Matching ---
    "audio_matching_platforms": ["youtube"],
    "audio_matching_search_mode": "hybrid",  # "hybrid", "keyword", "fingerprint"

    # --- API ---
    "api_base_url": os.getenv("FOPS_API_URL", "https://api.fops.aggarha.com"),
    "dashboard_url": os.getenv("FOPS_DASHBOARD_URL", "https://fops.aggarha.com"),
}
