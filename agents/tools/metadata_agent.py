"""
MetadataAgent — Wraps the YouTube metadata formatter tool.
"""

import logging

from tools.youtube_formatter import generate_video_metadata

logger = logging.getLogger("agents.tools.metadata_agent")


class MetadataAgent:
    name = "METADATA"

    def run(self, row_data: dict, video_type: str = "Music Video",
            channel: str = "Rotana Music", lyrics: str | None = None) -> dict:
        """Generate YouTube metadata from release data.

        Args:
            row_data: Release data (Excel column names or standard field names).
            video_type: Type of video (Music Video, Lyrics Video, Concert).
            channel: Channel name.
            lyrics: Optional lyrics text.

        Returns:
            dict with title, description, tags, isrc, upc.
        """
        logger.info("[%s] Generating metadata for row_data with %d fields", self.name, len(row_data))

        try:
            result = generate_video_metadata(
                row_data=row_data,
                video_type=video_type,
                channel=channel,
                lyrics=lyrics,
            )
            return {
                "agent": self.name,
                "success": True,
                **result,
            }
        except Exception as exc:
            logger.exception("[%s] Metadata generation failed", self.name)
            return {
                "agent": self.name,
                "success": False,
                "error": str(exc),
            }
