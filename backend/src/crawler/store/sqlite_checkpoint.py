"""LangGraph checkpoint saver.

We use `MemorySaver` per run because:
  - Persistent state (vendors, expos, manifest) is already in atomic JSON files.
  - The graph is short-lived per run (minutes, not days), so SQLite checkpoint
    only matters for crash-resume mid-run — a nice-to-have we can skip.
  - The async SQLite saver in newer langgraph-checkpoint-sqlite is a context
    manager that needs `async with`, which complicates `compile()` plumbing.
"""

from __future__ import annotations

from pathlib import Path

from ..config import get_settings
from ..observability.logger import get_logger

_log = get_logger(__name__)


def get_checkpoint_path() -> Path:
    settings = get_settings()
    p = settings.data_dir / "checkpoints" / "langgraph.sqlite"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def get_saver():
    """Return an in-memory checkpoint saver (sync API)."""
    from langgraph.checkpoint.memory import MemorySaver  # type: ignore

    return MemorySaver()


def get_async_saver():
    """Same as get_saver — MemorySaver is async-compatible."""
    return get_saver()
