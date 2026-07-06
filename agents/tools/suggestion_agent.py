"""
SuggestionAgent — Generates human-readable suggestions for a release.

IMPORTANT: This agent DOES NOT execute anything.
It only returns suggestions like:
  "Artwork missing"
  "Best YouTube link is X"
"""

import logging

logger = logging.getLogger("agents.tools.suggestion_agent")


class SuggestionAgent:
    name = "SUGGESTION"

    def run(
        self,
        validation: dict | None = None,
        youtube_results: dict | None = None,
        fingerprint: dict | None = None,
    ) -> dict:
        """Generate suggestions based on validation, search results, and fingerprint data.

        This agent NEVER executes actions — only suggests.

        Args:
            validation: Output from ValidationAgent.
            youtube_results: Output from YoutubeSearchAgent.
            fingerprint: Output from FingerprintAgent.

        Returns:
            dict with a list of suggestion strings.
        """
        logger.info("[%s] Generating suggestions", self.name)

        suggestions = []

        # Validation suggestions
        if validation:
            for item in validation.get("missing_required", []):
                suggestions.append({
                    "type": "missing_field",
                    "severity": "critical",
                    "message": f"{item['label']} is missing (required)",
                })
            for item in validation.get("missing_media", []):
                suggestions.append({
                    "type": "missing_media",
                    "severity": "warning",
                    "message": f"{item['label']} is missing",
                })
            for item in validation.get("missing_recommended", []):
                suggestions.append({
                    "type": "incomplete",
                    "severity": "info",
                    "message": f"{item['label']} is not filled in",
                })

        # YouTube suggestions
        if youtube_results:
            best = youtube_results.get("best_match")
            if best:
                score = best.get("score", 0)
                url = best.get("url", "")
                title = best.get("title", "")
                if score >= 80:
                    suggestions.append({
                        "type": "youtube_match",
                        "severity": "info",
                        "message": f"Best YouTube match: \"{title}\" ({score:.0f}% match) → {url}",
                    })
                elif score >= 50:
                    suggestions.append({
                        "type": "youtube_match",
                        "severity": "warning",
                        "message": f"Possible YouTube match (low confidence {score:.0f}%): \"{title}\" → {url}",
                    })
                else:
                    suggestions.append({
                        "type": "youtube_no_match",
                        "severity": "warning",
                        "message": "No confident YouTube match found. Manual review recommended.",
                    })
            else:
                suggestions.append({
                    "type": "youtube_no_match",
                    "severity": "warning",
                    "message": "No YouTube results found for this release.",
                })

        # Fingerprint suggestions
        if fingerprint:
            if fingerprint.get("success"):
                conf = fingerprint.get("confidence", 0)
                if conf >= 70:
                    suggestions.append({
                        "type": "fingerprint_match",
                        "severity": "info",
                        "message": f"Audio fingerprint match confirmed ({conf:.1f}% confidence)",
                    })
                else:
                    suggestions.append({
                        "type": "fingerprint_mismatch",
                        "severity": "warning",
                        "message": f"Audio fingerprint low confidence ({conf:.1f}%). May be wrong video.",
                    })
            elif fingerprint.get("error"):
                suggestions.append({
                    "type": "fingerprint_error",
                    "severity": "info",
                    "message": f"Fingerprint check skipped: {fingerprint['error']}",
                })

        return {
            "agent": self.name,
            "suggestions": suggestions,
            "count": len(suggestions),
        }
