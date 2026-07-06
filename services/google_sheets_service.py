"""
Google Sheets integration service for FOPS

Reads release data from Google Sheets backup worksheet
and provides normalized, cached access with auto-refresh.
"""

import os
import json
import logging
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from functools import wraps
import time
import re

logger = logging.getLogger(__name__)

# Configuration
SPREADSHEET_ID = os.getenv("GOOGLE_SHEETS_ID", "11xwABGWcv78uUmtQgWUHZEd3dkQbjK7SuzPxI_4Qx0o")
WORKSHEET_GID = 275104986
CACHE_TTL = 60  # seconds
CAIRO_TZ = "Africa/Cairo"

# In-memory cache
_cache = {
    "data": None,
    "timestamp": 0,
    "error": None
}


def _use_cache(ttl=CACHE_TTL):
    """Decorator for caching function results"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            now = time.time()
            cache_key = func.__name__
            
            if _cache.get("data") and (now - _cache["timestamp"]) < ttl:
                logger.info(f"Returning cached data for {cache_key}")
                return _cache["data"]
            
            try:
                result = func(*args, **kwargs)
                _cache["data"] = result
                _cache["timestamp"] = now
                _cache["error"] = None
                return result
            except Exception as e:
                logger.error(f"Error in {func.__name__}: {e}")
                _cache["error"] = str(e)
                # Return cached data if available, even if expired
                if _cache["data"]:
                    logger.warning(f"API error, returning stale cache: {e}")
                    return _cache["data"]
                raise
        
        return wrapper
    return decorator


def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse various date formats"""
    if not date_str or not isinstance(date_str, str):
        return None
    
    date_str = date_str.strip()
    
    # Try different date formats
    formats = [
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%B %d, %Y",
        "%d %B %Y",
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    
    logger.warning(f"Could not parse date: {date_str}")
    return None


def _transliterate_arabic(text: str) -> str:
    """Basic Arabic to English transliteration"""
    if not text:
        return ""
    
    # Manual transliteration mapping
    arabic_map = {
        'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa',
        'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
        'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
        'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
        'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
        'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
        'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
        'ه': 'h', 'و': 'w', 'ي': 'y', 'ة': 'a',
        'ى': 'a', 'ؤ': 'u', 'ئ': 'i', 'ء': '',
    }
    
    result = ""
    for char in text:
        result += arabic_map.get(char, char)
    
    # Clean up spaces
    result = re.sub(r'\s+', ' ', result).strip()
    
    # Capitalize first letter
    if result:
        result = result[0].upper() + result[1:] if len(result) > 1 else result.upper()
    
    return result


def _get_sheets_client():
    """Get authenticated Google Sheets client"""
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        
        # Try to use service account credentials
        creds_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        if creds_json:
            creds_dict = json.loads(creds_json)
            creds = Credentials.from_service_account_info(creds_dict)
            return gspread.authorize(creds)
        
        # Try to use ADC (Application Default Credentials)
        return gspread.oauth_login()
    
    except Exception as e:
        logger.error(f"Failed to authenticate with Google Sheets: {e}")
        return None


@_use_cache()
def fetch_releases_from_sheets() -> List[Dict]:
    """Fetch release data from Google Sheets"""
    try:
        import gspread
        
        client = _get_sheets_client()
        if not client:
            logger.warning("Google Sheets client not available")
            return []
        
        # Open spreadsheet
        sheet = client.open_by_key(SPREADSHEET_ID)
        worksheet = sheet.worksheets()
        
        # Find worksheet by gid
        ws = None
        for w in worksheet:
            if w.id == WORKSHEET_GID:
                ws = w
                break
        
        if not ws:
            logger.warning(f"Worksheet {WORKSHEET_GID} not found")
            return []
        
        # Get all values
        rows = ws.get_all_values()
        if not rows or len(rows) < 2:
            logger.warning("No data found in worksheet")
            return []
        
        # Parse header
        headers = [h.lower().strip() for h in rows[0]]
        
        releases = []
        for row_data in rows[1:]:
            if not any(row_data):  # Skip empty rows
                continue
            
            # Create row dict
            row_dict = {}
            for i, header in enumerate(headers):
                row_dict[header] = row_data[i] if i < len(row_data) else ""
            
            # Normalize release object
            release = {
                "artist": row_dict.get("artist", "").strip(),
                "song": row_dict.get("song", "").strip(),
                "release_date": row_dict.get("release date", row_dict.get("date", "")).strip(),
                "type": row_dict.get("type", row_dict.get("release type", "")).lower().strip(),
                "label": row_dict.get("label", "").strip(),
                "upc": row_dict.get("upc", "").strip(),
                "tracks_count": row_dict.get("tracks count", row_dict.get("tracks", "")).strip(),
                "artwork_status": row_dict.get("artwork status", row_dict.get("artwork", "")).strip(),
                "motion_status": row_dict.get("motion status", row_dict.get("motion", "")).strip(),
                "youtube_status": row_dict.get("youtube status", row_dict.get("youtube", "")).strip(),
                "cairo_team": row_dict.get("cairo team", row_dict.get("cairo", "")).strip(),
                "saudi_team": row_dict.get("saudi team", row_dict.get("saudi", "")).strip(),
            }
            
            # Skip if no artist/song
            if not release["artist"] or not release["song"]:
                continue
            
            releases.append(release)
        
        logger.info(f"Fetched {len(releases)} releases from Google Sheets")
        return releases
    
    except ImportError:
        logger.error("gspread not installed")
        return []
    except Exception as e:
        logger.error(f"Error fetching releases: {e}")
        return []


def get_release_date(release: Dict) -> Optional[datetime]:
    """Parse release date from release object"""
    date_str = release.get("release_date", "")
    return _parse_date(date_str) if date_str else None


def get_today_releases() -> Tuple[List[Dict], int]:
    """Get releases scheduled for today"""
    releases = fetch_releases_from_sheets()
    today = datetime.now().date()
    
    today_releases = []
    for release in releases:
        release_date = get_release_date(release)
        if release_date and release_date.date() == today:
            today_releases.append(release)
    
    # Group by type
    grouped = {}
    for release in today_releases:
        rtype = release.get("type", "unknown")
        if rtype not in grouped:
            grouped[rtype] = []
        grouped[rtype].append(release)
    
    return today_releases, len(today_releases)


def get_next_releases(limit: int = 3) -> List[Dict]:
    """Get next upcoming releases"""
    releases = fetch_releases_from_sheets()
    
    # Filter future releases
    today = datetime.now().date()
    future_releases = []
    
    for release in releases:
        release_date = get_release_date(release)
        if release_date and release_date.date() > today:
            future_releases.append(release)
    
    # Sort by date ascending
    future_releases.sort(key=lambda r: get_release_date(r) or datetime.max)
    
    # Add weekday
    for release in future_releases[:limit]:
        release_date = get_release_date(release)
        if release_date:
            release["weekday"] = release_date.strftime("%A")
            release["formatted_date"] = release_date.strftime("%b %d, %Y")
    
    return future_releases[:limit]


def get_dashboard_overview() -> Dict:
    """Get dashboard overview stats"""
    releases = fetch_releases_from_sheets()
    today_releases, today_count = get_today_releases()
    
    # Count by type
    singles = sum(1 for r in releases if r.get("type") == "single")
    albums = sum(1 for r in releases if r.get("type") == "album")
    videos = sum(1 for r in releases if r.get("type") == "video")
    
    # Count upcoming (next 30 days)
    today = datetime.now().date()
    future_cutoff = today + timedelta(days=30)
    upcoming = 0
    
    for release in releases:
        release_date = get_release_date(release)
        if release_date and today < release_date.date() <= future_cutoff:
            upcoming += 1
    
    return {
        "total_releases": len(releases),
        "today_releases": today_count,
        "singles": singles,
        "albums": albums,
        "videos": videos,
        "upcoming_releases": upcoming,
        "last_synced": datetime.now().isoformat(),
        "cache_error": _cache.get("error"),
    }


def clear_cache():
    """Clear the data cache"""
    _cache["data"] = None
    _cache["timestamp"] = 0
    _cache["error"] = None
    logger.info("Cache cleared")
