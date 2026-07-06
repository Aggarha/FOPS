"""
FOPS YouTube Extractor Service — Extract Channel/Playlist Videos.

Features:
  - Extract all videos from a YouTube channel
  - Extract all videos from a playlist (uses same logic as channel)
  - Metadata enrichment (title, views, duration, upload date)
  - Pagination support (up to 1000 videos)
  - Error handling for invalid URLs

Extracted from: tools/channel_scraper.py
No UI dependencies — pure service functions.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from tools.channel_scraper import get_channel_videos

logger = logging.getLogger(__name__)

# Configuration
MAX_VIDEOS_DEFAULT = 500
TIMEOUT_SECONDS = 60


class YouTubeExtractorService:
    """High-level service for extracting YouTube channel and playlist videos."""

    @staticmethod
    def extract_channel_videos(
        channel_url: str,
        max_results: int = MAX_VIDEOS_DEFAULT,
        metadata_enrichment: bool = True,
    ) -> Dict[str, Any]:
        """Extract all videos from a YouTube channel.

        Args:
            channel_url: YouTube channel URL (e.g., https://www.youtube.com/c/ChannelName).
            max_results: Max number of videos to extract (default: 500).
            metadata_enrichment: Whether to fetch views, duration, etc. (default: True).

        Returns:
            {
                "success": bool,
                "channel": {
                    "id": str,
                    "name": str,
                    "url": str,
                    "video_count": int,
                },
                "videos": [
                    {
                        "video_id": str,
                        "title": str,
                        "url": str,
                        "duration": int (seconds) or None,
                        "views": int or None,
                        "published_date": str (ISO format) or None,
                        "upload_date": str (YYYYMMDD) or None,
                    },
                    ...
                ],
                "total_collected": int,
                "metadata_enriched": bool,
                "elapsed_seconds": float,
            }
        """
        try:
            logger.info(f"YouTubeExtractorService.extract_channel_videos: {channel_url}")

            result = get_channel_videos(
                channel_url=channel_url,
                max_results=max_results,
                metadata_enrichment=metadata_enrichment,
            )

            if not result.get("success"):
                return {
                    "success": False,
                    "error": result.get("error", "Unknown error"),
                    "channel": {},
                    "videos": [],
                    "total_collected": 0,
                }

            return {
                "success": True,
                "channel": result.get("channel", {}),
                "videos": result.get("videos", []),
                "total_collected": len(result.get("videos", [])),
                "metadata_enriched": result.get("metadata_enriched", False),
                "elapsed_seconds": result.get("elapsed_seconds", 0),
            }

        except Exception as e:
            logger.error(f"YouTubeExtractorService.extract_channel_videos failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "channel": {},
                "videos": [],
                "total_collected": 0,
            }

    @staticmethod
    def extract_playlist_videos(
        playlist_url: str,
        max_results: int = MAX_VIDEOS_DEFAULT,
        metadata_enrichment: bool = True,
    ) -> Dict[str, Any]:
        """Extract all videos from a YouTube playlist.

        Note: This uses the same underlying extraction logic as channels,
        since yt-dlp handles both playlists and channels the same way.

        Args:
            playlist_url: YouTube playlist URL.
            max_results: Max videos to extract (default: 500).
            metadata_enrichment: Whether to fetch metadata (default: True).

        Returns:
            {
                "success": bool,
                "playlist": {
                    "id": str,
                    "title": str,
                    "url": str,
                    "video_count": int,
                },
                "videos": [
                    {
                        "video_id": str,
                        "title": str,
                        "url": str,
                        "duration": int or None,
                        "views": int or None,
                        "published_date": str or None,
                        "upload_date": str or None,
                    },
                    ...
                ],
                "total_collected": int,
                "metadata_enriched": bool,
                "elapsed_seconds": float,
            }
        """
        try:
            logger.info(f"YouTubeExtractorService.extract_playlist_videos: {playlist_url}")

            # Use same extraction logic as channels (yt-dlp handles both)
            result = get_channel_videos(
                channel_url=playlist_url,
                max_results=max_results,
                metadata_enrichment=metadata_enrichment,
            )

            if not result.get("success"):
                return {
                    "success": False,
                    "error": result.get("error", "Unknown error"),
                    "playlist": {},
                    "videos": [],
                    "total_collected": 0,
                }

            # Convert "channel" to "playlist" for consistency with API
            playlist_info = result.get("channel", {})
            playlist_info["playlist_id"] = playlist_info.get("id")

            return {
                "success": True,
                "playlist": playlist_info,
                "videos": result.get("videos", []),
                "total_collected": len(result.get("videos", [])),
                "metadata_enriched": result.get("metadata_enriched", False),
                "elapsed_seconds": result.get("elapsed_seconds", 0),
            }

        except Exception as e:
            logger.error(f"YouTubeExtractorService.extract_playlist_videos failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "playlist": {},
                "videos": [],
                "total_collected": 0,
            }

    @staticmethod
    def batch_extract(
        urls: List[Dict[str, Any]],
        metadata_enrichment: bool = True,
    ) -> Dict[str, Any]:
        """Extract videos from multiple channels/playlists.

        Args:
            urls: List of {url, type: "channel" or "playlist", max_results (optional)}.
            metadata_enrichment: Whether to fetch metadata for all.

        Returns:
            {
                "success": bool,
                "total": int,
                "completed": int,
                "failed": int,
                "results": [
                    {
                        "url": str,
                        "type": str,
                        "success": bool,
                        "channel_or_playlist": dict,
                        "videos": [
                            {video_id, title, url, ...},
                            ...
                        ],
                        "total_videos": int,
                    },
                    ...
                ],
            }
        """
        results = []
        completed = 0
        failed = 0

        for item in urls:
            url = item.get("url", "")
            url_type = item.get("type", "channel").lower()
            max_results = item.get("max_results", MAX_VIDEOS_DEFAULT)

            try:
                if url_type == "playlist":
                    result = YouTubeExtractorService.extract_playlist_videos(
                        playlist_url=url,
                        max_results=max_results,
                        metadata_enrichment=metadata_enrichment,
                    )
                    results.append({
                        "url": url,
                        "type": "playlist",
                        "success": result.get("success"),
                        "channel_or_playlist": result.get("playlist", {}),
                        "videos": result.get("videos", []),
                        "total_videos": result.get("total_collected", 0),
                    })
                else:  # channel
                    result = YouTubeExtractorService.extract_channel_videos(
                        channel_url=url,
                        max_results=max_results,
                        metadata_enrichment=metadata_enrichment,
                    )
                    results.append({
                        "url": url,
                        "type": "channel",
                        "success": result.get("success"),
                        "channel_or_playlist": result.get("channel", {}),
                        "videos": result.get("videos", []),
                        "total_videos": result.get("total_collected", 0),
                    })

                if results[-1]["success"]:
                    completed += 1
                else:
                    failed += 1

            except Exception as e:
                logger.error(f"batch_extract item {url} failed: {e}")
                results.append({
                    "url": url,
                    "type": url_type,
                    "success": False,
                    "error": str(e),
                    "videos": [],
                    "total_videos": 0,
                })
                failed += 1

        return {
            "success": failed == 0,
            "total": len(urls),
            "completed": completed,
            "failed": failed,
            "results": results,
        }

    @staticmethod
    def validate_url(url: str) -> Dict[str, Any]:
        """Validate a YouTube URL and determine its type.

        Args:
            url: YouTube URL to validate.

        Returns:
            {
                "success": bool,
                "url": str,
                "type": "channel" or "playlist" or "invalid",
                "channel_id": str or None,
                "playlist_id": str or None,
            }
        """
        try:
            url = url.strip() if url else ""

            if "youtube.com" not in url and "youtu.be" not in url:
                return {
                    "success": False,
                    "url": url,
                    "type": "invalid",
                    "message": "Not a valid YouTube URL",
                }

            # Simple heuristics
            if "list=" in url:
                # Playlist
                return {
                    "success": True,
                    "url": url,
                    "type": "playlist",
                    "playlist_id": None,  # Could extract if needed
                }
            elif "/c/" in url or "/user/" in url or "/@" in url:
                # Channel
                return {
                    "success": True,
                    "url": url,
                    "type": "channel",
                    "channel_id": None,
                }
            else:
                return {
                    "success": False,
                    "url": url,
                    "type": "unknown",
                    "message": "Could not determine if channel or playlist",
                }

        except Exception as e:
            logger.error(f"validate_url failed: {e}")
            return {
                "success": False,
                "url": url,
                "type": "error",
                "error": str(e),
            }
