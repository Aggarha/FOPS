import logging
import os

import gspread
from oauth2client.service_account import ServiceAccountCredentials
from sqlalchemy.orm import Session

from models import Release

logger = logging.getLogger(__name__)

# Path to service account credentials JSON file
CREDENTIALS_PATH = os.getenv(
    "GOOGLE_SHEETS_CREDENTIALS", "/var/www/fops/credentials.json"
)
# Google Sheet name (or set via env var)
SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "FOPS Releases")

# Expected column headers → model field mapping
COLUMN_MAP = {
    "Artist": "artist_name",
    "Song": "song_title",
    "Type": "release_type",
    "UPC": "upc",
    "Date": "release_date",
    "Artwork": "artwork_link",
    "Metadata": "metadata_link",
    "Lyrics": "lyrics_link",
    "YouTube": "youtube_link",
}

VALID_RELEASE_TYPES = {"single", "album", "ep", "concert"}


def _get_client() -> gspread.Client:
    """Authenticate and return a gspread client."""
    scopes = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = ServiceAccountCredentials.from_json_keyfile_name(CREDENTIALS_PATH, scopes)
    return gspread.authorize(creds)


def fetch_sheet_rows() -> list[dict]:
    """Fetch all rows from the configured Google Sheet.

    Returns a list of dicts with keys matching Release model fields.
    """
    client = _get_client()
    sheet = client.open(SHEET_NAME).sheet1
    records = sheet.get_all_records()

    rows: list[dict] = []
    for idx, record in enumerate(records, start=2):  # row 1 is header
        mapped: dict = {}
        for sheet_col, model_field in COLUMN_MAP.items():
            value = str(record.get(sheet_col, "")).strip()
            mapped[model_field] = value if value else None
        # Validate required fields
        if not mapped.get("artist_name") or not mapped.get("song_title"):
            logger.warning("Row %d skipped: missing artist_name or song_title", idx)
            continue
        # Normalise release_type
        rt = (mapped.get("release_type") or "single").lower()
        mapped["release_type"] = rt if rt in VALID_RELEASE_TYPES else "single"
        rows.append(mapped)

    logger.info("Fetched %d valid rows from Google Sheets", len(rows))
    return rows


def sync_from_google_sheets(db: Session) -> dict:
    """Pull rows from Google Sheets and upsert into the database.

    Deduplicates on UPC — updates existing rows if UPC matches,
    otherwise inserts new releases.

    Returns a summary dict with counts.
    """
    rows = fetch_sheet_rows()

    inserted = 0
    updated = 0
    skipped = 0

    for row in rows:
        upc = row.get("upc")

        # If UPC is present, try to find existing release
        existing: Release | None = None
        if upc:
            existing = db.query(Release).filter(Release.upc == upc).first()

        if existing:
            # Update fields from sheet (only overwrite non-empty values)
            changed = False
            for field, value in row.items():
                if value is not None and getattr(existing, field, None) != value:
                    setattr(existing, field, value)
                    changed = True
            if changed:
                updated += 1
            else:
                skipped += 1
        else:
            # Insert new release
            db_release = Release(
                artist_name=row["artist_name"],
                song_title=row["song_title"],
                release_type=row["release_type"],
                upc=upc,
                release_date=row.get("release_date"),
                status="pending",
                artwork_link=row.get("artwork_link"),
                metadata_link=row.get("metadata_link"),
                lyrics_link=row.get("lyrics_link"),
                youtube_link=row.get("youtube_link"),
            )
            db.add(db_release)
            inserted += 1

    db.commit()

    summary = {"inserted": inserted, "updated": updated, "skipped": skipped}
    logger.info("Google Sheets sync complete: %s", summary)
    return summary


# --------------- Sheet1 Raw Reader ---------------

SHEET_KEY = "11xwABGWcv78uUmtQgWUHZEd3dkQbjK7SuzPxI_4Qx0o"

# Composite header name → output JSON field name
HEADER_FIELD_MAP = {
    "Date": "date",
    "Day": "day",
    "EG": "eg_time",
    "KSA": "ksa_time",
    "UPC": "upc",
    "Name": "artist",
    "Title": "song",
    "Type": "release_type",
    "Number Of Tracks": "number_of_tracks",
    "Motion Graphics Team_Yes/No": "motion_graphics",
    "Team Member": "motion_team_member",
    "Delivery_Operations": "delivery_operations",
    "Motion/Editing": "delivery_motion_editing",
    "YouTube": "delivery_youtube",
    "Type_2": "video_type",
    "Label": "label",
    "Type_3": "distribution_type",
    "Google Drive Link": "google_drive_link",
    "Artwork_1920x1080": "artwork_1920x1080",
    "3000x3000": "artwork_3000x3000",
    "600x600": "artwork_600x600",
    "JPG_1920x1080": "jpg_1920x1080",
    "3000x3000_2": "jpg_3000x3000",
    "Metadata": "metadata_status",
    "Lyrics": "lyrics_status",
    "Links_Anghami": "link_anghami",
    "Apple": "link_apple",
    "Yango": "link_yango",
    "Notes": "notes",
}


def _build_headers(data: list[list[str]]) -> list[str]:
    """Build unique composite column headers from the first 3 header rows."""
    row1 = data[0] if len(data) > 0 else []
    row2 = data[1] if len(data) > 1 else []
    row3 = data[2] if len(data) > 2 else []

    ncols = max(len(row1), len(row2), len(row3))
    headers: list[str] = []
    seen: dict[str, int] = {}

    for i in range(ncols):
        r2 = row2[i].strip() if i < len(row2) else ""
        r3 = row3[i].strip() if i < len(row3) else ""
        r1 = row1[i].strip() if i < len(row1) else ""

        # Combine row2 + row3 for specificity; fall back to row1
        parts = [p for p in [r2, r3] if p]
        name = "_".join(parts) if parts else (r1 or f"col_{i}")

        # Deduplicate by appending a counter
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 1

        headers.append(name)

    return headers


def fetch_releases_from_sheet() -> list[dict]:
    """Read Sheet1 by key and return rows from row 4 onward as structured JSON."""
    scope = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = ServiceAccountCredentials.from_json_keyfile_name(CREDENTIALS_PATH, scope)
    client = gspread.authorize(creds)

    sheet = client.open_by_key(SHEET_KEY).sheet1
    data = sheet.get_all_values()

    # Build header-based column map from the first 3 rows
    headers = _build_headers(data)
    col_map = {name: i for i, name in enumerate(headers)}

    # Log any expected headers that are missing from the sheet
    for header_name in HEADER_FIELD_MAP:
        if header_name not in col_map:
            logger.warning("Expected column %r not found in sheet headers", header_name)

    # Data starts at row 4 (index 3)
    rows = data[3:]

    result = []
    for row in rows:
        # Skip empty rows
        if not any(cell.strip() for cell in row):
            continue

        entry = {}
        for header_name, field_name in HEADER_FIELD_MAP.items():
            idx = col_map.get(header_name)
            if idx is not None and idx < len(row):
                entry[field_name] = row[idx].strip()
            else:
                entry[field_name] = ""

        result.append(entry)

    logger.info("Fetched %d rows from Sheet1", len(result))
    return result
