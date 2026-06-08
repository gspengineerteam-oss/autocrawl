"""Publish browser_use.Agent reasoning logs to a Redis stream.

The agentic_crawler runs in separate containers (agentic-a / agentic-b);
its `browser_use.Agent` log records never reach the FastAPI backend
process directly. To surface those reasoning steps in the operator
console (frontend Live Monitor → Agent Trace panel), we ship a sync
logging.Handler that pushes each Eval / Memory / Goal / Judge / Action
line into a shared Redis stream `autocrawl:agent_traces`.

The backend tails the same stream (see
`backend/src/crawler/tools/agent_trace_buffer.py`) and serves recent
entries to the frontend.

The handler uses a small in-process queue + background thread so
`emit()` never blocks the agent loop on a Redis hiccup.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import re
import threading
from datetime import datetime, timezone
from typing import Any

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
STREAM_KEY = "autocrawl:agent_traces"
MAX_LEN = 2000

_q: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=4000)
_flusher_started = False
_flusher_lock = threading.Lock()


def _strip_ansi(s: str) -> str:
    return ANSI_RE.sub("", s)


def _classify(msg: str) -> str:
    if "Judge Verdict" in msg or "judge thinks" in msg:
        return "judge"
    if "Eval:" in msg:
        return "eval"
    if "Memory:" in msg:
        return "memory"
    if "Next goal:" in msg:
        return "goal"
    if "Final Result" in msg:
        return "result"
    if re.search(r"📍 Step (\d+)", msg):
        return "step_header"
    if "▶️" in msg:
        return "action"
    return "other"


def _verdict(msg: str) -> str | None:
    if "Verdict: Success" in msg or "Eval: ✅" in msg or "👍" in msg:
        return "success"
    if "Verdict: Failure" in msg or "FAIL" in msg or "❌" in msg or "👎" in msg:
        return "fail"
    return None


def _agent_id(logger_name: str) -> str:
    tail = logger_name.replace("browser_use.Agent", "").strip()
    parts = [p for p in re.split(r"\s+", tail) if p]
    return parts[-1][:8] if parts else "?"


def _flusher_loop() -> None:
    """Background thread: drain the queue, XADD into Redis stream.
    Reconnects on Redis errors with backoff. Never logs into the same
    handler chain to avoid recursion."""
    import time
    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    backoff = 1.0
    while True:
        client = None
        try:
            import redis  # type: ignore[import-not-found]
            client = redis.from_url(redis_url, decode_responses=True)
            backoff = 1.0
            while True:
                try:
                    entry = _q.get(timeout=2.0)
                except queue.Empty:
                    continue
                try:
                    client.xadd(STREAM_KEY, entry, maxlen=MAX_LEN, approximate=True)
                except Exception:  # noqa: BLE001
                    # Re-queue once and reconnect — drop on second failure
                    try:
                        _q.put_nowait(entry)
                    except queue.Full:
                        pass
                    raise
        except Exception:  # noqa: BLE001
            try:
                if client is not None:
                    client.close()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(min(30.0, backoff))
            backoff = min(30.0, backoff * 1.6)


class RedisAgentTraceHandler(logging.Handler):
    """Capture browser_use.Agent log records, classify, push to queue."""

    def __init__(self, container: str | None = None) -> None:
        super().__init__(level=logging.INFO)
        self.container = container or os.environ.get("HOSTNAME") or "?"

    def emit(self, record: logging.LogRecord) -> None:  # noqa: D401
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001
            return
        if not msg:
            return
        name = record.name or ""
        if not name.startswith("browser_use.Agent"):
            return
        clean = _strip_ansi(msg).strip()
        kind = _classify(clean)
        if kind == "other":
            return
        entry: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "kind": kind,
            "verdict": _verdict(clean) or "",
            "agent": _agent_id(name),
            "container": self.container,
            "text": clean[:1200],
        }
        try:
            _q.put_nowait(entry)
        except queue.Full:
            # Drop oldest then enqueue current to keep up under burst.
            try:
                _q.get_nowait()
            except queue.Empty:
                pass
            try:
                _q.put_nowait(entry)
            except queue.Full:
                pass


def publish_trace(
    *,
    kind: str,
    text: str,
    agent: str = "grounding",
    verdict: str | None = None,
    container: str | None = None,
) -> None:
    """Push a custom trace event into the same Redis stream that powers
    Live Monitor's "Trace Hidup" panel. Use for non-Browser-Use signals
    like Gemini grounded resolves, Jina fast-path hits, grounded persists,
    so operators can SEE them in the UI without grep-ing docker logs.

    kind: short tag — 'grounding', 'jina_hit', 'grounded_extract', 'resolve_hit'
    verdict: 'success' | 'fail' | None
    text: human-readable one-liner (will be truncated to 1200 chars)
    """
    entry: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "kind": kind,
        "verdict": verdict or "",
        "agent": agent[:16],
        "container": (container or os.environ.get("HOSTNAME") or "?")[:32],
        "text": (text or "")[:1200],
    }
    try:
        _q.put_nowait(entry)
    except queue.Full:
        try:
            _q.get_nowait()
        except queue.Empty:
            pass
        try:
            _q.put_nowait(entry)
        except queue.Full:
            pass


def install() -> None:
    """Idempotent install of the Redis publisher on the root logger."""
    global _flusher_started
    root = logging.getLogger()
    for h in list(root.handlers):
        if isinstance(h, RedisAgentTraceHandler):
            return
    root.addHandler(RedisAgentTraceHandler())
    with _flusher_lock:
        if _flusher_started:
            return
        t = threading.Thread(target=_flusher_loop, daemon=True, name="agent-trace-flusher")
        t.start()
        _flusher_started = True
