"""Backend-side consumer of the `autocrawl:agent_traces` Redis stream.

The agentic_crawler containers publish browser_use.Agent reasoning
records into the stream (see
`backend/src/agentic_crawler/agent_trace_publisher.py`). This module
runs an asyncio background task that XREADs new entries and mirrors
them into a process-local ring buffer. The orchestrator API route
serves recent entries from that buffer to the frontend.
"""

from __future__ import annotations

import asyncio
import json
from collections import deque
from threading import Lock
from typing import Any

from ..observability.logger import get_logger

_log = get_logger(__name__)

STREAM_KEY = "autocrawl:agent_traces"

_BUFFER: "deque[dict[str, Any]]" = deque(maxlen=600)
_LOCK = Lock()
_TASK: asyncio.Task[None] | None = None


def _push(fields: dict[str, str]) -> None:
    item: dict[str, Any] = {
        "ts": fields.get("ts") or "",
        "kind": fields.get("kind") or "other",
        "verdict": (fields.get("verdict") or None) or None,
        "agent": fields.get("agent") or "?",
        "container": fields.get("container") or "?",
        "text": fields.get("text") or "",
    }
    # Treat empty-string verdict as null to match frontend type.
    if item["verdict"] == "":
        item["verdict"] = None
    with _LOCK:
        _BUFFER.append(item)


async def _consumer_loop() -> None:
    """Tail the Redis stream forever, with reconnect-on-error.

    First connection prefetches the last ~80 entries via XREVRANGE so
    operator gets immediate history when they open the panel. After
    that, switches to blocking XREAD for new entries only."""
    from redis.asyncio import from_url
    from ..config import get_settings

    settings = get_settings()
    last_id: str = "0-0"
    primed = False

    while True:
        client = None
        try:
            client = from_url(settings.redis_url, decode_responses=True)
            if not primed:
                # Prefetch recent history once at boot.
                try:
                    raw = await client.xrevrange(STREAM_KEY, count=80)
                except Exception:  # noqa: BLE001
                    raw = []
                for entry_id, fields in reversed(raw or []):
                    _push(fields)
                    last_id = entry_id
                primed = True
                if last_id == "0-0":
                    last_id = "$"  # only future entries

            while True:
                res = await client.xread({STREAM_KEY: last_id}, count=20, block=2000)
                if not res:
                    continue
                for _stream, entries in res:
                    for entry_id, fields in entries:
                        _push(fields)
                        last_id = entry_id
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            _log.debug("agent_trace.stream_reconnect", error=str(e))
            await asyncio.sleep(2)
        finally:
            if client is not None:
                try:
                    await client.aclose()
                except Exception:  # noqa: BLE001
                    pass


def install() -> None:
    """Spawn the background consumer task. Idempotent — safe to call
    multiple times during lifespan setup."""
    global _TASK
    if _TASK is not None and not _TASK.done():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop yet — caller must invoke after lifespan starts.
        _log.warning("agent_trace.install_no_loop")
        return
    _TASK = loop.create_task(_consumer_loop(), name="agent-trace-consumer")


def shutdown() -> None:
    """Best-effort cleanup at lifespan teardown."""
    global _TASK
    if _TASK is None:
        return
    _TASK.cancel()
    _TASK = None


def recent(limit: int = 100) -> list[dict[str, Any]]:
    """Return up to `limit` most recent entries (newest last). Caller
    can poll via /orchestrator/agent-traces every couple of seconds."""
    with _LOCK:
        if limit <= 0 or limit >= len(_BUFFER):
            return list(_BUFFER)
        return list(_BUFFER)[-limit:]
