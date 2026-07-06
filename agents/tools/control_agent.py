"""
ControlAgent — Returns possible actions for a release without executing them.

IMPORTANT: This agent NEVER auto-executes actions.
It only returns a list of available actions the user can choose to trigger.
"""

import logging

logger = logging.getLogger("agents.tools.control_agent")


class ControlAgent:
    name = "CONTROL"

    def run(
        self,
        validation: dict | None = None,
        youtube_results: dict | None = None,
        suggestions: dict | None = None,
    ) -> dict:
        """Return a list of possible actions for the user to review and approve.

        This agent DOES NOT execute anything. User decides.

        Args:
            validation: Output from ValidationAgent.
            youtube_results: Output from YoutubeSearchAgent.
            suggestions: Output from SuggestionAgent.

        Returns:
            dict with a list of available actions (not executed).
        """
        logger.info("[%s] Building available actions", self.name)

        actions = []

        # YouTube-related actions
        if youtube_results:
            best = youtube_results.get("best_match")
            if best:
                actions.append({
                    "id": "set_youtube_link",
                    "label": "Set YouTube link",
                    "description": f"Set delivery_youtube to {best.get('url', '')}",
                    "data": {"url": best.get("url", ""), "title": best.get("title", "")},
                    "auto_execute": False,
                })

            for i, result in enumerate(youtube_results.get("advanced_results", [])[:3]):
                actions.append({
                    "id": f"set_youtube_link_alt_{i}",
                    "label": f"Use alternative match #{i + 1}",
                    "description": f"{result.get('title', '')} (score: {result.get('score', 0)})",
                    "data": {"url": result.get("url", ""), "title": result.get("title", "")},
                    "auto_execute": False,
                })

        # Validation-related actions
        if validation:
            if validation.get("missing_required"):
                actions.append({
                    "id": "review_missing_fields",
                    "label": "Review missing required fields",
                    "description": f"{len(validation['missing_required'])} required field(s) need attention",
                    "data": {"fields": [f["field"] for f in validation["missing_required"]]},
                    "auto_execute": False,
                })

            if validation.get("missing_media"):
                actions.append({
                    "id": "review_missing_media",
                    "label": "Review missing media assets",
                    "description": f"{len(validation['missing_media'])} media asset(s) missing",
                    "data": {"fields": [f["field"] for f in validation["missing_media"]]},
                    "auto_execute": False,
                })

        # General actions
        actions.append({
            "id": "run_fingerprint_check",
            "label": "Run audio fingerprint verification",
            "description": "Compare audio fingerprints to verify the YouTube match",
            "data": {},
            "auto_execute": False,
        })

        actions.append({
            "id": "refresh_search",
            "label": "Re-run YouTube search",
            "description": "Search again with updated parameters",
            "data": {},
            "auto_execute": False,
        })

        return {
            "agent": self.name,
            "actions": actions,
            "count": len(actions),
            "note": "No actions are auto-executed. User must approve.",
        }
