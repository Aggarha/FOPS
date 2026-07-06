"""
FOPS Video Formatter Service — FastAPI-ready wrapper.

Integrates Rotana Video Formatter logic:
  - Title generation (3 video types: Lyrics/Music/Concert)
  - Description assembly (credits, lyrics, social links)
  - Tag generation (artist, song, album, credits)
  - ISRC/UPC passthrough
  - Multi-channel support (16+ YouTube channels)

Extracted from: tools/youtube_formatter.py
No UI dependencies — pure service functions.
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime

from tools.youtube_formatter import generate_video_metadata

logger = logging.getLogger(__name__)


class VideoFormatterService:
    """High-level video metadata formatter for FOPS."""

    # Supported video types
    VIDEO_TYPES = ["Lyrics Video", "Music Video", "Concert"]

    # Default channel descriptions (can be extended)
    DEFAULT_CHANNELS = {
        "عبدالمجيد عبدالله | Abdul Majeed Abdullah": (
            "\nاشترك الآن في قناة الفنان عبدالمجيد عبدالله للحصول على أجدد إصداراته الفنية\n"
            "http://goo.gl/ZMxIXH\n"
        ),
    }

    @staticmethod
    def format_video(
        row_data: Dict[str, Any],
        video_type: str,
        channel: str,
        lyrics: Optional[str] = None,
        channel_descriptions: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Format a video release into YouTube metadata.

        Args:
            row_data: Release data (Excel columns or standard field names).
                Expected keys (any of):
                  - Artist Name English / artist_en
                  - Artist Name Arabic / artist_ar
                  - Song Name English / song_en
                  - Song Name Arabic / song_ar
                  - Album Name English / album_en
                  - Album Name Arabic / album_ar
                  - Song Writer - English Name / songwriter_en
                  - Song Writer - Arabic Name / songwriter_ar
                  - Composer - English Name / composer_en
                  - Composer - Arabic Name / composer_ar
                  - Arrange - English Name / arranger_en
                  - Arrange Arabic Name / arranger_ar
                  - ISRC / isrc
                  - UPC / upc

            video_type: One of "Lyrics Video", "Music Video", "Concert".
            channel: YouTube channel name.
            lyrics: Optional lyrics text to embed in description.
            channel_descriptions: Optional channel → text overrides.

        Returns:
            {
                "success": bool,
                "video_type": str,
                "channel": str,
                "title": str,
                "description": str,
                "tags": str,
                "isrc": str,
                "upc": str,
            }
        """
        try:
            if video_type not in VideoFormatterService.VIDEO_TYPES:
                return {
                    "success": False,
                    "error": f"Invalid video_type. Allowed: {VideoFormatterService.VIDEO_TYPES}",
                }

            # Merge with defaults
            merged_channels = {
                **VideoFormatterService.DEFAULT_CHANNELS,
                **(channel_descriptions or {}),
            }

            # Call the underlying formatter
            result = generate_video_metadata(
                row_data=row_data,
                video_type=video_type,
                channel=channel,
                lyrics=lyrics,
                channel_descriptions=merged_channels,
            )

            # Wrap response
            return {
                "success": result.get("success", True),
                "video_type": video_type,
                "channel": channel,
                "title": result.get("title", ""),
                "description": result.get("description", ""),
                "tags": result.get("tags", ""),
                "isrc": result.get("isrc", ""),
                "upc": result.get("upc", ""),
            }

        except Exception as e:
            logger.error(f"video_formatter_service.format_video failed: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    @staticmethod
    def format_batch(
        releases: list,
        video_type: str,
        channel: str,
        channel_descriptions: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Format multiple releases in batch.

        Args:
            releases: List of release dicts (each has required fields + optional 'lyrics').
            video_type: Video type for all releases.
            channel: YouTube channel for all releases.
            channel_descriptions: Optional channel overrides.

        Returns:
            {
                "success": bool,
                "total": int,
                "processed": int,
                "failed": int,
                "results": [
                    {
                        "release_id": str,
                        "success": bool,
                        "title": str,
                        "description": str,
                        "tags": str,
                        ...
                    },
                    ...
                ],
            }
        """
        results = []
        success_count = 0
        failed_count = 0

        for release in releases:
            release_id = release.get("id", release.get("_id", "unknown"))
            lyrics = release.pop("lyrics", None)

            result = VideoFormatterService.format_video(
                row_data=release,
                video_type=video_type,
                channel=channel,
                lyrics=lyrics,
                channel_descriptions=channel_descriptions,
            )

            result["release_id"] = release_id
            results.append(result)

            if result.get("success"):
                success_count += 1
            else:
                failed_count += 1

        return {
            "success": failed_count == 0,
            "total": len(releases),
            "processed": success_count,
            "failed": failed_count,
            "results": results,
        }

    @staticmethod
    def get_supported_types() -> Dict[str, str]:
        """Get list of supported video types."""
        return {
            "Lyrics Video": "For lyric videos with optional lyrics display",
            "Music Video": "For official music videos",
            "Concert": "For concert/live recordings",
        }

    @staticmethod
    def add_channel_description(
        channel_name: str,
        description: str,
    ) -> Dict[str, Any]:
        """Add or update a channel description (for future persistence).

        Args:
            channel_name: YouTube channel name.
            description: Channel subscribe/description text.

        Returns:
            {"success": bool, "channel": str}
        """
        try:
            VideoFormatterService.DEFAULT_CHANNELS[channel_name] = description
            logger.info(f"Added channel description for '{channel_name}'")
            return {"success": True, "channel": channel_name}
        except Exception as e:
            logger.error(f"Failed to add channel description: {e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def list_channels() -> Dict[str, Any]:
        """Get all configured channels.

        Returns:
            {"success": bool, "channels": {channel_name: description, ...}}
        """
        return {
            "success": True,
            "channels": VideoFormatterService.DEFAULT_CHANNELS,
        }
