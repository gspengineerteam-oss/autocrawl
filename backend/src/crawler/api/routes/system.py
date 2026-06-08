"""System health endpoints — beyond `/api/health`'s reachability checks.

These routes surface live operational state the operator wants on glance:
- LLM concurrency queue depth per tier (Redis-backed counter)
- Ollama loaded-model VRAM footprint (proxy to remote `/api/ps`)
- Agentic Browser-Use session locks (per-hostname active run state)

Per the user's "no synthesized prose" rule, all data here is real — what
Redis/Ollama returns, parsed and forwarded. No mock fallbacks; gracefully
degraded responses on backend failures, callers handle null values.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import APIRouter, Query

from ...config import get_settings
from ...observability.logger import get_logger
from ...store.redis_queue import get_redis

router = APIRouter(prefix="/system", tags=["system"])
_log = get_logger(__name__)

_TIERS: tuple[str, ...] = ("vision", "heavy", "light", "tiny")


@router.get("/llm-queue")
async def llm_queue() -> dict[str, Any]:
    """Inflight slot counts vs cap per LLM tier.

    Reads `llm:concurrency:{tier}` counter keys that `tools/llm/queue.py`
    increments per acquire. Caps come from settings (`LLM_QUEUE_*_CONCURRENCY`
    env vars). When `LLM_QUEUE_ENABLED=false` the inflight counters still
    exist but the queue is bypassed — `enabled` flag tells the UI to
    de-emphasize the values.
    """
    s = get_settings()
    caps = {
        "vision": s.llm_queue_vision_concurrency,
        "heavy": s.llm_queue_heavy_concurrency,
        "light": s.llm_queue_light_concurrency,
        "tiny": s.llm_queue_tiny_concurrency,
    }
    tiers: dict[str, dict[str, int]] = {
        tier: {"cap": cap, "inflight": 0} for tier, cap in caps.items()
    }
    out: dict[str, Any] = {
        "enabled": s.llm_queue_enabled,
        "acquire_timeout_s": s.llm_queue_acquire_timeout_s,
        "tiers": tiers,
    }

    try:
        client = await get_redis()
        if client is None:
            out["source"] = "no_redis"
            return out
        for tier in _TIERS:
            try:
                val = await client.get(f"llm:concurrency:{tier}")
                if val is None:
                    continue
                tiers[tier]["inflight"] = max(0, int(val))
            except Exception as exc:  # noqa: BLE001
                _log.debug("system.llm_queue.tier_read_failed", tier=tier, error=str(exc)[:120])
        out["source"] = "redis"
    except Exception as exc:  # noqa: BLE001
        out["source"] = "error"
        out["error"] = str(exc)[:200]

    return out


@router.get("/ollama-ps")
async def ollama_ps() -> dict[str, Any]:
    """Proxy Ollama's `/api/ps` to expose loaded model VRAM footprint.

    Returns `{models: [{name, size_vram, size, expires_at, ...}]}` per Ollama
    schema. When provider is not Ollama or the daemon is unreachable, returns
    an empty `models` list with `status` set accordingly.

    NOTE: Ollama's `size_vram` field is bytes. Frontend divides by 1024**3 for GB.
    """
    s = get_settings()
    if s.llm_provider != "ollama":
        return {
            "status": "unavailable",
            "provider": s.llm_provider,
            "models": [],
            "host": None,
        }

    base = s.llm_base_url or "http://host.docker.internal:11434"
    url = f"{base.rstrip('/')}/api/ps"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return {
                    "status": "error",
                    "code": resp.status_code,
                    "models": [],
                    "host": base,
                }
            data = resp.json()
            models = data.get("models", [])
            total_vram = sum(int(m.get("size_vram", 0) or 0) for m in models)
            return {
                "status": "ok",
                "host": base,
                "models": models,
                "loaded_count": len(models),
                "total_vram_bytes": total_vram,
            }
    except httpx.TimeoutException:
        return {"status": "timeout", "host": base, "models": []}
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "error",
            "host": base,
            "error": str(exc)[:200],
            "models": [],
        }


@router.get("/enrich-success-feed")
async def enrich_success_feed(
    since: float = Query(0.0, ge=0.0, description="Unix ts; only return events newer than this"),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    """Snowglobe Phase 2 — events for the bottom-right toast widget.

    Returns recently-persisted vendors with scope/data/effective % so the
    operator gets a glanceable confirm-and-click trail of every successful
    enrichment. Frontend polls every ~4s with `?since=<last_ts>` to receive
    only what it hasn't seen.
    """
    try:
        from agentic_crawler.enrich_success_feed import read_feed
        items = await read_feed(since_ts=float(since or 0.0), limit=int(limit))
    except Exception as exc:  # noqa: BLE001
        _log.warning("system.enrich_success_feed.failed", error=str(exc)[:160])
        items = []
    return {"items": items, "count": len(items), "since": float(since or 0.0)}


@router.get("/enrich-progress")
async def enrich_progress() -> dict[str, Any]:
    """Live agentic enrich pipeline state — backs the bottom-right CD widget.

    Composite of three real signals:
      - Redis stream depth + consumer/pending count (XLEN / XINFO GROUPS).
      - Postgres throughput: vendors classified in the last 5m / 1h / today.
      - Scope breakdown: total / military-visible / hidden off-scope.

    Snowglobe rule: no synthesized prose. Every number here is observable.
    Failing partials degrade gracefully (null fields) so the widget keeps
    spinning even when Redis or Postgres hiccups.
    """
    from datetime import datetime, timezone
    from sqlalchemy import func, select, text

    from ...db.engine import get_sessionmaker
    from ...db.models import VendorORM

    now = datetime.now(timezone.utc)
    out: dict[str, Any] = {
        "queue": {
            "backlog": None,         # lag — entries belum dibaca consumer group (real pending)
            "inflight": None,        # pending — task claimed but not yet acked
            "consumers": None,       # active consumer count
            "consumed_total": None,  # entries-read — cumulative consumed
            "stream_size": None,     # XLEN — cumulative entries in stream (NOT pending)
        },
        "throughput": {"classified_5m": None, "classified_1h": None, "classified_today": None},
        "scope": {"total": None, "military_visible": None, "hidden_off_scope": None, "other_visible": None},
        "fetched_at": now.isoformat(),
    }

    try:
        client = await get_redis()
        if client is not None:
            stream = "agentic:enrich:queue"
            try:
                xlen = await client.xlen(stream)
                out["queue"]["stream_size"] = int(xlen or 0)
            except Exception as exc:  # noqa: BLE001
                _log.debug("system.enrich.xlen_failed", error=str(exc)[:120])
            try:
                groups = await client.xinfo_groups(stream)
                if groups:
                    g = groups[0]
                    out["queue"]["inflight"] = int(g.get("pending", 0) or 0)
                    out["queue"]["consumers"] = int(g.get("consumers", 0) or 0)
                    out["queue"]["consumed_total"] = (
                        int(g.get("entries-read") or 0) if g.get("entries-read") is not None else None
                    )
                    out["queue"]["backlog"] = (
                        int(g.get("lag") or 0) if g.get("lag") is not None else None
                    )
            except Exception as exc:  # noqa: BLE001
                _log.debug("system.enrich.xinfo_failed", error=str(exc)[:120])
    except Exception as exc:  # noqa: BLE001
        _log.debug("system.enrich.redis_failed", error=str(exc)[:200])

    try:
        sm = get_sessionmaker()
        async with sm() as session:
            window_5m = text(
                "SELECT count(*) FROM vendors WHERE classified_at > now() - interval '5 minutes'"
            )
            window_1h = text(
                "SELECT count(*) FROM vendors WHERE classified_at > now() - interval '1 hour'"
            )
            window_day = text(
                "SELECT count(*) FROM vendors WHERE classified_at::date = current_date"
            )
            out["throughput"]["classified_5m"] = int((await session.execute(window_5m)).scalar_one() or 0)
            out["throughput"]["classified_1h"] = int((await session.execute(window_1h)).scalar_one() or 0)
            out["throughput"]["classified_today"] = int((await session.execute(window_day)).scalar_one() or 0)

            total = (await session.execute(select(func.count()).select_from(VendorORM))).scalar_one() or 0
            military = (
                await session.execute(
                    select(func.count())
                    .select_from(VendorORM)
                    .where(VendorORM.hidden == False, VendorORM.is_military_scope == True)  # noqa: E712
                )
            ).scalar_one() or 0
            hidden = (
                await session.execute(
                    select(func.count())
                    .select_from(VendorORM)
                    .where(VendorORM.hidden == True, VendorORM.hidden_reason == "off_scope")  # noqa: E712
                )
            ).scalar_one() or 0
            other = (
                await session.execute(
                    select(func.count())
                    .select_from(VendorORM)
                    .where(VendorORM.hidden == False, VendorORM.is_military_scope == False)  # noqa: E712
                )
            ).scalar_one() or 0
            out["scope"]["total"] = int(total)
            out["scope"]["military_visible"] = int(military)
            out["scope"]["hidden_off_scope"] = int(hidden)
            out["scope"]["other_visible"] = int(other)
    except Exception as exc:  # noqa: BLE001
        _log.debug("system.enrich.pg_failed", error=str(exc)[:200])

    return out


@router.get("/agentic-sessions")
async def agentic_sessions() -> dict[str, Any]:
    """Live agentic Browser-Use sessions per container.

    Each agentic container (`agentic-a`, `agentic-b`) holds its own hostname-scoped
    Redis lock `autocrawl:agentic_active_run:<host>` while running a seed batch.
    The lock value is JSON `{"started_at": iso}` set by `scheduler._try_acquire_lock`.

    Returns one entry per active lock plus the global stop-requested flag.
    """
    out: dict[str, Any] = {
        "sessions": [],
        "stop_requested": False,
        "source": "redis",
    }
    try:
        client = await get_redis()
        if client is None:
            out["source"] = "no_redis"
            return out

        keys: list[str] = []
        try:
            async for key in client.scan_iter(match="autocrawl:agentic_active_run:*"):
                keys.append(key)
        except Exception as exc:  # noqa: BLE001
            _log.debug("system.agentic.scan_failed", error=str(exc)[:120])

        for key in keys:
            try:
                raw = await client.get(key)
                host = key.rsplit(":", 1)[-1]
                started_at: str | None = None
                if raw:
                    try:
                        payload = json.loads(raw)
                        started_at = payload.get("started_at")
                    except json.JSONDecodeError:
                        pass
                ttl_raw = await client.ttl(key)
                try:
                    ttl = int(ttl_raw) if ttl_raw is not None else None
                except (TypeError, ValueError):
                    ttl = None
                out["sessions"].append({
                    "host": host,
                    "started_at": started_at,
                    "lock_ttl_seconds": ttl,
                })
            except Exception as exc:  # noqa: BLE001
                _log.debug("system.agentic.read_failed", key=key, error=str(exc)[:120])

        try:
            stop = await client.get("autocrawl:agentic_stop_requested")
            out["stop_requested"] = bool(stop)
        except Exception:  # noqa: BLE001
            pass
    except Exception as exc:  # noqa: BLE001
        out["source"] = "error"
        out["error"] = str(exc)[:200]

    return out
