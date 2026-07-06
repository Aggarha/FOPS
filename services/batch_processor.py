"""
FOPS Batch Processor — Excel/CSV Upload + Multi-Song Search.

Features:
  - Parse Excel (.xlsx) and CSV uploads
  - Auto-detect column names (artist, song, isrc, upc)
  - Run batch discovery searches concurrently
  - Group results by song
  - Export combined results to XLSX with full analytics
"""

import io
import logging
from typing import Optional, Callable

logger = logging.getLogger("services.batch_processor")

# Expected column name aliases
ARTIST_ALIASES = ["artist", "artist name", "artist_name", "performer", "الفنان", "فنان"]
SONG_ALIASES = ["song", "song name", "song_name", "title", "track", "track name",
                "الاغنية", "اسم الاغنية", "اغنية", "عنوان"]
ISRC_ALIASES = ["isrc", "isrc_code", "isrc code"]
UPC_ALIASES = ["upc", "upc_code", "upc code", "barcode"]


def _normalise_col(name: str) -> str:
    return (name or "").strip().lower().replace("-", " ").replace("_", " ")


def _find_col(headers: list[str], aliases: list[str]) -> Optional[str]:
    """Find the actual column name matching one of the aliases."""
    normalised = {_normalise_col(h): h for h in headers}
    for alias in aliases:
        if alias in normalised:
            return normalised[alias]
    return None


def parse_excel(file_bytes: bytes, filename: str = "") -> dict:
    """Parse Excel (.xlsx) or CSV bytes into a list of search items.

    Returns:
        {
            success, rows: [{artist, song, isrc?, upc?}],
            total, skipped, headers, error
        }
    """
    try:
        if filename.lower().endswith(".csv") or (not filename and b"\n" in file_bytes[:200]):
            return _parse_csv(file_bytes)
        else:
            return _parse_xlsx(file_bytes)
    except Exception as e:
        logger.error("parse_excel error: %s", e)
        return {"success": False, "rows": [], "total": 0, "skipped": 0,
                "headers": [], "error": str(e)}


def _parse_xlsx(file_bytes: bytes) -> dict:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if not header_row:
        return {"success": False, "rows": [], "total": 0, "skipped": 0,
                "headers": [], "error": "Empty spreadsheet"}

    headers = [str(h).strip() if h is not None else "" for h in header_row]
    return _extract_rows(headers, list(rows_iter))


def _parse_csv(file_bytes: bytes) -> dict:
    import csv
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {"success": False, "rows": [], "total": 0, "skipped": 0,
                "headers": [], "error": "Empty CSV"}
    headers = [str(h).strip() for h in rows[0]]
    return _extract_rows(headers, [tuple(r) for r in rows[1:]])


def _extract_rows(headers: list[str], data_rows) -> dict:
    artist_col = _find_col(headers, ARTIST_ALIASES)
    song_col = _find_col(headers, SONG_ALIASES)
    isrc_col = _find_col(headers, ISRC_ALIASES)
    upc_col = _find_col(headers, UPC_ALIASES)

    if not artist_col or not song_col:
        missing = []
        if not artist_col:
            missing.append("artist")
        if not song_col:
            missing.append("song/title")
        return {
            "success": False, "rows": [], "total": 0, "skipped": 0,
            "headers": headers,
            "error": f"Could not find columns: {', '.join(missing)}. "
                     f"Expected: artist, song (or Arabic equivalents). "
                     f"Found: {headers}"
        }

    artist_idx = headers.index(artist_col)
    song_idx = headers.index(song_col)
    isrc_idx = headers.index(isrc_col) if isrc_col else None
    upc_idx = headers.index(upc_col) if upc_col else None

    rows = []
    skipped = 0
    for row in data_rows:
        if not row:
            continue
        try:
            artist = str(row[artist_idx]).strip() if row[artist_idx] is not None else ""
            song = str(row[song_idx]).strip() if row[song_idx] is not None else ""
        except IndexError:
            skipped += 1
            continue

        if not artist or not song:
            skipped += 1
            continue

        item = {"artist": artist, "song": song}
        if isrc_idx is not None and isrc_idx < len(row) and row[isrc_idx]:
            item["isrc"] = str(row[isrc_idx]).strip()
        if upc_idx is not None and upc_idx < len(row) and row[upc_idx]:
            item["upc"] = str(row[upc_idx]).strip()
        rows.append(item)

    return {
        "success": len(rows) > 0,
        "rows": rows,
        "total": len(rows),
        "skipped": skipped,
        "headers": headers,
        "error": None if rows else "No valid rows found",
    }


def export_results_to_xlsx(batch_results: list[dict]) -> bytes:
    """Export batch discovery results to XLSX with all analytics columns.

    Args:
        batch_results: List of search result dicts from discovery_engine.batch_search.

    Returns:
        XLSX file as bytes.
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "FOPS Discovery Results"

    # Header style
    header_font = Font(bold=True, color="00FF00", size=11)
    header_fill = PatternFill("solid", fgColor="0A0A0A")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    headers = [
        "Searched Artist", "Searched Song", "Result Title", "Platform",
        "Channel", "Channel URL", "Subscribers", "Views", "Upload Date",
        "Duration", "Match Type", "Confidence", "Is Official",
        "Is Short", "Video URL", "ISRC", "UPC",
    ]

    ws.append(headers)
    for col_idx, _ in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align

    # Column widths
    col_widths = [18, 18, 45, 12, 28, 35, 14, 14, 14, 10, 14, 12, 12, 10, 45, 16, 16]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w

    # Data rows
    row_fill_even = PatternFill("solid", fgColor="111111")
    row_fill_odd = PatternFill("solid", fgColor="1A1A1A")

    row_num = 2
    for search_result in batch_results:
        if not search_result:
            continue
        artist = search_result.get("artist", "")
        song = search_result.get("song", "")
        isrc = search_result.get("isrc", "")
        upc = search_result.get("upc", "")

        for result in (search_result.get("results") or []):
            fill = row_fill_even if row_num % 2 == 0 else row_fill_odd
            row_data = [
                artist,
                song,
                result.get("title", ""),
                result.get("platform", "YouTube"),
                result.get("channel", ""),
                result.get("channel_url", ""),
                result.get("subscribers"),
                result.get("views"),
                result.get("upload_date", ""),
                result.get("duration_formatted", ""),
                result.get("match_type", ""),
                result.get("confidence"),
                "Yes" if result.get("is_official") else "No",
                "Yes" if result.get("is_short") else "No",
                result.get("url", ""),
                isrc,
                upc,
            ]
            ws.append(row_data)
            for col_idx in range(1, len(row_data) + 1):
                cell = ws.cell(row=row_num, column=col_idx)
                cell.fill = fill
                cell.font = Font(color="DDDDDD", size=10)
                cell.alignment = Alignment(vertical="center")
            row_num += 1

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{ws.cell(row=1, column=len(headers)).coordinate}"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def export_results_to_csv(batch_results: list[dict]) -> str:
    """Export batch results to CSV string."""
    import csv
    buf = io.StringIO()
    fields = ["searched_artist", "searched_song", "title", "platform", "channel",
              "channel_url", "subscribers", "views", "upload_date", "duration_formatted",
              "match_type", "confidence", "is_official", "is_short", "url"]
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for search_result in batch_results:
        if not search_result:
            continue
        artist = search_result.get("artist", "")
        song = search_result.get("song", "")
        for result in (search_result.get("results") or []):
            row = dict(result)
            row["searched_artist"] = artist
            row["searched_song"] = song
            writer.writerow(row)
    return buf.getvalue()
