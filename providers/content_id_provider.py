"""
FOPS — Content ID Verification Provider (Optional Plugin).

Provides YouTube Content ID verification when configured.
If the Content ID API is not configured, all methods return None gracefully.

Configuration via environment variables:
  CONTENT_ID_ENABLED=true
  CONTENT_ID_API_URL=https://...
  CONTENT_ID_API_KEY=...

Or via config.py SETTINGS dict.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger("providers.content_id")


def _is_enabled() -> bool:
    """Check if Content ID verification is enabled."""
    # Check env first, then try config.py
    env_val = os.getenv("CONTENT_ID_ENABLED", "").lower()
    if env_val in ("true", "1", "yes"):
        return True
    if env_val in ("false", "0", "no"):
        return False
    try:
        from config import SETTINGS
        return bool(SETTINGS.get("content_id_enabled", False))
    except ImportError:
        return False


def _get_api_config() -> dict:
    """Get Content ID API configuration."""
    return {
        "api_url": os.getenv("CONTENT_ID_API_URL", ""),
        "api_key": os.getenv("CONTENT_ID_API_KEY", ""),
        "mode": os.getenv("CONTENT_ID_MODE", "verify_only"),
    }


def verify_content_id(video_id: str) -> Optional[dict]:
    """Verify a YouTube video against Content ID.

    Args:
        video_id: YouTube video ID (e.g., "kJQP7kiw5Fk").

    Returns:
        None if Content ID is not configured/enabled.
        dict with content_id_match, asset_id, policy, owner if enabled.
    """
    if not _is_enabled():
        logger.debug("content_id: not enabled — skipping verification for %s", video_id)
        return None

    if not video_id:
        return None

    config = _get_api_config()
    api_url = config["api_url"]
    api_key = config["api_key"]

    if not api_url or not api_key:
        logger.warning("content_id: enabled but API URL or key not configured")
        return None

    try:
        import urllib.request
        import json

        url = f"{api_url.rstrip('/')}/videos/{video_id}/content_id"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        result = {
            "content_id_match": data.get("match", False),
            "asset_id": data.get("asset_id", ""),
            "policy": data.get("policy", "unknown"),
            "owner": data.get("owner", ""),
            "video_id": video_id,
        }
        logger.info("content_id: verified %s → match=%s policy=%s",
                     video_id, result["content_id_match"], result["policy"])
        return result

    except Exception as exc:
        logger.warning("content_id: API call failed for %s: %s", video_id, exc)
        return {
            "content_id_match": False,
            "asset_id": "",
            "policy": "error",
            "owner": "",
            "video_id": video_id,
            "error": str(exc),
        }


def status() -> dict:
    """Return Content ID provider status."""
    enabled = _is_enabled()
    config = _get_api_config()
    return {
        "provider": "content_id",
        "enabled": enabled,
        "configured": bool(config["api_url"] and config["api_key"]) if enabled else False,
        "mode": config["mode"],
    }
