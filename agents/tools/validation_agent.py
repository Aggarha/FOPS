"""
ValidationAgent — Checks release data for missing or incomplete fields.

Does NOT execute any actions — only reports issues.
"""

import logging

logger = logging.getLogger("agents.tools.validation_agent")

# Fields that should be present and non-empty for a complete release
REQUIRED_FIELDS = {
    "artist_en": "Artist name (English)",
    "song_en": "Song name (English)",
    "isrc": "ISRC code",
    "upc": "UPC code",
}

RECOMMENDED_FIELDS = {
    "artist_ar": "Artist name (Arabic)",
    "song_ar": "Song name (Arabic)",
    "songwriter_en": "Songwriter",
    "composer_en": "Composer",
    "album_en": "Album name",
}

MEDIA_FIELDS = {
    "artwork_1920x1080": "Artwork 1920x1080",
    "artwork_3000x3000": "Artwork 3000x3000",
    "artwork_600x600": "Artwork 600x600",
    "delivery_youtube": "YouTube delivery",
    "lyrics_status": "Lyrics",
    "metadata_status": "Metadata",
}


class ValidationAgent:
    name = "VALIDATION"

    def run(self, row_data: dict) -> dict:
        """Validate a release row for missing/incomplete fields.

        Args:
            row_data: Release data dict.

        Returns:
            dict with missing_required, missing_recommended, missing_media,
            and an overall completeness percentage.
        """
        logger.info("[%s] Validating release data (%d fields)", self.name, len(row_data))

        missing_required = []
        missing_recommended = []
        missing_media = []

        for field, label in REQUIRED_FIELDS.items():
            val = row_data.get(field, "")
            if not val or str(val).strip().lower() in ("", "nan", "none", "n/a"):
                missing_required.append({"field": field, "label": label, "severity": "critical"})

        for field, label in RECOMMENDED_FIELDS.items():
            val = row_data.get(field, "")
            if not val or str(val).strip().lower() in ("", "nan", "none", "n/a"):
                missing_recommended.append({"field": field, "label": label, "severity": "warning"})

        for field, label in MEDIA_FIELDS.items():
            val = row_data.get(field, "")
            if not val or str(val).strip().lower() in ("", "nan", "none", "n/a", "missing"):
                missing_media.append({"field": field, "label": label, "severity": "warning"})

        total_fields = len(REQUIRED_FIELDS) + len(RECOMMENDED_FIELDS) + len(MEDIA_FIELDS)
        total_missing = len(missing_required) + len(missing_recommended) + len(missing_media)
        completeness = round(((total_fields - total_missing) / total_fields) * 100, 1) if total_fields else 0

        return {
            "agent": self.name,
            "missing_required": missing_required,
            "missing_recommended": missing_recommended,
            "missing_media": missing_media,
            "total_missing": total_missing,
            "completeness_pct": completeness,
            "is_valid": len(missing_required) == 0,
        }
