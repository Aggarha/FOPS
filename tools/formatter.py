"""
Formatter — Re-exports from youtube_formatter for convenience.

The existing youtube_formatter.py is the canonical formatter tool.
This module provides an alias so agents can import from tools.formatter.
"""

from tools.youtube_formatter import generate_video_metadata  # noqa: F401
