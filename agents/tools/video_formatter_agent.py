"""
VIDEO_FORMATTER_AGENT — Master coordinator for the video formatting pipeline.

Orchestrates all 9 sub-agents to generate complete YouTube-ready output:
  title, description, tags, ISRC, UPC — all from a single release dict.
"""

import logging
from datetime import datetime

from agents.tools.title_agent import TitleAgent
from agents.tools.description_agent import DescriptionAgent
from agents.tools.tags_agent import TagsAgent
from agents.tools.credits_agent import CreditsAgent
from agents.tools.channel_agent import ChannelAgent
from agents.tools.lyrics_agent import LyricsAgent
from agents.tools.hashtag_agent import HashtagAgent
from agents.tools.album_agent import AlbumAgent
from agents.tools.metadata_parser_agent import MetadataParserAgent

logger = logging.getLogger("agents.tools.video_formatter")


class VideoFormatterAgent:
    """Master agent that coordinates all video formatting sub-agents."""

    name = "VIDEO_FORMATTER_AGENT"

    def __init__(self):
        self.title = TitleAgent()
        self.description = DescriptionAgent()
        self.tags = TagsAgent()
        self.credits = CreditsAgent()
        self.channel = ChannelAgent()
        self.lyrics = LyricsAgent()
        self.hashtag = HashtagAgent()
        self.album = AlbumAgent()
        self.parser = MetadataParserAgent()

        self._sub_agents = {
            "title": self.title,
            "description": self.description,
            "tags": self.tags,
            "credits": self.credits,
            "channel": self.channel,
            "lyrics": self.lyrics,
            "hashtag": self.hashtag,
            "album": self.album,
            "metadata_parser": self.parser,
        }

    def format_release(
        self,
        release: dict,
        video_type: str = "Music Video",
        channel: str = "Rotana Music",
        lyrics: str | None = None,
        year: int | None = None,
    ) -> dict:
        """Full pipeline: generate all YouTube fields for a release.

        Args:
            release: Normalized release dict with artist_en, song_en, etc.
            video_type: "Music Video", "Lyrics Video", or "Concert"
            channel: YouTube channel name for subscribe text
            lyrics: Optional lyrics text to embed
            year: Override year (defaults to current)

        Returns:
            Complete output dict with title, description, tags, isrc, upc.
        """
        started = datetime.utcnow()
        logger.info("[%s] Formatting: %s — %s (%s, %s)",
                    self.name,
                    release.get("artist_en", "?"),
                    release.get("song_en", "?"),
                    video_type, channel)

        # 1. Title
        title = self.title.generate(release, video_type, year)

        # 2. Hashtags
        hashtags = self.hashtag.generate(release, year)

        # 3. Album lines
        album_lines = self.album.generate(release, video_type)

        # 4. Credits
        credits_text = self.credits.generate(release)

        # 5. Channel subscribe text
        subscribe_text = self.channel.get_subscribe_text(channel)

        # 6. Lyrics
        formatted_lyrics = self.lyrics.format(lyrics) if lyrics else None

        # 7. Full description
        description = self.description.generate(
            title=title,
            hashtags=hashtags,
            album_lines=album_lines,
            credits=credits_text,
            subscribe_text=subscribe_text,
            lyrics=formatted_lyrics,
        )

        # 8. Tags
        tags = self.tags.generate(release)

        # 9. Extract ISRC / UPC
        isrc = release.get("isrc", "")
        isrc = isrc if isrc and isrc.lower() != "nan" else ""
        upc = release.get("upc", "")
        upc = upc if upc and upc.lower() != "nan" else ""

        elapsed = (datetime.utcnow() - started).total_seconds()

        result = {
            "title": title,
            "description": description,
            "tags": tags,
            "tags_list": self.tags.generate_list(release),
            "isrc": isrc,
            "upc": upc,
            "video_type": video_type,
            "channel": channel,
            "has_lyrics": bool(formatted_lyrics),
            "elapsed_seconds": round(elapsed, 3),
        }

        logger.info("[%s] Formatting complete in %.3fs", self.name, elapsed)
        return result

    def format_from_sheet(
        self,
        sheet_row: dict,
        video_type: str = "Music Video",
        channel: str = "Rotana Music",
        lyrics: str | None = None,
    ) -> dict:
        """Format directly from a Google Sheet row (FOPS from-sheet format).

        Maps sheet fields to the standard release dict format.
        """
        release = {
            "artist_en": sheet_row.get("artist", ""),
            "artist_ar": "",
            "song_en": sheet_row.get("song", ""),
            "song_ar": "",
            "album_en": "",
            "album_ar": "",
            "songwriter_en": "",
            "songwriter_ar": "",
            "composer_en": "",
            "composer_ar": "",
            "arranger_en": "",
            "arranger_ar": "",
            "isrc": "",
            "upc": sheet_row.get("upc", ""),
        }
        return self.format_release(release, video_type, channel, lyrics)

    def status(self) -> dict:
        return {
            "agent": self.name,
            "sub_agents": [
                {"name": a.name, "key": k}
                for k, a in self._sub_agents.items()
            ],
            "total_sub_agents": len(self._sub_agents),
            "channels_loaded": len(self.channel.list_channels()),
        }

    def run(self, release: dict | None = None, **kwargs) -> dict:
        if release:
            return self.format_release(release, **kwargs)
        return self.status()
