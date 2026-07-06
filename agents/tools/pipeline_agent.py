"""
PipelineAgent — Main orchestration agent for YouTube tool pipeline.

Pipeline:
  1. Fetch data from sheet
  2. Run YouTube search
  3. Validate results
  4. Generate suggestions
  5. Return structured response

NEVER auto-executes actions — only suggests.
"""

import logging
from typing import Optional

from google_sheets import fetch_releases_from_sheet
from agents.tools.youtube_search_agent import YoutubeSearchAgent
from agents.tools.variant_agent import VariantAgent
from agents.tools.matching_agent import MatchingAgent
from agents.tools.fingerprint_agent import FingerprintAgent
from agents.tools.metadata_agent import MetadataAgent
from agents.tools.validation_agent import ValidationAgent
from agents.tools.suggestion_agent import SuggestionAgent
from agents.tools.control_agent import ControlAgent
from agents.tools.audio_matching_agent import AudioMatchingAgent
from agents.core.decision_agent import DecisionAgent
from alerts.alert_engine import generate_alerts
from suggestions.suggestion_engine import suggest_action

logger = logging.getLogger("agents.tools.pipeline_agent")


class PipelineAgent:
    name = "PIPELINE"

    def __init__(self):
        self.youtube_search = YoutubeSearchAgent()
        self.variant = VariantAgent()
        self.matching = MatchingAgent()
        self.fingerprint = FingerprintAgent()
        self.metadata = MetadataAgent()
        self.validation = ValidationAgent()
        self.suggestion = SuggestionAgent()
        self.control = ControlAgent()
        self.audio_matching = AudioMatchingAgent()
        self.decision = DecisionAgent()

    def run(self, row_index: Optional[int] = None, song: str = "",
            artist: str = "", channel_filter: str | None = None,
            filters: dict | None = None) -> dict:
        """Run the full pipeline for a single release.

        Can operate on a specific Google Sheet row (by index) or on
        explicit song/artist params.

        Args:
            row_index: 0-based index of the Google Sheet row to process.
            song: Song title (used if row_index is None).
            artist: Artist name (used if row_index is None).
            channel_filter: Optional channel name to boost in search.
            filters: Optional advanced filter dict for audio matching.

        Returns:
            Structured dict with data, alerts, suggestions, actions,
            audio_matching, decisions.
        """
        logger.info("[%s] Starting pipeline (row=%s, song=%r, artist=%r)",
                     self.name, row_index, song, artist)

        row_data = {}

        # Step 1: Fetch data
        if row_index is not None:
            try:
                rows = fetch_releases_from_sheet()
                if row_index < 0 or row_index >= len(rows):
                    return {"error": f"Row {row_index} not found. Sheet has {len(rows)} rows."}
                row_data = rows[row_index]
                song = song or row_data.get("song_en") or row_data.get("Song Name English", "")
                artist = artist or row_data.get("artist_en") or row_data.get("Artist Name English", "")
                logger.info("[%s] Step 1 — fetched row %d: %r – %r", self.name, row_index, artist, song)
            except Exception as exc:
                logger.exception("[%s] Failed to fetch sheet data", self.name)
                return {"error": f"Sheet fetch failed: {exc}"}

        if not song or not artist:
            return {"error": "song and artist are required (or provide row_index)"}

        # Step 2: YouTube search
        try:
            yt_results = self.youtube_search.run(song=song, artist=artist, channel_filter=channel_filter)
            logger.info("[%s] Step 2 — YouTube search complete", self.name)
        except Exception as exc:
            logger.exception("[%s] YouTube search failed", self.name)
            yt_results = {"basic_result": {"success": False, "error": str(exc)}, "advanced_results": [], "best_match": None}

        # Step 3: Audio Matching (NEW — with filters)
        audio_match_result = {}
        try:
            audio_match_result = self.audio_matching.run(
                song=song,
                artist=artist,
                platforms=["youtube"],
                use_fingerprint=True,
                channel_filter=channel_filter,
                filters=filters,
            )
            logger.info("[%s] Step 3 — Audio matching: verified=%s confidence=%s",
                        self.name,
                        audio_match_result.get("verified"),
                        audio_match_result.get("confidence"))
        except Exception as exc:
            logger.exception("[%s] Audio matching failed", self.name)
            audio_match_result = {"agent": "AUDIO_MATCHING", "success": False, "error": str(exc)}

        # Step 4: Decision (NEW — analyze match results)
        decision_result = {}
        try:
            decision_result = self.decision.decide_best_match(audio_match_result)
            logger.info("[%s] Step 4 — Decision: verified=%s confidence=%s",
                        self.name,
                        decision_result.get("verified"),
                        decision_result.get("confidence"))
        except Exception as exc:
            logger.exception("[%s] Decision agent failed", self.name)
            decision_result = {"verified": False, "confidence": 0, "reason": str(exc)}

        # Step 4b: Smart Alerts (analyze decision + preferences)
        smart_alerts = []
        try:
            from learning.preferences import get_preferences_summary
            prefs_summary = get_preferences_summary()
            smart_alerts = generate_alerts(decision_result, prefs_summary)
            logger.info("[%s] Step 4b — Smart alerts: %d generated", self.name, len(smart_alerts))
        except Exception as exc:
            logger.exception("[%s] Alert generation failed", self.name)

        # Step 4c: Push alerts to notifications
        try:
            if smart_alerts:
                from notifications import push_notification
                for alert in smart_alerts:
                    push_notification(
                        message=f"[{alert['type'].upper()}] {alert['message']}: {alert.get('reason', '')} — {artist} - {song}",
                        ntype=alert["type"],
                        source="alert_engine",
                    )
        except Exception as exc:
            logger.debug("[%s] Could not push alert notifications: %s", self.name, exc)

        # Step 4d: Auto Suggestion (AI decision helper)
        auto_suggestion = {}
        try:
            from learning.preferences import get_preferences_summary
            prefs_for_suggestion = get_preferences_summary() if not prefs_summary else prefs_summary
            auto_suggestion = suggest_action(decision_result, smart_alerts, prefs_for_suggestion)
            logger.info("[%s] Step 4d — Suggestion: %s (confidence=%s)",
                        self.name, auto_suggestion.get("suggested_action"), auto_suggestion.get("confidence"))
        except Exception as exc:
            logger.exception("[%s] Suggestion engine failed", self.name)

        # Step 5: Content ID verification (optional)
        content_id_result = None
        try:
            from providers.content_id_provider import verify_content_id, _is_enabled
            if _is_enabled():
                best = (decision_result.get("best_match") or {})
                vid_url = best.get("url", "")
                # Extract video_id from URL if available
                video_id = ""
                if "watch?v=" in vid_url:
                    video_id = vid_url.split("watch?v=")[1].split("&")[0]
                elif "youtu.be/" in vid_url:
                    video_id = vid_url.split("youtu.be/")[1].split("?")[0]
                if video_id:
                    content_id_result = verify_content_id(video_id)
                    logger.info("[%s] Step 5 — Content ID: %s", self.name, content_id_result)
        except Exception as exc:
            logger.debug("[%s] Content ID skipped: %s", self.name, exc)

        # Step 6: Validate
        try:
            validation = self.validation.run(row_data)
            logger.info("[%s] Step 6 — validation: %.1f%% complete", self.name, validation.get("completeness_pct", 0))
        except Exception as exc:
            logger.exception("[%s] Validation failed", self.name)
            validation = {"is_valid": False, "error": str(exc)}

        # Step 7: Generate suggestions
        try:
            suggestions = self.suggestion.run(
                validation=validation,
                youtube_results=yt_results,
            )
            logger.info("[%s] Step 7 — %d suggestions generated", self.name, suggestions.get("count", 0))
        except Exception as exc:
            logger.exception("[%s] Suggestion generation failed", self.name)
            suggestions = {"suggestions": [], "error": str(exc)}

        # Step 8: Build available actions (NOT executed)
        try:
            actions = self.control.run(
                validation=validation,
                youtube_results=yt_results,
                suggestions=suggestions,
            )
            logger.info("[%s] Step 8 — %d actions available", self.name, actions.get("count", 0))
        except Exception as exc:
            logger.exception("[%s] Control agent failed", self.name)
            actions = {"actions": [], "error": str(exc)}

        result = {
            "pipeline": self.name,
            "data": {
                "row_index": row_index,
                "song": song,
                "artist": artist,
                "row_data": row_data,
            },
            "youtube": yt_results,
            "audio_matching": audio_match_result,
            "decisions": decision_result,
            "alerts": smart_alerts,
            "auto_suggestion": auto_suggestion,
            "content_id": content_id_result,
            "validation": validation,
            "suggestions": suggestions.get("suggestions", []),
            "actions": actions.get("actions", []),
            "note": "No actions auto-executed. User must approve.",
        }

        logger.info("[%s] Pipeline complete", self.name)
        return result

    def run_batch(self, max_rows: int = 10) -> dict:
        """Run the pipeline on multiple sheet rows.

        Args:
            max_rows: Maximum number of rows to process.

        Returns:
            dict with per-row results aggregated.
        """
        logger.info("[%s] Running batch pipeline (max %d rows)", self.name, max_rows)

        try:
            rows = fetch_releases_from_sheet()
        except Exception as exc:
            return {"error": f"Sheet fetch failed: {exc}"}

        results = []
        alerts = []
        all_suggestions = []
        all_actions = []

        for i, row in enumerate(rows[:max_rows]):
            song = row.get("song_en") or row.get("Song Name English", "")
            artist = row.get("artist_en") or row.get("Artist Name English", "")

            if not song or not artist:
                continue

            # Only validate + suggest (skip YouTube search in batch to stay fast)
            validation = self.validation.run(row)

            if not validation.get("is_valid"):
                alerts.append({
                    "row": i,
                    "artist": artist,
                    "song": song,
                    "missing": validation.get("total_missing", 0),
                    "completeness": validation.get("completeness_pct", 0),
                })

            suggestion_result = self.suggestion.run(validation=validation)
            for s in suggestion_result.get("suggestions", []):
                s["row"] = i
                s["artist"] = artist
                s["song"] = song
                all_suggestions.append(s)

            results.append({
                "row": i,
                "artist": artist,
                "song": song,
                "completeness": validation.get("completeness_pct", 0),
                "is_valid": validation.get("is_valid", False),
            })

        return {
            "pipeline": f"{self.name}_BATCH",
            "data": results,
            "alerts": alerts,
            "suggestions": all_suggestions,
            "actions": [],
            "total_processed": len(results),
            "note": "Batch mode — YouTube search skipped for speed. Run individual pipeline for full results.",
        }
