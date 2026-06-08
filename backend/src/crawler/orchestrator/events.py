"""Event emitter for Orchestrator Board live view.

Lightweight Redis Streams producer used by graph nodes + agents to surface
"node started / completed / failed" pulses to the frontend canvas. Stream is
capped via MAXLEN ~ to avoid unbounded growth.

Read side: GET /api/orchestrator/events?since=<id>&limit=<n> tails the stream.

Failure-tolerant: if Redis is unreachable we log and swallow — never block
the pipeline because of telemetry.
"""

from __future__ import annotations

import json
import time
from typing import Any

from ..config import get_settings
from ..observability.logger import get_logger

_log = get_logger(__name__)

STREAM_KEY = "autocrawl:events"
MAX_LEN = 10000


async def _redis():
    settings = get_settings()
    from redis.asyncio import from_url

    return from_url(settings.redis_url, decode_responses=True)


async def emit_event(
    *,
    node: str,
    event: str,
    run_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Push one event to the stream. Best-effort, non-blocking on Redis errors."""
    fields = {
        "ts": str(time.time()),
        "node": node,
        "event": event,
        "run_id": run_id or "",
        "payload": json.dumps(payload or {}, default=str),
    }
    try:
        client = await _redis()
        try:
            await client.xadd(STREAM_KEY, fields, maxlen=MAX_LEN, approximate=True)  # type: ignore[arg-type]
        finally:
            await client.aclose()
    except Exception as e:  # noqa: BLE001
        _log.debug("events.emit_failed", node=node, evt=event, error=str(e))


async def tail_events(*, since: str = "0", limit: int = 100) -> list[dict[str, Any]]:
    """Fetch events with id > since, oldest first. Empty list on Redis error."""
    try:
        client = await _redis()
        try:
            raw = await client.xrange(STREAM_KEY, min=f"({since}", max="+", count=limit)
        finally:
            await client.aclose()
    except Exception as e:  # noqa: BLE001
        _log.debug("events.tail_failed", error=str(e))
        return []

    out: list[dict[str, Any]] = []
    for entry_id, fields in raw or []:
        try:
            payload_obj: dict[str, Any] = {}
            if fields.get("payload"):
                try:
                    payload_obj = json.loads(fields["payload"])
                except Exception:  # noqa: BLE001
                    payload_obj = {}
            out.append(
                {
                    "id": entry_id,
                    "ts": float(fields.get("ts") or 0),
                    "node": fields.get("node") or "",
                    "event": fields.get("event") or "",
                    "run_id": fields.get("run_id") or "",
                    "payload": payload_obj,
                }
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("events.parse_failed", error=str(e))
    return out


async def latest_event_id() -> str:
    """Return the highest stream id, or '0' if stream is empty."""
    try:
        client = await _redis()
        try:
            entries = await client.xrevrange(STREAM_KEY, count=1)
        finally:
            await client.aclose()
    except Exception:  # noqa: BLE001
        return "0"
    if not entries:
        return "0"
    return entries[0][0]
