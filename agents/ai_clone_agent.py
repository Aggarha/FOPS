"""
AI_CLONE_AGENT — Behavioral learning and intelligent assistance.

Responsibilities:
  - Learn from user interaction patterns
  - Generate emails / messages in the user's tone
  - Analyse release performance trends
  - Suggest operational actions
"""

import logging
from datetime import datetime

from google_sheets import fetch_releases_from_sheet

logger = logging.getLogger("agents.ai_clone")

# Default tone profile (can be overridden / learned over time)
DEFAULT_TONE = {
    "formality": "professional",
    "language": "en",
    "greeting": "Hi",
    "sign_off": "Best regards",
    "name": "FOPS Team",
}


class AICloneAgent:
    """AI assistant that mirrors user tone and provides intelligent suggestions."""

    name = "AI_CLONE_AGENT"

    def __init__(self):
        self.tone = dict(DEFAULT_TONE)
        self.interaction_log: list[dict] = []

    # ---- tone management -------------------------------------------------

    def set_tone(self, **kwargs) -> dict:
        """Update tone profile fields."""
        for key, value in kwargs.items():
            if key in self.tone:
                self.tone[key] = value
        logger.info("[%s] Tone updated: %s", self.name, self.tone)
        return self.tone

    def get_tone(self) -> dict:
        return dict(self.tone)

    # ---- email generation ------------------------------------------------

    def generate_email(self, recipient: str, subject: str, context: str) -> dict:
        """Generate a professional email based on context and current tone."""
        logger.info("[%s] Generating email for %s …", self.name, recipient)

        body = (
            f"{self.tone['greeting']} {recipient},\n\n"
            f"{context}\n\n"
            f"{self.tone['sign_off']},\n"
            f"{self.tone['name']}"
        )

        email = {
            "to": recipient,
            "subject": subject,
            "body": body,
            "generated_at": datetime.utcnow().isoformat(),
            "tone": self.tone["formality"],
        }

        self._log_interaction("email_generated", {"recipient": recipient, "subject": subject})
        return email

    def generate_release_email(self, release: dict) -> dict:
        """Generate a release announcement email from a release row."""
        artist = release.get("artist", "Unknown Artist")
        song = release.get("song", "Unknown Track")
        rtype = release.get("release_type", "release")
        date = release.get("date", "TBD")

        subject = f"New {rtype}: {artist} — {song}"
        context = (
            f"We are pleased to announce the upcoming {rtype} by {artist}.\n\n"
            f"Track: {song}\n"
            f"Release Date: {date}\n\n"
            f"Please ensure all deliverables are finalized before the release date."
        )

        return self.generate_email("team", subject, context)

    # ---- performance analysis --------------------------------------------

    def analyse_performance(self, rows: list[dict] | None = None) -> dict:
        """Analyse release data for trends and patterns."""
        if rows is None:
            rows = fetch_releases_from_sheet()

        logger.info("[%s] Analysing %d releases …", self.name, len(rows))

        type_counts: dict[str, int] = {}
        label_counts: dict[str, int] = {}
        artist_counts: dict[str, int] = {}
        completion_count = 0

        for row in rows:
            rt = (row.get("release_type") or "unknown").lower()
            type_counts[rt] = type_counts.get(rt, 0) + 1

            label = (row.get("label") or "unknown").strip()
            label_counts[label] = label_counts.get(label, 0) + 1

            artist = (row.get("artist") or "unknown").strip()
            artist_counts[artist] = artist_counts.get(artist, 0) + 1

            ops = (row.get("delivery_operations") or "").lower()
            if ops == "done":
                completion_count += 1

        total = len(rows) or 1
        top_artists = sorted(artist_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        analysis = {
            "total_releases": len(rows),
            "by_type": type_counts,
            "by_label": label_counts,
            "top_artists": [{"artist": a, "count": c} for a, c in top_artists],
            "completion_rate": round(completion_count / total * 100, 1),
        }

        logger.info("[%s] Analysis complete", self.name)
        return analysis

    # ---- suggestions -----------------------------------------------------

    def suggest_actions(self, rows: list[dict] | None = None) -> list[dict]:
        """Generate actionable suggestions based on current data."""
        if rows is None:
            rows = fetch_releases_from_sheet()

        suggestions: list[dict] = []

        for row in rows:
            artist = row.get("artist", "Unknown")
            song = row.get("song", "Unknown")
            ops = (row.get("delivery_operations") or "").strip().lower()
            yt = (row.get("delivery_youtube") or "").strip().lower()
            art = (row.get("artwork_1920x1080") or "").strip().lower()

            if ops == "pending":
                suggestions.append({
                    "action": "follow_up_operations",
                    "release": f"{artist} — {song}",
                    "message": "Operations delivery is still pending. Follow up with the team.",
                    "priority": "high",
                })
            if yt in ("false", "no", ""):
                suggestions.append({
                    "action": "upload_youtube",
                    "release": f"{artist} — {song}",
                    "message": "YouTube delivery not completed.",
                    "priority": "medium",
                })
            if art in ("folder missing", ""):
                suggestions.append({
                    "action": "prepare_artwork",
                    "release": f"{artist} — {song}",
                    "message": "Artwork files are missing from the folder.",
                    "priority": "high",
                })

        logger.info("[%s] Generated %d suggestions", self.name, len(suggestions))
        return suggestions

    # ---- alert message generation -----------------------------------------

    def generate_alert_messages(self, critical_alerts: list[dict]) -> list[str]:
        """Generate human-like messages for critical alerts.

        Groups alerts by release (artist + song) and produces one
        readable message per release.
        """
        logger.info("[%s] Generating messages for %d critical alerts …", self.name, len(critical_alerts))

        # Group by release
        grouped: dict[str, list[str]] = {}
        for alert in critical_alerts:
            key = f"{alert.get('artist', 'Unknown')} — {alert.get('song', 'Unknown')}"
            issue = alert.get("type", "unknown_issue").replace("_", " ")
            grouped.setdefault(key, []).append(issue)

        messages: list[str] = []
        for release, issues in grouped.items():
            unique = list(dict.fromkeys(issues))  # dedupe, preserve order
            if len(unique) == 1:
                detail = unique[0]
            else:
                detail = ", ".join(unique[:-1]) + f" and {unique[-1]}"
            msg = f"Release '{release}' is {detail}. Action required."
            messages.append(msg)

        self._log_interaction("alert_messages_generated", {"count": len(messages)})
        logger.info("[%s] Generated %d alert messages", self.name, len(messages))
        return messages

    # ---- internal --------------------------------------------------------

    def _log_interaction(self, action: str, details: dict):
        self.interaction_log.append({
            "action": action,
            "details": details,
            "timestamp": datetime.utcnow().isoformat(),
        })

    # ---- entry point -----------------------------------------------------

    def run(self) -> dict:
        """Execute full AI analysis pipeline."""
        logger.info("[%s] ▶ Running AI analysis …", self.name)
        analysis = self.analyse_performance()
        suggestions = self.suggest_actions()

        result = {
            "analysis": analysis,
            "suggestion_count": len(suggestions),
            "tone": self.tone,
        }
        logger.info("[%s] ✔ AI analysis complete", self.name)
        return result
