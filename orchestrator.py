"""
FOPS Orchestrator — Top-level pipeline runner.

Wraps PipelineAgent to provide a clean entry point for the API.
Returns structured: {data, alerts, suggestions, actions}.

NEVER auto-executes actions. Only suggests.
"""

import logging
from typing import Optional

from agents.tools.pipeline_agent import PipelineAgent

logger = logging.getLogger("orchestrator")

# Singleton pipeline agent
_pipeline = PipelineAgent()


def run_pipeline(
    row_index: Optional[int] = None,
    song: str = "",
    artist: str = "",
    channel_filter: Optional[str] = None,
    filters: Optional[dict] = None,
) -> dict:
    """Run the full YouTube tool pipeline for a single release.

    Can target a specific Google Sheet row or explicit song/artist.

    Returns:
        {data, alerts, suggestions, actions, audio_matching, decisions}
    """
    logger.info("orchestrator.run_pipeline(row=%s, song=%r, artist=%r)", row_index, song, artist)

    result = _pipeline.run(
        row_index=row_index,
        song=song,
        artist=artist,
        channel_filter=channel_filter,
        filters=filters,
    )

    # Normalize into the expected shape
    validation_alerts = result.get("validation", {}).get("missing_required", [])
    smart_alerts = result.get("alerts", [])
    return {
        "data": result.get("data", {}),
        "alerts": smart_alerts,
        "validation_alerts": validation_alerts,
        "suggestions": result.get("suggestions", []),
        "actions": result.get("actions", []),
        "youtube": result.get("youtube", {}),
        "audio_matching": result.get("audio_matching", {}),
        "decisions": result.get("decisions", {}),
        "auto_suggestion": result.get("auto_suggestion", {}),
        "content_id": result.get("content_id"),
        "note": result.get("note", "No actions auto-executed."),
    }


def run_pipeline_batch(max_rows: int = 10) -> dict:
    """Run the pipeline in batch mode across multiple sheet rows.

    Returns:
        {data, alerts, suggestions, actions}
    """
    logger.info("orchestrator.run_pipeline_batch(max_rows=%d)", max_rows)
    return _pipeline.run_batch(max_rows=max_rows)
