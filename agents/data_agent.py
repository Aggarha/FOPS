"""
DATA_AGENT — Google Sheets data pipeline.

Responsibilities:
  - Connect to Google Sheets via service account
  - Sync releases data to the local SQLite database
  - Clean and normalise incoming data
  - Handle dynamic header mapping (multi-row headers)
  - Detect missing / incomplete values
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from google_sheets import (
    fetch_releases_from_sheet,
    sync_from_google_sheets,
    HEADER_FIELD_MAP,
)

logger = logging.getLogger("agents.data")

REQUIRED_FIELDS = ["artist", "song", "release_type", "upc"]
LINK_FIELDS = [
    "link_anghami",
    "link_apple",
    "link_yango",
    "google_drive_link",
]


class DataAgent:
    """Fetches, cleans, and syncs release data from Google Sheets."""

    name = "DATA_AGENT"

    # ---- public interface ------------------------------------------------

    def fetch_raw(self) -> list[dict]:
        """Return every data row from Sheet1 (rows 4+)."""
        logger.info("[%s] Fetching raw sheet data …", self.name)
        rows = fetch_releases_from_sheet()
        logger.info("[%s] Fetched %d rows", self.name, len(rows))
        return rows

    def sync_to_db(self, db: Session) -> dict:
        """Pull sheet data and upsert into the database."""
        logger.info("[%s] Starting DB sync …", self.name)
        result = sync_from_google_sheets(db)
        logger.info("[%s] Sync complete: %s", self.name, result)
        return result

    def clean(self, rows: list[dict]) -> list[dict]:
        """Strip whitespace and normalise empty strings to None."""
        cleaned: list[dict] = []
        for row in rows:
            entry = {}
            for key, value in row.items():
                v = value.strip() if isinstance(value, str) else value
                entry[key] = v if v else None
            cleaned.append(entry)
        logger.info("[%s] Cleaned %d rows", self.name, len(cleaned))
        return cleaned

    def detect_missing(self, rows: list[dict] | None = None) -> list[dict]:
        """Return rows that have at least one required or link field empty."""
        if rows is None:
            rows = self.fetch_raw()
        rows = self.clean(rows)

        missing: list[dict] = []
        check_fields = REQUIRED_FIELDS + LINK_FIELDS
        for row in rows:
            gaps = [f for f in check_fields if not row.get(f)]
            if gaps:
                missing.append({
                    "artist": row.get("artist"),
                    "song": row.get("song"),
                    "upc": row.get("upc"),
                    "missing_fields": gaps,
                })
        logger.info("[%s] %d rows with missing data", self.name, len(missing))
        return missing

    def get_header_map(self) -> dict:
        """Return the current header → field mapping."""
        return dict(HEADER_FIELD_MAP)

    # ---- entry point -----------------------------------------------------

    def run(self, db: Session | None = None) -> dict:
        """Execute the full data pipeline."""
        logger.info("[%s] ▶ Running full pipeline …", self.name)
        rows = self.fetch_raw()
        rows = self.clean(rows)
        missing = self.detect_missing(rows)

        result = {"fetched": len(rows), "missing_count": len(missing)}

        if db is not None:
            sync = self.sync_to_db(db)
            result["sync"] = sync

        logger.info("[%s] ✔ Pipeline finished: %s", self.name, result)
        return result
