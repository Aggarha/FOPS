"""
FOPS — Decision Intelligence Agent.

Analyzes audio matching results and produces a structured decision:
  - best_match with confidence and verification status
  - human-readable reason
  - ranked alternatives

Used by the pipeline after AudioMatchingAgent to make a final determination.
"""

import logging
from typing import Optional

logger = logging.getLogger("agents.core.decision_agent")

VERIFIED_THRESHOLD = 85.0


class DecisionAgent:
    """Analyzes match results and produces a verified/best-guess decision."""

    name = "DECISION"

    def decide_best_match(self, result: dict) -> dict:
        """Analyze audio matching output and return structured decision.

        Args:
            result: Output from audio_match() or AudioMatchingAgent.run().
                Expected keys: matches, best_match, confidence, verified,
                method, fingerprint_ran, fingerprint_details.

        Returns:
            dict with best_match, confidence, verified, reason, alternatives.
        """
        if not result:
            return self._empty_decision("No matching result provided")

        # Unwrap agent wrapper if present
        data = result.get("data", result)

        matches = data.get("matches") or []
        best = data.get("best_match")
        confidence = data.get("confidence", 0)
        verified = data.get("verified", False)
        method = data.get("method", "unknown")
        fingerprint_ran = data.get("fingerprint_ran", False)

        if not best:
            return self._empty_decision("No candidates found")

        # Build reason string
        reason = self._build_reason(best, confidence, verified, method, fingerprint_ran)

        # Build alternatives (all matches except best)
        alternatives = []
        for m in matches[1:]:
            alternatives.append({
                "title": m.get("title", ""),
                "artist": m.get("artist", ""),
                "url": m.get("url", ""),
                "platform": m.get("platform", ""),
                "score": m.get("match_score", 0),
                "fingerprint_confidence": (
                    m.get("fingerprint", {}).get("confidence", 0)
                    if m.get("fingerprint") else None
                ),
            })

        decision = {
            "best_match": {
                "title": best.get("title", ""),
                "artist": best.get("artist", ""),
                "url": best.get("url", ""),
                "platform": best.get("platform", ""),
                "score": best.get("match_score", 0),
                "duration": best.get("duration", 0),
            },
            "confidence": round(confidence, 2),
            "verified": confidence >= VERIFIED_THRESHOLD,
            "reason": reason,
            "method": method,
            "alternatives": alternatives,
        }

        # Add fingerprint detail if available
        fp = best.get("fingerprint")
        if fp and fp.get("success"):
            decision["best_match"]["fingerprint_confidence"] = fp.get("confidence", 0)

        logger.info("[%s] decision: verified=%s confidence=%.1f reason=%r",
                     self.name, decision["verified"], confidence, reason)

        return decision

    def _build_reason(self, best: dict, confidence: float, verified: bool,
                      method: str, fingerprint_ran: bool) -> str:
        """Construct a human-readable explanation of the decision."""
        parts = []

        if verified and fingerprint_ran:
            parts.append("fingerprint verified")
            fp = best.get("fingerprint", {})
            if fp.get("confidence"):
                parts.append(f"audio confidence {fp['confidence']:.0f}%")
        elif verified:
            parts.append("high metadata confidence")

        score = best.get("match_score", 0)
        if score >= 90:
            parts.append("strong title + artist match")
        elif score >= 70:
            parts.append("good title match")

        duration = best.get("duration", 0)
        if duration > 0:
            parts.append(f"duration {duration}s")

        if not parts:
            parts.append("best available candidate")

        if not verified:
            parts.append("not fully verified — manual review recommended")

        return "; ".join(parts)

    def _empty_decision(self, reason: str) -> dict:
        """Return an empty decision structure."""
        return {
            "best_match": None,
            "confidence": 0,
            "verified": False,
            "reason": reason,
            "method": "none",
            "alternatives": [],
        }
