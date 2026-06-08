"""structlog-based JSON logging.

All logs are emitted as one JSON object per line, written to:
  - stdout (so docker logs / journalctl pick them up)
  - logs/YYYY-MM-DD/run.jsonl   (rotated by date, append-only)
  - logs/YYYY-MM-DD/errors.jsonl (only events with level >= ERROR)

Mandatory fields on every event: run_id, agent, node, tool, status, duration_ms,
vendor_domain — but only set when applicable; structlog handles missing keys.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from ..config import get_settings

_CONFIGURED = False


def _add_iso_timestamp(_logger: Any, _name: str, event_dict: dict) -> dict:
    event_dict["ts"] = datetime.now(timezone.utc).isoformat()
    return event_dict


class _DayRollingFileHandler(logging.Handler):
    """Append JSON lines to logs/YYYY-MM-DD/{name}.jsonl, rolling at UTC midnight."""

    def __init__(self, log_dir: Path, basename: str, level: int = logging.NOTSET) -> None:
        super().__init__(level=level)
        self._log_dir = log_dir
        self._basename = basename
        self._current_date: str | None = None
        self._fh = None

    def _ensure_open(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._current_date or self._fh is None:
            if self._fh is not None:
                try:
                    self._fh.close()
                except Exception:  # noqa: BLE001
                    pass
            day_dir = self._log_dir / today
            day_dir.mkdir(parents=True, exist_ok=True)
            self._fh = open(day_dir / f"{self._basename}.jsonl", "a", encoding="utf-8")
            self._current_date = today

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._ensure_open()
            assert self._fh is not None
            self._fh.write(self.format(record) + "\n")
            self._fh.flush()
        except Exception:  # noqa: BLE001
            self.handleError(record)


def configure_logging() -> None:
    """Idempotent setup. Call once at app start (CLI entrypoint, scheduler boot)."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    settings = get_settings()
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        _add_iso_timestamp,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        timestamper,
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    json_formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(),
        foreign_pre_chain=shared_processors,
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    stdout_h = logging.StreamHandler(sys.stdout)
    stdout_h.setFormatter(json_formatter)
    stdout_h.setLevel(level)
    root.addHandler(stdout_h)

    run_h = _DayRollingFileHandler(settings.log_dir, "run", level=level)
    run_h.setFormatter(json_formatter)
    root.addHandler(run_h)

    err_h = _DayRollingFileHandler(settings.log_dir, "errors", level=logging.ERROR)
    err_h.setFormatter(json_formatter)
    root.addHandler(err_h)

    _CONFIGURED = True


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    if not _CONFIGURED:
        configure_logging()
    return structlog.get_logger(name) if name else structlog.get_logger()
