"""
ALERTS_AGENT — Missing data detection and notification system.

Responsibilities:
  - Detect missing artwork, youtube links, metadata, lyrics
  - Classify alert severity (critical / warning / info)
  - Generate structured alert payloads
  - Prepare notification dispatch (email, webhook, Slack-ready)
"""

import logging
from datetime import datetime

from google_sheets import fetch_releases_from_sheet

logger = logging.getLogger("agents.alerts")


# Fields to check and their severity if missing
ALERT_RULES = {
    # field_name: (alert_type, severity)
    "artwork_1920x1080": ("missing_artwork", "critical"),
    "artwork_3000x3000": ("missing_artwork", "critical"),
    "artwork_600x600": ("missing_artwork", "warning"),
    "metadata_status": ("missing_metadata", "critical"),
    "lyrics_status": ("missing_lyrics", "warning"),
    "delivery_youtube": ("missing_youtube", "critical"),
    "link_anghami": ("missing_link", "warning"),
    "link_apple": ("missing_link", "warning"),
    "link_yango": ("missing_link", "info"),
}


class AlertsAgent:
    """Scans releases for missing data and generates alerts."""

    name = "ALERTS_AGENT"

    # ---- scanning --------------------------------------------------------

    def scan(self, rows: list[dict] | None = None) -> list[dict]:
        """Scan all releases and return a list of alert objects."""
        if rows is None:
            rows = fetch_releases_from_sheet()

        logger.info("[%s] Scanning %d releases for issues …", self.name, len(rows))
        alerts: list[dict] = []

        for row in rows:
            artist = row.get("artist") or "Unknown"
            song = row.get("song") or "Unknown"
            upc = row.get("upc") or ""

            for field, (alert_type, severity) in ALERT_RULES.items():
                value = (row.get(field) or "").strip().lower()
                # Consider empty, "false", or known-missing markers as missing
                if not value or value in ("false", "no", "folder missing", "pending"):
                    alerts.append({
                        "type": alert_type,
                        "severity": severity,
                        "artist": artist,
                        "song": song,
                        "upc": upc,
                        "field": field,
                        "current_value": row.get(field, ""),
                        "timestamp": datetime.utcnow().isoformat(),
                    })

        logger.info("[%s] Generated %d alerts", self.name, len(alerts))
        return alerts

    # ---- filtering -------------------------------------------------------

    def get_critical(self, alerts: list[dict] | None = None) -> list[dict]:
        """Return only critical-severity alerts."""
        if alerts is None:
            alerts = self.scan()
        return [a for a in alerts if a["severity"] == "critical"]

    def get_by_type(self, alert_type: str, alerts: list[dict] | None = None) -> list[dict]:
        """Filter alerts by type (e.g. 'missing_artwork')."""
        if alerts is None:
            alerts = self.scan()
        return [a for a in alerts if a["type"] == alert_type]

    def summary(self, alerts: list[dict] | None = None) -> dict:
        """Aggregate alert counts by type and severity."""
        if alerts is None:
            alerts = self.scan()

        by_type: dict[str, int] = {}
        by_severity: dict[str, int] = {}
        for a in alerts:
            by_type[a["type"]] = by_type.get(a["type"], 0) + 1
            by_severity[a["severity"]] = by_severity.get(a["severity"], 0) + 1

        return {
            "total_alerts": len(alerts),
            "by_type": by_type,
            "by_severity": by_severity,
        }

    # ---- notification preparation ----------------------------------------

    def build_notifications(self, alerts: list[dict] | None = None) -> list[dict]:
        """Build structured notification payloads ready for dispatch."""
        if alerts is None:
            alerts = self.get_critical()

        notifications: list[dict] = []
        for alert in alerts:
            notifications.append({
                "channel": "email",  # future: slack, webhook
                "subject": f"[FOPS Alert] {alert['type']} — {alert['artist']} - {alert['song']}",
                "body": (
                    f"Release: {alert['artist']} — {alert['song']}\n"
                    f"UPC: {alert['upc']}\n"
                    f"Issue: {alert['type']} (field: {alert['field']})\n"
                    f"Severity: {alert['severity']}\n"
                    f"Current value: {alert['current_value'] or '(empty)'}\n"
                    f"Detected: {alert['timestamp']}"
                ),
                "severity": alert["severity"],
            })

        logger.info("[%s] Built %d notifications", self.name, len(notifications))
        return notifications

    # ---- entry point -----------------------------------------------------

    def run(self) -> dict:
        """Execute full alert scan pipeline."""
        logger.info("[%s] ▶ Running alert scan …", self.name)
        alerts = self.scan()
        critical = self.get_critical(alerts)
        report = self.summary(alerts)
        notifications = self.build_notifications(critical)

        result = {
            **report,
            "critical_count": len(critical),
            "notifications_queued": len(notifications),
        }
        logger.info("[%s] ✔ Alert scan complete: %s", self.name, result)
        return result
