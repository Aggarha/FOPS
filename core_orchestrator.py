"""
FOPS — Core Orchestrator Wrapper.

Single entry point that unifies both orchestrator layers:
  - orchestrator.py        (YouTube tool pipeline → PipelineAgent)
  - agents/orchestrator.py (System agents → Orchestrator class)

All new code should call this module instead of the two sub-orchestrators directly.
"""

import logging

from typing import Optional

logger = logging.getLogger("core_orchestrator")


def run_main_pipeline(
    row_index: Optional[int] = None,
    song: str = "",
    artist: str = "",
    channel_filter: Optional[str] = None,
    filters: Optional[dict] = None,
) -> dict:
    """Run the YouTube tool pipeline (search → match → decide → suggest → actions).

    This wraps orchestrator.run_pipeline safely.
    """
    from orchestrator import run_pipeline
    logger.info("core_orchestrator.run_main_pipeline(song=%r, artist=%r)", song, artist)
    return run_pipeline(
        row_index=row_index,
        song=song,
        artist=artist,
        channel_filter=channel_filter,
        filters=filters,
    )


def run_main_pipeline_batch(max_rows: int = 10) -> dict:
    """Run the YouTube tool pipeline in batch mode."""
    from orchestrator import run_pipeline_batch
    logger.info("core_orchestrator.run_main_pipeline_batch(max_rows=%d)", max_rows)
    return run_pipeline_batch(max_rows=max_rows)
