"""
YouTube Search Engine with Metadata Enrichment.

Enhanced YouTube search using multiple query variants and metadata collection.

Features:
  - Multi-variant search (10-20 queries per request)
  - Result deduplication by video_id
  - Metadata extraction (views, duration, channel, date)
  - Expanded result coverage (100+ candidates)
"""

import logging
from typing import Optional

import yt_dlp

logger = logging.getLogger("tools.youtube_search_engine")

# YouTube search parameters
MAX_RESULTS_PER_VARIANT = 30  # per variant search
MAX_TOTAL_RESULTS = 150       # total deduplicated results


def search_with_variants(song: str, artist: str, variants: list[str]) -> list[dict]:
    """Search YouTube using multiple query variants and merge results.

    Args:
        song: Song title
        artist: Artist name
        variants: List of search query variants

    Returns:
        List of deduplicated results with metadata:
        [{
            'video_id': str,
            'title': str,
            'url': str,
            'channel': str,
            'views': int | None,
            'duration': int | None,
            'published_date': str | None,
            'score': int (from yt-dlp)
        }, ...]
    """
    results_by_id = {}  # deduplicate by video_id

    logger.info(f"youtube_search: starting multi-variant search for '{artist} - {song}' ({len(variants)} variants)")

    from services.ytdlp_service import get_hardened_opts
    ydl_opts = get_hardened_opts({
        "skip_download": True,
        "extract_flat": True,
        "noplaylist": True,
        "socket_timeout": 15,
    })

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for i, variant in enumerate(variants, 1):
            try:
                logger.debug(f"youtube_search: variant {i}/{len(variants)}: '{variant}'")
                
                # Use ytsearch prefix to specify max results
                search_query = f"ytsearch{MAX_RESULTS_PER_VARIANT}:{variant}"
                search_results = ydl.extract_info(search_query, download=False)

                if not search_results or 'entries' not in search_results:
                    logger.debug(f"youtube_search: variant {i} returned no entries")
                    continue

                entries = search_results['entries']
                logger.debug(f"youtube_search: variant {i} returned {len(entries)} results")

                for entry in entries:
                    if not entry or not entry.get('id'):
                        continue

                    video_id = entry['id']

                    # Skip if already collected
                    if video_id in results_by_id:
                        continue

                    # Extract metadata
                    result = {
                        'video_id': video_id,
                        'title': entry.get('title', ''),
                        'url': f"https://www.youtube.com/watch?v={video_id}",
                        'channel': entry.get('uploader', '') or entry.get('channel_id', ''),
                        'views': entry.get('view_count'),
                        'duration': entry.get('duration'),
                        'published_date': entry.get('upload_date'),  # YYYYMMDD format
                        'score': entry.get('score', 0),  # yt-dlp relevance score
                    }

                    results_by_id[video_id] = result

                    if len(results_by_id) >= MAX_TOTAL_RESULTS:
                        break

            except Exception as e:
                logger.debug(f"youtube_search: variant '{variant}' failed: {e}")
                continue

            if len(results_by_id) >= MAX_TOTAL_RESULTS:
                break

    results = list(results_by_id.values())
    logger.info(f"youtube_search: collected {len(results)} deduplicated results from {len(variants)} variants")

    return results
