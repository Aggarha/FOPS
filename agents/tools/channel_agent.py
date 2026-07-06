"""
CHANNEL_AGENT — Manages YouTube channel descriptions and subscribe templates.

Stores and retrieves per-channel description/subscribe blocks.
"""

import logging
import json
import os

from agents.tools.video_config import (
    DEFAULT_CHANNELS,
    DEFAULT_CHANNEL_DESCRIPTIONS,
    DEFAULT_SUBSCRIBE_TEXT,
)

logger = logging.getLogger("agents.tools.channel")

CHANNELS_FILE = os.getenv("FOPS_CHANNELS_FILE", "/var/www/fops/channel_descriptions.json")


class ChannelAgent:
    name = "CHANNEL_AGENT"

    def __init__(self):
        self._descriptions: dict[str, str] = dict(DEFAULT_CHANNEL_DESCRIPTIONS)
        self._channels: list[str] = list(DEFAULT_CHANNELS)
        self._load()

    # ---- persistence -----------------------------------------------------

    def _load(self):
        """Load saved channel descriptions from disk."""
        if os.path.exists(CHANNELS_FILE):
            try:
                with open(CHANNELS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._channels = data.get("channels", self._channels)
                self._descriptions.update(data.get("descriptions", {}))
                logger.info("[%s] Loaded %d channels from disk", self.name, len(self._channels))
            except Exception:
                logger.exception("[%s] Failed to load channels file", self.name)

    def _save(self):
        """Persist channel descriptions to disk."""
        data = {"channels": self._channels, "descriptions": self._descriptions}
        with open(CHANNELS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info("[%s] Saved %d channels to disk", self.name, len(self._channels))

    # ---- public interface ------------------------------------------------

    def list_channels(self) -> list[str]:
        return list(self._channels)

    def get_subscribe_text(self, channel: str) -> str:
        """Get the subscribe/description text for a channel."""
        desc = self._descriptions.get(channel, "").strip()
        return desc if desc else DEFAULT_SUBSCRIBE_TEXT

    def set_description(self, channel: str, description: str) -> dict:
        """Update channel description and persist."""
        if channel not in self._channels:
            self._channels.append(channel)
        self._descriptions[channel] = description
        self._save()
        logger.info("[%s] Updated description for: %s", self.name, channel)
        return {"channel": channel, "status": "saved"}

    def add_channel(self, channel: str) -> dict:
        """Add a new channel."""
        if channel in self._channels:
            return {"error": "Channel already exists"}
        self._channels.append(channel)
        self._descriptions[channel] = ""
        self._save()
        logger.info("[%s] Added channel: %s", self.name, channel)
        return {"channel": channel, "status": "added"}

    def remove_channel(self, channel: str) -> dict:
        """Remove a channel."""
        if channel not in self._channels:
            return {"error": "Channel not found"}
        self._channels.remove(channel)
        self._descriptions.pop(channel, None)
        self._save()
        logger.info("[%s] Removed channel: %s", self.name, channel)
        return {"channel": channel, "status": "removed"}

    def run(self) -> dict:
        return {
            "channels": self.list_channels(),
            "total": len(self._channels),
            "with_descriptions": sum(1 for d in self._descriptions.values() if d.strip()),
        }
