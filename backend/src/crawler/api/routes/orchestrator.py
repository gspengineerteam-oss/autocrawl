from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.repositories import exhibitor_ref_repo
from ...orchestrator.events import latest_event_id, tail_events
from ..deps import get_db

router = APIRouter(prefix="/orchestrator", tags=["orchestrator"])


_NODES = [
    {
        "id": "discover",
        "label": "Discover Expo",
        "code": "01",
        "description": "Search wikipedia, ddg dan firecrawl untuk expo defense",
        "x": 50,
        "y": 50,
    },
    {
        "id": "worker_extract",
        "label": "Extract Aggregator",
        "code": "02A",
        "description": "Pull exhibitor list dari aggregator (10times, wiki, dll)",
        "x": 350,
        "y": 0,
    },
    {
        "id": "worker_pdf_extract",
        "label": "Extract PDF",
        "code": "02B",
        "description": "Download brosur PDF dan ekstrak vendor dari halaman",
        "x": 350,
        "y": 150,
    },
    {
        "id": "worker_resolve",
        "label": "Resolve Vendor URL",
        "code": "03",
        "description": "Aggregator URL ke vendor domain asli (anti-aggregator)",
        "x": 700,
        "y": 75,
    },
    {
        "id": "worker_enrich",
        "label": "Enrich Vendor",
        "code": "04",
        "description": "Whois, dns, schema, contacts, translation, persist",
        "x": 1000,
        "y": 75,
    },
    {
        "id": "finalize",
        "label": "Finalize Run",
        "code": "05",
        "description": "Persist RunSummary, write reports, push metrics",
        "x": 1300,
        "y": 75,
    },
]

_EDGES = [
    {"id": "e1a", "source": "discover", "target": "worker_extract"},
    {"id": "e1b", "source": "discover", "target": "worker_pdf_extract"},
    {"id": "e2a", "source": "worker_extract", "target": "worker_resolve"},
    {"id": "e2b", "source": "worker_pdf_extract", "target": "worker_resolve"},
    {"id": "e3", "source": "worker_resolve", "target": "worker_enrich"},
    {"id": "e4", "source": "worker_enrich", "target": "finalize"},
]


def _aggregate_node_state(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Compute per-node counters from a window of recent events."""
    state: dict[str, dict[str, Any]] = {
        n["id"]: {
            "active": 0,
            "started": 0,
            "completed": 0,
            "failed": 0,
            "last_event_at": None,
        }
        for n in _NODES
    }
    for ev in events:
        node = ev.get("node") or ""
        if node not in state:
            continue
        kind = ev.get("event") or ""
        if kind == "started":
            state[node]["started"] += 1
            state[node]["active"] += 1
        elif kind == "completed":
            state[node]["completed"] += 1
            state[node]["active"] = max(0, state[node]["active"] - 1)
        elif kind == "failed":
            state[node]["failed"] += 1
            state[node]["active"] = max(0, state[node]["active"] - 1)
        ts = ev.get("ts")
        if ts is not None:
            cur = state[node]["last_event_at"]
            if cur is None or ts > cur:
                state[node]["last_event_at"] = ts
    return state


@router.get("/state")
async def orchestrator_state() -> dict[str, Any]:
    """Snapshot of node graph + per-node aggregated counters."""
    recent = await tail_events(since="0", limit=1000)
    counters = _aggregate_node_state(recent)
    last_id = await latest_event_id()

    nodes = []
    for n in _NODES:
        cs = counters.get(n["id"], {})
        merged = dict(n)
        merged.update(cs)
        nodes.append(merged)

    return {
        "nodes": nodes,
        "edges": _EDGES,
        "last_event_id": last_id,
        "events_observed": len(recent),
    }


@router.get("/events")
async def orchestrator_events(
    since: str = Query("0", description="Stream id, exclusive"),
    limit: int = Query(50, ge=1, le=500),
) -> dict[str, Any]:
    events = await tail_events(since=since, limit=limit)
    next_since = events[-1]["id"] if events else since
    return {"events": events, "next_since": next_since}


# =====================================================================
# Live Operations Console — current activity / throughput / error inbox
# =====================================================================


_FAILURE_DICT: dict[str, dict[str, str]] = {
    "no_url_no_match": {
        "title": "Resolver gak nemu domain",
        "cause": "Search engine (Wikipedia, DuckDuckGo, Crawl4AI) gagal nemu match buat nama vendor.",
        "remedy": "Kemungkinan nama OCR garbage dari PDF, atau company gak punya web presence. Buka detail vendor lalu klik PERDALAM SEKARANG untuk coba ulang dengan strategi berbeda.",
    },
    "dns_invalid": {
        "title": "Domain tidak resolve",
        "cause": "DNS lookup gagal. Domain mungkin parking page, dead, atau salah ketik.",
        "remedy": "Cek domain di browser. Kalau beneran mati, ref ini aman diabaikan.",
    },
    "scrape_failed": {
        "title": "Scraping situs gagal",
        "cause": "Timeout, rate-limit, atau Cloudflare blocking.",
        "remedy": "Biasanya retry sukses. Set CRAWL4AI_BROWSER=undetected di .env untuk situs anti-bot.",
    },
    "aggregator_only": {
        "title": "Cuma kandidat aggregator",
        "cause": "Semua kandidat domain berasal dari aggregator (10times, eventbrite, dll), bukan website asli vendor.",
        "remedy": "Vendor mungkin pure-aggregator listing. Coba PERDALAM SEKARANG dengan context tambahan.",
    },
    "llm_tiebreak_null": {
        "title": "LLM tiebreak abstain",
        "cause": "LLM melihat banyak kandidat tapi gak yakin pilih yang mana.",
        "remedy": "Trigger PERDALAM SEKARANG, atau cek nama vendor terlalu generic.",
    },
    "llm_merge_error": {
        "title": "OpenAI merge gagal",
        "cause": "LLM call rate-limit, quota habis, atau respons malformed.",
        "remedy": "Cek balance OPENAI_API_KEY. Jalankan crawl reprocess-pdfs --only-failed setelah quota refresh.",
    },
    "completeness_low": {
        "title": "Profil terlalu tipis",
        "cause": "Enrichment sukses tapi data minimal. Score completeness di bawah threshold (default 0.10).",
        "remedy": "Turunkan VENDOR_COMPLETENESS_THRESHOLD di .env, atau klik PERDALAM SEKARANG di vendor detail untuk re-scrape.",
    },
    "scope_out_of_scope": {
        "title": "Bukan defense vendor",
        "cause": "Scope classifier reject karena hotel, news, catering, event platform, atau industry generic.",
        "remedy": "Bisa diabaikan kalau benar. KEEP_OUT_OF_SCOPE=true (default) sudah menjamin tetap ke-persist sebagai info.",
    },
    "whois_failed": {
        "title": "WHOIS lookup gagal",
        "cause": "Kombinasi sumber WHOIS kosong, server registrar timeout, atau domain TLD eksotik.",
        "remedy": "Data registrar opsional. Skor completeness biasanya tetap valid tanpa WHOIS.",
    },
    "unknown": {
        "title": "Penyebab tidak teridentifikasi",
        "cause": "Resolver return None tanpa error message yang bisa diklasifikasi.",
        "remedy": "Buka raw failure_reason di /api/exhibitor-refs?status=resolve_failed&failure_category=unknown.",
    },
}


_NODE_META: dict[str, dict[str, str]] = {
    "discover": {"code": "01", "label": "Discover Expo"},
    "worker_extract": {"code": "02A", "label": "Extract Aggregator"},
    "worker_pdf_extract": {"code": "02B", "label": "Extract PDF"},
    "worker_resolve": {"code": "03", "label": "Resolve Vendor URL"},
    "worker_enrich": {"code": "04", "label": "Enrich Vendor"},
    "finalize": {"code": "05", "label": "Finalize Run"},
}


def _stage_in_flight_label(events: list[dict[str, Any]], node: str) -> str | None:
    """Return label of the last started item that hasn't yet completed/failed."""
    open_items: dict[str, dict[str, Any]] = {}
    for ev in events:
        if ev.get("node") != node:
            continue
        kind = ev.get("event")
        payload = ev.get("payload") or {}
        sub_id = (
            payload.get("expo_id")
            or payload.get("name")
            or payload.get("domain")
            or ""
        )
        if not sub_id:
            continue
        if kind == "started":
            open_items[sub_id] = ev
        elif kind in ("completed", "failed"):
            open_items.pop(sub_id, None)
    if not open_items:
        return None
    # Last started by ts
    latest = max(open_items.values(), key=lambda e: float(e.get("ts") or 0))
    p = latest.get("payload") or {}
    label = p.get("name") or p.get("domain") or p.get("expo_id") or ""
    return str(label)[:80] if label else None


def _today_start_ts() -> float:
    now = datetime.now(timezone.utc)
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    return today.timestamp()


@router.get("/current")
async def orchestrator_current() -> dict[str, Any]:
    """Snapshot of what's happening right now: active run, per-stage activity."""
    settings_module = None
    try:
        from ...config import get_settings as _gs
        settings_module = _gs()
    except Exception:  # noqa: BLE001
        pass

    # Active run lock
    active_run: dict[str, Any] | None = None
    try:
        from redis.asyncio import from_url

        if settings_module is not None:
            client = from_url(settings_module.redis_url, decode_responses=True)
            try:
                raw = await client.get("autocrawl:active_run")
                if raw:
                    try:
                        active_run = json.loads(raw)
                    except Exception:  # noqa: BLE001
                        active_run = None
            finally:
                await client.aclose()
    except Exception:  # noqa: BLE001
        active_run = None

    if active_run and isinstance(active_run.get("started_at"), str):
        try:
            started = datetime.fromisoformat(active_run["started_at"].replace("Z", "+00:00"))
            active_run["duration_seconds"] = int(
                (datetime.now(timezone.utc) - started).total_seconds()
            )
        except Exception:  # noqa: BLE001
            active_run["duration_seconds"] = 0

    # Recent events for in_flight + today counts
    recent = await tail_events(since="0", limit=2000)
    today_start = _today_start_ts()

    stages: list[dict[str, Any]] = []
    for node_id, meta in _NODE_META.items():
        active = 0
        completed_today = 0
        failed_today = 0
        last_event_at: float | None = None
        # Track active = started count - completed count - failed count
        for ev in recent:
            if ev.get("node") != node_id:
                continue
            ts = float(ev.get("ts") or 0)
            if last_event_at is None or ts > last_event_at:
                last_event_at = ts
            kind = ev.get("event")
            if kind == "started":
                active += 1
            elif kind in ("completed", "failed"):
                active = max(0, active - 1)
                if ts >= today_start:
                    if kind == "completed":
                        completed_today += 1
                    else:
                        failed_today += 1
        stages.append(
            {
                "node": node_id,
                "code": meta["code"],
                "label": meta["label"],
                "active": active,
                "completed_today": completed_today,
                "failed_today": failed_today,
                "in_flight_label": _stage_in_flight_label(recent, node_id),
                "last_event_at": last_event_at,
            }
        )

    return {
        "active_run": active_run,
        "stages": stages,
    }


@router.get("/throughput")
async def orchestrator_throughput(
    window_seconds: int = Query(60, ge=10, le=86400),
) -> dict[str, Any]:
    """Rolling-window throughput rates with adaptive fallback.

    If the requested window is empty of events, this widens the window
    (60s → 5m → 30m → 1h → 24h) until we find activity, so the dashboard
    is never just zeros — frontend labels the actual window used. Realtime
    polling on the frontend (every 1-2s) keeps numbers fresh.
    """
    now = time.time()
    recent = await tail_events(since="0", limit=10000)

    # Compute persistent metrics over ALL events first (cheap).
    active_total = 0
    last_event_ts: float = 0.0
    for ev in recent:
        ts = float(ev.get("ts") or 0)
        if ts > last_event_ts:
            last_event_ts = ts
        kind = ev.get("event")
        if kind == "started":
            active_total += 1
        elif kind in ("completed", "failed"):
            active_total = max(0, active_total - 1)

    # Adaptive window: try requested → 5m → 30m → 1h → 24h until we see events.
    candidate_windows = [window_seconds, 300, 1800, 3600, 86400]
    seen: set[int] = set()
    chosen_window = window_seconds
    in_window: list[dict[str, Any]] = []
    fallback_used = False
    for idx, w in enumerate(candidate_windows):
        if w in seen:
            continue
        seen.add(w)
        cutoff = now - w
        in_window = [ev for ev in recent if float(ev.get("ts") or 0) >= cutoff]
        chosen_window = w
        if in_window or idx == len(candidate_windows) - 1:
            fallback_used = idx > 0
            break

    enriched = 0
    errors = 0
    by_node: dict[str, int] = {}
    for ev in in_window:
        node = ev.get("node") or ""
        kind = ev.get("event")
        by_node[node] = by_node.get(node, 0) + 1
        if kind == "failed":
            errors += 1
        if (
            node == "worker_enrich"
            and kind == "completed"
            and (ev.get("payload") or {}).get("outcome") == "enriched"
        ):
            enriched += 1

    minute_factor = 60.0 / max(1, chosen_window)
    return {
        "window_seconds": window_seconds,
        "effective_window_seconds": chosen_window,
        "fallback_used": fallback_used,
        "last_event_at": last_event_ts or None,
        "now": now,
        "events_total": len(in_window),
        "events_per_minute": round(len(in_window) * minute_factor, 2),
        "vendors_per_minute": round(enriched * minute_factor, 2),
        "errors_per_minute": round(errors * minute_factor, 2),
        "active_workers_total": active_total,
        "by_node": {n: round(c * minute_factor, 2) for n, c in by_node.items()},
    }


@router.get("/error-summary")
async def orchestrator_error_summary(
    samples_per_group: int = Query(5, ge=0, le=20),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Group failures by category, attach humanized cause + remedy + sample refs."""
    by_cat = await exhibitor_ref_repo.stats_by_failure_category(session)

    groups: list[dict[str, Any]] = []
    for category, count in sorted(by_cat.items(), key=lambda kv: -kv[1]):
        meta = _FAILURE_DICT.get(
            category,
            {
                "title": category.replace("_", " ").title(),
                "cause": "Belum ada penjelasan untuk kategori ini.",
                "remedy": "Cek raw failure_reason via /api/exhibitor-refs?failure_category=" + category,
            },
        )
        samples_payload: list[dict[str, Any]] = []
        if samples_per_group > 0:
            try:
                rows = await exhibitor_ref_repo.list_by_status(
                    session,
                    status=None,
                    failure_category=category,
                    limit=samples_per_group,
                    offset=0,
                )
                for r in rows:
                    samples_payload.append(
                        {
                            "ref_id": r.ref_id,
                            "name": r.name,
                            "expo_id": r.expo_id,
                            "failure_reason": (r.failure_reason or "")[:200],
                            "resolve_attempts": r.resolve_attempts or 0,
                        }
                    )
            except Exception:  # noqa: BLE001
                samples_payload = []

        groups.append(
            {
                "category": category,
                "title": meta["title"],
                "count": int(count),
                "cause": meta["cause"],
                "remedy": meta["remedy"],
                "samples": samples_payload,
            }
        )

    return {"groups": groups, "total": sum(g["count"] for g in groups)}


@router.get("/agent-traces")
async def orchestrator_agent_traces(
    limit: int = Query(60, ge=1, le=400),
    since: float | None = Query(None),
) -> dict[str, Any]:
    """Recent agent reasoning trace lines (Eval / Memory / Goal / Judge /
    action) captured live from `browser_use.Agent` log records. Drives
    the live monitor page's "agent thoughts" panel."""
    from ...tools.agent_trace_buffer import recent

    items = recent(limit)
    if since is not None:
        items = [e for e in items if _epoch(e.get("ts")) > since]
    return {"items": items}


def _epoch(ts: str | None) -> float:
    if not ts:
        return 0.0
    try:
        # ISO-8601 with timezone suffix → epoch seconds
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except Exception:  # noqa: BLE001
        return 0.0
