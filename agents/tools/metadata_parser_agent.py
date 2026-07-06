"""
METADATA_PARSER_AGENT — Parses Excel files and normalizes release metadata.

Converts raw Excel rows into the standard release dict format used
by all other video formatter agents.
"""

import logging
import pandas as pd

logger = logging.getLogger("agents.tools.metadata_parser")

# Map Excel column names → standard field names
EXCEL_COLUMN_MAP = {
    "Artist Name English": "artist_en",
    "Artist Name Arabic": "artist_ar",
    "Song Name English": "song_en",
    "Song Name Arabic": "song_ar",
    "Album Name English": "album_en",
    "Album Name Arabic": "album_ar",
    "Song Writer - English Name": "songwriter_en",
    "Song Writer - Arabic Name": "songwriter_ar",
    "Composer - English Name": "composer_en",
    "Composer - Arabic Name": "composer_ar",
    "Arrange - English Name": "arranger_en",
    "Arrange Arabic Name": "arranger_ar",
    "ISRC": "isrc",
    "UPC": "upc",
}


class MetadataParserAgent:
    name = "METADATA_PARSER_AGENT"

    def parse_excel(self, file_path: str) -> list[dict]:
        """Parse an Excel file and return normalized release dicts."""
        logger.info("[%s] Parsing Excel: %s", self.name, file_path)

        df = pd.read_excel(file_path)

        # Clean column names
        df.columns = [
            str(col).strip()
            .replace("\r", "").replace("\n", "")
            .replace("\t", "").replace("\u200b", "")
            .replace("\ufeff", "")
            for col in df.columns
        ]

        releases = []
        for _, row in df.iterrows():
            release = {}
            for excel_col, field_name in EXCEL_COLUMN_MAP.items():
                val = row.get(excel_col, "")
                if pd.isna(val):
                    val = ""
                release[field_name] = str(val).strip()
            releases.append(release)

        logger.info("[%s] Parsed %d releases", self.name, len(releases))
        return releases

    def parse_dict(self, raw: dict) -> dict:
        """Normalize a single raw dict (from API body) into standard format."""
        release = {}
        # Accept both Excel column names and standard field names
        combined_map = {**EXCEL_COLUMN_MAP}
        # Also accept standard names directly
        standard_fields = set(EXCEL_COLUMN_MAP.values())

        for key, value in raw.items():
            clean_key = key.strip()
            if clean_key in combined_map:
                release[combined_map[clean_key]] = str(value).strip() if value else ""
            elif clean_key in standard_fields:
                release[clean_key] = str(value).strip() if value else ""

        return release

    def run(self, file_path: str | None = None, raw: dict | None = None) -> dict:
        if file_path:
            return {"releases": self.parse_excel(file_path), "source": "excel"}
        if raw:
            return {"release": self.parse_dict(raw), "source": "api"}
        return {"error": "No input provided"}
