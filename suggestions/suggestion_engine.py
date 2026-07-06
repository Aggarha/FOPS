"""
FOPS — Auto Suggestion Engine.

Analyzes decision results, alerts, and learned preferences to suggest
an action: approve, reject, or review.

Rule-based only — no ML.
"""

import logging
from typing import Optional

logger = logging.getLogger("suggestions.suggestion_engine")

LOW_CONFIDENCE = 80
HIGH_CONFIDENCE = 90


def suggest_action(decision: dict, alerts: list[dict], preferences: dict) -> dict:
    """Suggest an action based on decision, alerts, and preferences.

    Args:
        decision: Decision dict from DecisionAgent with keys:
            best_match, confidence, verified, reason, method, alternatives
        alerts: List of smart alert dicts [{type, message, reason}, ...]
        preferences: Current preferences state from get_preferences_summary()
            with keys: channels, artists, channel_artist

    Returns:
        {
            "suggested_action": "approve" | "reject" | "review",
            "confidence": 0-100,
            "reason": "text explanation"
        }
    """
    confidence = decision.get("confidence", 0) or 0
    verified = decision.get("verified", False)
    best_match = decision.get("best_match") or {}

    alert_types = [a.get("type", "") for a in alerts]
    has_danger = "danger" in alert_types
    has_warning = "warning" in alert_types

    # Extract channel/artist for preference lookup
    match_channel = (
        best_match.get("artist", "") or best_match.get("channel", "")
    ).strip().lower()
    match_artist = (
        best_match.get("query_artist", "") or ""
    ).strip().lower()

    is_preferred = _is_preferred_channel(match_channel, match_artist, preferences)

    # ── REJECT ──────────────────────────────────────────────
    # Danger alert always rejects; confidence < 70 is too low even for review
    if has_danger or (confidence < 70 and confidence > 0):
        reasons = []
        if confidence < 70:
            reasons.append(f"confidence is {confidence}% (very low)")
        if has_danger:
            reasons.append("danger alert detected")
        return {
            "suggested_action": "reject",
            "confidence": max(0, 100 - confidence),
            "reason": f"Suggest REJECT: {'; '.join(reasons)}",
        }

    # ── REVIEW ──────────────────────────────────────────────
    # Borderline confidence (70-85) or warning alerts
    if has_warning or (70 <= confidence <= 85):
        reasons = []
        if has_warning:
            reasons.append("warning alert detected")
        if 70 <= confidence <= 85:
            reasons.append(f"confidence is {confidence}% (borderline)")
        return {
            "suggested_action": "review",
            "confidence": confidence,
            "reason": f"Suggest REVIEW: {'; '.join(reasons)}",
        }

    # ── APPROVE ─────────────────────────────────────────────
    if confidence >= HIGH_CONFIDENCE and verified and is_preferred:
        return {
            "suggested_action": "approve",
            "confidence": confidence,
            "reason": "Suggest APPROVE: high confidence, verified match, preferred channel/artist",
        }

    # ── REVIEW (default fallback) ───────────────────────────
    reasons = []
    if confidence < HIGH_CONFIDENCE:
        reasons.append(f"confidence {confidence}% below {HIGH_CONFIDENCE}%")
    if not verified:
        reasons.append("match not verified")
    if not is_preferred:
        reasons.append("channel/artist not in preferred list")

    return {
        "suggested_action": "review",
        "confidence": confidence,
        "reason": f"Suggest REVIEW: {'; '.join(reasons) or 'does not meet auto-approve criteria'}",
    }


def _is_preferred_channel(channel: str, artist: str, preferences: dict) -> bool:
    """Check if channel or artist has positive preference score."""
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
