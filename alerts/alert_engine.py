"""
FOPS — Smart Alert Engine.

Generates context-aware alerts based on decision results and learned preferences.
Rule-based only — no ML.

Alert types:
  - danger  : Low confidence match (< 80)
  - warning : Channel/artist previously rejected
  - success : High confidence + preferred channel/artist
  - info    : Metadata/fingerprint mismatch detected

Returns a list of alert dicts, each with: type, message, reason.
"""

import logging
from typing import Optional

logger = logging.getLogger("alerts.alert_engine")

# Thresholds
LOW_CONFIDENCE_THRESHOLD = 80
HIGH_CONFIDENCE_THRESHOLD = 90


def generate_alerts(decision: dict, preferences: dict) -> list[dict]:
    """Generate smart alerts based on decision result and learned preferences.

    Args:
        decision: Decision dict from DecisionAgent with keys:
            best_match, confidence, verified, reason, method, alternatives
        preferences: Current preferences state from get_preferences_summary()
            with keys: channels, artists, channel_artist

    Returns:
        List of alert dicts: [{type, message, reason}, ...]
    """
    alerts = []
    confidence = decision.get("confidence", 0) or 0
    verified = decision.get("verified", False)
    best_match = decision.get("best_match") or {}
    method = decision.get("method", "")
    reason = decision.get("reason", "")

    # Extract channel/artist from best match
    match_channel = (best_match.get("artist", "") or best_match.get("channel", "")).strip().lower()
    match_artist = (best_match.get("query_artist", "") or "").strip().lower()

    # ── DANGER: Low confidence ──────────────────────────────
    if confidence < LOW_CONFIDENCE_THRESHOLD and confidence > 0:
        alerts.append({
            "type": "danger",
            "message": "Low confidence match",
            "reason": f"Audio match confidence is {confidence}% (threshold: {LOW_CONFIDENCE_THRESHOLD}%)",
        })

    # ── WARNING: Previously rejected channel/artist ─────────
    _check_rejected(alerts, match_channel, match_artist, preferences)

    # ── SUCCESS: High confidence + preferred ────────────────
    if confidence >= HIGH_CONFIDENCE_THRESHOLD and verified:
        is_preferred = _is_preferred(match_channel, match_artist, preferences)
        if is_preferred:
            alerts.append({
                "type": "success",
                "message": "High confidence verified match",
                "reason": "Matches learned preferences with strong audio verification",
            })

    # ── INFO: Metadata/fingerprint mismatch ─────────────────
    _check_mismatch(alerts, decision)

    logger.info("alert_engine: generated %d alerts (confidence=%s, verified=%s)",
                len(alerts), confidence, verified)
    return alerts


def _check_rejected(alerts: list, channel: str, artist: str, preferences: dict) -> None:
    """Check if channel or artist was previously rejected."""
    channels_prefs = preferences.get("channels", {})
    artists_prefs = preferences.get("artists", {})
    combo_prefs = preferences.get("channel_artist", {})

    # Check channel
    if channel:
        ch_data = channels_prefs.get(channel, {})
        net = ch_data.get("net_score", 0)
        if net < -0.5:
            alerts.append({
                "type": "warning",
                "message": "Channel previously rejected",
                "reason": f"Channel '{channel}' has negative preference score ({net:.1f})",
            })

    # Check artist
    if artist:
        ar_data = artists_prefs.get(artist, {})
        net = ar_data.get("net_score", 0)
        if net < -0.5:
            alerts.append({
                "type": "warning",
                "message": "Artist previously rejected",
                "reason": f"Artist '{artist}' has negative preference score ({net:.1f})",
            })

    # Check combo
    if channel and artist:
        combo_key = f"{channel}|{artist}"
        combo_data = combo_prefs.get(combo_key, {})
        net = combo_data.get("net_score", 0)
        if net < -0.5:
            alerts.append({
                "type": "warning",
                "message": "Channel+Artist combo previously rejected",
                "reason": f"Combo '{combo_key}' has negative preference score ({net:.1f})",
            })


def _is_preferred(channel: str, artist: str, preferences: dict) -> bool:
    """Check if channel or artist has positive preference."""
    channels_prefs = preferences.get("channels", {})
    artists_prefs = preferences.get("artists", {})

    if channel:
        ch_data = channels_prefs.get(channel, {})
        if ch_data.get("net_score", 0) > 0.5:
            return True

    if artist:
        ar_data = artists_prefs.get(artist, {})
        if ar_data.get("net_score", 0) > 0.5:
            return True

    return False


def _check_mismatch(alerts: list, decision: dict) -> None:
    """Check for metadata vs fingerprint mismatch.

    If method indicates fingerprint was used but confidence differs
    significantly from metadata score, flag it.
    """
    method = decision.get("method", "")
    best_match = decision.get("best_match") or {}

    # Check if fingerprint was involved
    fp_confidence = best_match.get("fingerprint_confidence", 0) or 0
    metadata_score = best_match.get("score", 0) or best_match.get("original_score", 0) or 0

    if fp_confidence > 0 and metadata_score > 0:
        # Significant divergence between fingerprint and metadata
        diff = abs(fp_confidence - metadata_score)
        if diff > 25:
            higher = "Fingerprint" if fp_confidence > metadata_score else "Metadata"
            lower = "metadata" if fp_confidence > metadata_score else "fingerprint"
            alerts.append({
                "type": "info",
                "message": "Metadata mismatch detected",
                "reason": f"{higher} score ({max(fp_confidence, metadata_score):.0f}) differs from {lower} score ({min(fp_confidence, metadata_score):.0f}) — possible title/artist mismatch",
            })

    # Also flag if verified=False but confidence is high (contradictory)
    confidence = decision.get("confidence", 0) or 0
    verified = decision.get("verified", False)
    if confidence >= HIGH_CONFIDENCE_THRESHOLD and not verified:
        alerts.append({
            "type": "info",
            "message": "High score but unverified",
            "reason": f"Confidence is {confidence}% but match is not verified — review recommended",
        })
