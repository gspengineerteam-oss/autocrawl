"""Orchestrator package — event emitter + future workflow helpers."""

from .events import emit_event, latest_event_id, tail_events

__all__ = ["emit_event", "latest_event_id", "tail_events"]
