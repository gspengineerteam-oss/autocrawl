"""LangGraph state-machine wiring with parallel Send fan-out.

Top-level flow:
  start → discover_expos
        → fan_out(extract_exhibitors)        [parallel up to extraction concurrency]
        → fan_out(resolve_vendor_url)        [parallel up to resolution concurrency]
        → fan_out(dedup_then_enrich_then_persist)  [parallel up to enrichment concurrency]
        → finalize_report
        → END

Each fan-out is implemented with `langgraph.types.Send` against a worker
node that processes ONE item at a time. asyncio.Semaphore inside the worker
node enforces the concurrency cap.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from langgraph.graph import END, StateGraph
from langgraph.types import Send

from .agents import dedup as dedup_agent
from .agents import discovery as discovery_agent
from .agents import enricher as enricher_agent
from .agents import extractor as extractor_agent
from .agents import name_resolver as name_resolver_agent
from .agents import pdf_finder as pdf_finder_agent
from .agents import reporter as reporter_agent
from .agents import resolver as resolver_agent
from .config import get_settings
from .db.engine import get_sessionmaker
from .db.repositories import exhibitor_ref_repo
from .observability.logger import get_logger
from .observability.metrics import (
    active_workers,
    errors_total,
)
from .orchestrator.events import emit_event
from .schemas import (
    CrawlMode,
    ExhibitorRef,
    Expo,
    FailureRecord,
    RunSummary,
    Vendor,
    VendorURL,
)
from .state import (
    CrawlState,
    WorkerExhibitorState,
    WorkerExpoState,
    WorkerVendorState,
)
from .store.json_reporter import write_run_summary


# Module-level cooperative cancellation flag. Set by api/routes/runs.py when
# the user clicks STOP (graceful). Workers check this at boundary to short-circuit
# the rest of their work, allowing the LangGraph state-machine to drain naturally.
_should_stop: asyncio.Event = asyncio.Event()


def request_stop() -> None:
    """Signal workers to skip remaining work. Idempotent."""
    _should_stop.set()


def is_stop_requested() -> bool:
    return _should_stop.is_set()


def _reset_stop_flag() -> None:
    _should_stop.clear()


async def _persist_refs_audit(refs: list[ExhibitorRef], *, run_id: str) -> None:
    """Persist extracted refs to exhibitor_refs table. Failure here MUST NOT break the pipeline."""
    if not refs:
        return
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            try:
                for ref in refs:
                    await exhibitor_ref_repo.upsert(session, ref, status="extracted", run_id=run_id)
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    except Exception as e:  # noqa: BLE001
        _log.warning("graph.refs_audit_persist_failed", count=len(refs), error=str(e)[:200])


async def _update_ref_status(
    *,
    expo_id: str | None,
    name: str,
    raw_url,
    status: str,
    failure_category: str | None = None,
    failure_reason: str | None = None,
    resolved_domain: str | None = None,
) -> None:
    """Update ref status by natural key. Best-effort, never raises into pipeline."""
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            try:
                await exhibitor_ref_repo.update_status_by_natural_key(
                    session,
                    expo_id=expo_id,
                    name=name,
                    raw_url=raw_url,
                    status=status,
                    failure_category=failure_category,
                    failure_reason=failure_reason,
                    resolved_domain=resolved_domain,
                    increment_attempts=True,
                )
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    except Exception as e:  # noqa: BLE001
        _log.debug("graph.ref_status_update_failed", name=name[:80], error=str(e)[:200])


def _classify_resolve_failure(ref: ExhibitorRef, err_str: str | None) -> str:
    """Best-effort failure category from ref + last error message."""
    if err_str:
        e = err_str.lower()
        if "timeout" in e or "timed out" in e:
            return "scrape_failed"
        if "dns" in e or "nodename" in e or "no such host" in e:
            return "dns_invalid"
        if "no candidates" in e or "no matches" in e:
            return "no_url_no_match"
        if "rate" in e and "limit" in e:
            return "scrape_failed"
    if ref.raw_url is None:
        return "no_url_no_match"
    return "unknown"

_log = get_logger(__name__)


# =====================================================================
# Sub-agent worker nodes (process ONE item, return partial state)
# =====================================================================


async def _worker_extract(state: WorkerExpoState) -> dict:
    settings = get_settings()
    sem = _stage_sem("extraction", settings.concurrency().exhibitor_extraction)
    expo: Expo = state["expo"]
    run_id = state.get("run_id") or ""
    if _should_stop.is_set():
        return {"failures": [FailureRecord(where="extraction", error="aborted_by_user")]}
    active_workers.labels(stage="extraction").inc()
    try:
        await emit_event(
            node="worker_extract",
            event="started",
            run_id=run_id,
            payload={"expo_id": expo.expo_id, "name": expo.name},
        )
        async with sem:
            if _should_stop.is_set():
                return {"failures": [FailureRecord(where="extraction", error="aborted_by_user")]}
            refs = await extractor_agent.extract_exhibitors(expo)
            await _persist_refs_audit(refs, run_id=run_id)
            await emit_event(
                node="worker_extract",
                event="completed",
                run_id=run_id,
                payload={"expo_id": expo.expo_id, "refs": len(refs)},
            )
            return {"pending_exhibitors": refs}
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="extraction", category=type(e).__name__).inc()
        _log.warning("worker_extract.error", expo_id=expo.expo_id, error=str(e))
        await emit_event(
            node="worker_extract",
            event="failed",
            run_id=run_id,
            payload={"expo_id": expo.expo_id, "error": str(e)[:200]},
        )
        return {
            "failures": [FailureRecord(where="extraction", error=str(e), url=str(expo.aggregator_url))]
        }
    finally:
        active_workers.labels(stage="extraction").dec()


async def _worker_resolve(state: WorkerExhibitorState) -> dict:
    settings = get_settings()
    sem = _stage_sem("resolution", settings.concurrency().vendor_resolution)
    ref: ExhibitorRef = state["exhibitor"]
    run_id = state.get("run_id") or ""
    if _should_stop.is_set():
        return {"failures": [FailureRecord(where="resolution", error="aborted_by_user")]}
    # Mode-A only after Phase 3: when `agentic_enrich_enabled=True`, the
    # agentic crawler bypasses this stage entirely (vendors go to the
    # `agentic:enrich:queue` Redis stream and are handled by the enrich
    # worker pool, which can search-then-visit instead of WHOIS-only).
    active_workers.labels(stage="resolution").inc()
    try:
        await emit_event(
            node="worker_resolve",
            event="started",
            run_id=run_id,
            payload={"name": ref.name[:80]},
        )
        async with sem:
            if _should_stop.is_set():
                return {"failures": [FailureRecord(where="resolution", error="aborted_by_user")]}
            last_err: str | None = None
            try:
                if ref.raw_url:
                    v = await resolver_agent.resolve_vendor_url(ref)
                else:
                    v = await name_resolver_agent.resolve_from_name(
                        ref.name,
                        expo_id=ref.expo_id,
                        context_snippet=ref.short_description,
                    )
            except Exception as inner:  # noqa: BLE001
                last_err = str(inner)
                v = None
            if v is None:
                cat = _classify_resolve_failure(ref, last_err)
                await _update_ref_status(
                    expo_id=ref.expo_id,
                    name=ref.name,
                    raw_url=ref.raw_url,
                    status="resolve_failed",
                    failure_category=cat,
                    failure_reason=last_err,
                )
                if get_settings().persist_unresolved:
                    try:
                        await reporter_agent.persist_unresolved_vendor(ref, failure_category=cat)
                    except Exception as e:  # noqa: BLE001
                        _log.debug("graph.unresolved_persist_failed", name=ref.name[:80], error=str(e)[:200])
                await emit_event(
                    node="worker_resolve",
                    event="failed",
                    run_id=run_id,
                    payload={"name": ref.name[:80], "reason": cat},
                )
                return {}
            if ref.provenance:
                v.provenance = list(ref.provenance) + list(v.provenance or [])
            await _update_ref_status(
                expo_id=ref.expo_id,
                name=ref.name,
                raw_url=ref.raw_url,
                status="resolved",
                resolved_domain=v.domain,
            )
            await emit_event(
                node="worker_resolve",
                event="completed",
                run_id=run_id,
                payload={"name": ref.name[:80], "domain": v.domain},
            )
            return {"resolved_vendors": [v]}
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="resolution", category=type(e).__name__).inc()
        _log.warning("worker_resolve.error", exhibitor=ref.name, error=str(e))
        await _update_ref_status(
            expo_id=ref.expo_id,
            name=ref.name,
            raw_url=ref.raw_url,
            status="resolve_failed",
            failure_category=_classify_resolve_failure(ref, str(e)),
            failure_reason=str(e),
        )
        await emit_event(
            node="worker_resolve",
            event="failed",
            run_id=run_id,
            payload={"name": ref.name[:80], "error": str(e)[:200]},
        )
        return {"failures": [FailureRecord(where="resolution", error=str(e), url=str(ref.raw_url) if ref.raw_url else None)]}
    finally:
        active_workers.labels(stage="resolution").dec()


async def _worker_pdf_extract(state: WorkerExpoState) -> dict:
    """Per-expo PDF discovery + extraction. Runs in parallel to _worker_extract."""
    settings = get_settings()
    if not settings.pdf_discovery_enabled:
        return {}
    sem = _stage_sem("pdf_extraction", settings.pdf_extraction_concurrency)
    expo: Expo = state["expo"]
    run_id = state.get("run_id") or ""
    if _should_stop.is_set():
        return {}
    active_workers.labels(stage="pdf_extraction").inc()
    try:
        await emit_event(
            node="worker_pdf_extract",
            event="started",
            run_id=run_id,
            payload={"expo_id": expo.expo_id},
        )
        async with sem:
            if _should_stop.is_set():
                return {}
            from .tools.scrapers import pdf_extractor as pdf_extractor_mod

            pdf_urls = await pdf_finder_agent.find_pdfs_for_expo(expo)
            if not pdf_urls:
                await emit_event(
                    node="worker_pdf_extract",
                    event="completed",
                    run_id=run_id,
                    payload={"expo_id": expo.expo_id, "pdfs": 0, "refs": 0},
                )
                return {}
            expo.pdf_brochure_urls = pdf_urls

            refs: list[ExhibitorRef] = []
            for pdf_url in pdf_urls:
                try:
                    refs.extend(await pdf_extractor_mod.list_exhibitors(pdf_url, expo.expo_id))
                except Exception as e:  # noqa: BLE001
                    errors_total.labels(stage="pdf_extraction", category=type(e).__name__).inc()
                    _log.warning("worker_pdf_extract.pdf_failed", expo_id=expo.expo_id, pdf=pdf_url, error=str(e))
            await _persist_refs_audit(refs, run_id=run_id)
            await emit_event(
                node="worker_pdf_extract",
                event="completed",
                run_id=run_id,
                payload={"expo_id": expo.expo_id, "pdfs": len(pdf_urls), "refs": len(refs)},
            )
            return {"pending_exhibitors": refs}
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_extraction", category=type(e).__name__).inc()
        _log.warning("worker_pdf_extract.error", expo_id=expo.expo_id, error=str(e))
        await emit_event(
            node="worker_pdf_extract",
            event="failed",
            run_id=run_id,
            payload={"expo_id": expo.expo_id, "error": str(e)[:200]},
        )
        return {"failures": [FailureRecord(where="pdf_extraction", error=str(e))]}
    finally:
        active_workers.labels(stage="pdf_extraction").dec()


async def _worker_enrich(state: WorkerVendorState) -> dict:
    settings = get_settings()
    sem = _stage_sem("enrichment", settings.concurrency().enrichment)
    vurl: VendorURL = state["vendor_url"]
    run_id = state.get("run_id") or ""
    if _should_stop.is_set():
        return {"failures": [FailureRecord(where="enrichment", error="aborted_by_user", url=str(vurl.canonical_url))]}
    active_workers.labels(stage="enrichment").inc()
    try:
        await emit_event(
            node="worker_enrich",
            event="started",
            run_id=run_id,
            payload={"domain": vurl.domain},
        )
        async with sem:
            if _should_stop.is_set():
                return {"failures": [FailureRecord(where="enrichment", error="aborted_by_user", url=str(vurl.canonical_url))]}
            is_dup = await dedup_agent.check_and_merge(vurl)
            if is_dup:
                await reporter_agent.merge_existing_with_expo(vurl.domain, vurl.expo_id)
                await _update_ref_status(
                    expo_id=vurl.expo_id,
                    name=vurl.exhibitor_name,
                    raw_url=vurl.resolved_from,
                    status="dedup_skipped",
                    resolved_domain=vurl.domain,
                )
                await emit_event(
                    node="worker_enrich",
                    event="completed",
                    run_id=run_id,
                    payload={"domain": vurl.domain, "outcome": "dedup_skipped"},
                )
                return {"dedup_skipped_count": 1}
            v: Vendor | None = await enricher_agent.enrich_vendor(vurl)
            if v is None:
                await _update_ref_status(
                    expo_id=vurl.expo_id,
                    name=vurl.exhibitor_name,
                    raw_url=vurl.resolved_from,
                    status="enrich_failed",
                    failure_category="llm_merge_error",
                    failure_reason="enricher returned no profile",
                    resolved_domain=vurl.domain,
                )
                await emit_event(
                    node="worker_enrich",
                    event="failed",
                    run_id=run_id,
                    payload={"domain": vurl.domain, "reason": "no_profile"},
                )
                return {"failures": [FailureRecord(where="enrichment", error="no_profile", url=str(vurl.canonical_url))]}
            persisted, reject_cat = await reporter_agent.persist_vendor(v)
            if persisted:
                await _update_ref_status(
                    expo_id=vurl.expo_id,
                    name=vurl.exhibitor_name,
                    raw_url=vurl.resolved_from,
                    status="enriched",
                    resolved_domain=vurl.domain,
                )
                await emit_event(
                    node="worker_enrich",
                    event="completed",
                    run_id=run_id,
                    payload={"domain": vurl.domain, "outcome": "enriched"},
                )
                return {"enriched_vendors": [v]}
            mapped_status = "scope_rejected" if reject_cat == "scope_rejected" else "validation_rejected"
            mapped_cat = "scope_out_of_scope" if reject_cat == "scope_rejected" else "completeness_low"
            await _update_ref_status(
                expo_id=vurl.expo_id,
                name=vurl.exhibitor_name,
                raw_url=vurl.resolved_from,
                status=mapped_status,
                failure_category=mapped_cat,
                resolved_domain=vurl.domain,
            )
            await emit_event(
                node="worker_enrich",
                event="failed",
                run_id=run_id,
                payload={"domain": vurl.domain, "reason": reject_cat or "rejected_by_validator"},
            )
            return {"failures": [FailureRecord(where="reporter", error=reject_cat or "rejected_by_validator", url=str(vurl.canonical_url))]}
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="enrichment", category=type(e).__name__).inc()
        _log.warning("worker_enrich.error", domain=vurl.domain, error=str(e))
        await _update_ref_status(
            expo_id=vurl.expo_id,
            name=vurl.exhibitor_name,
            raw_url=vurl.resolved_from,
            status="enrich_failed",
            failure_category="llm_merge_error" if "llm" in str(e).lower() else "scrape_failed",
            failure_reason=str(e),
            resolved_domain=vurl.domain,
        )
        await emit_event(
            node="worker_enrich",
            event="failed",
            run_id=run_id,
            payload={"domain": vurl.domain, "error": str(e)[:200]},
        )
        return {"failures": [FailureRecord(where="enrichment", error=str(e), url=str(vurl.canonical_url))]}
    finally:
        active_workers.labels(stage="enrichment").dec()


# =====================================================================
# Supervisor nodes (sequential, fan-out to workers)
# =====================================================================


async def _node_discover(state: CrawlState) -> dict:
    run_id = state.get("run_id") or ""
    await emit_event(node="discover", event="started", run_id=run_id, payload={})
    try:
        expos = await discovery_agent.discover_expos()
    except Exception as e:  # noqa: BLE001
        await emit_event(
            node="discover",
            event="failed",
            run_id=run_id,
            payload={"error": str(e)[:200]},
        )
        raise
    _log.info("graph.discover_done", count=len(expos))
    await emit_event(
        node="discover",
        event="completed",
        run_id=run_id,
        payload={"expos": len(expos)},
    )
    return {"discovered_expos": expos, "expos_count": len(expos)}


def _route_to_extract(state: CrawlState) -> list[Send]:
    """Fan out per expo to BOTH aggregator scraper and PDF extractor."""
    settings = get_settings()
    expos = state.get("discovered_expos") or []
    sends: list[Send] = []
    for e in expos:
        sends.append(Send("worker_extract", {"run_id": state["run_id"], "expo": e}))
        if settings.pdf_discovery_enabled:
            sends.append(Send("worker_pdf_extract", {"run_id": state["run_id"], "expo": e}))
    return sends


def _route_to_resolve(state: CrawlState) -> list[Send]:
    pending = state.get("pending_exhibitors") or []
    return [
        Send("worker_resolve", {"run_id": state["run_id"], "exhibitor": ref})
        for ref in pending
    ]


def _route_to_enrich(state: CrawlState) -> list[Send]:
    settings = get_settings()
    vendors = state.get("resolved_vendors") or []
    if len(vendors) > settings.max_vendors_per_run:
        vendors = vendors[: settings.max_vendors_per_run]
    return [
        Send("worker_enrich", {"run_id": state["run_id"], "vendor_url": v})
        for v in vendors
    ]


async def _node_finalize(state: CrawlState) -> dict:
    run_id = state["run_id"]
    await emit_event(node="finalize", event="started", run_id=run_id, payload={})
    expos = state.get("discovered_expos") or []
    enriched: list[Vendor] = state.get("enriched_vendors") or []

    # group enriched vendor domains by expo (skip rows without resolved domain)
    by_expo: dict[str, list[str]] = {}
    for v in enriched:
        if not v.domain:
            continue
        for ex in v.expos_seen or []:
            by_expo.setdefault(ex, []).append(v.domain)

    for e in expos:
        await reporter_agent.persist_expo(e, by_expo.get(e.expo_id, []))

    ref_status_counts: dict[str, int] = {}
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            ref_status_counts = await exhibitor_ref_repo.count_by_status_for_run(session, run_id)
    except Exception as e:  # noqa: BLE001
        _log.debug("graph.refs_status_count_failed", run_id=run_id, error=str(e)[:200])

    summary = RunSummary(
        run_id=run_id,
        started_at=state.get("__started_at__") or datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
        mode=state.get("mode") or CrawlMode.NORMAL,
        expos_discovered=state.get("expos_count") or 0,
        exhibitors_extracted=len(state.get("pending_exhibitors") or []),
        vendors_resolved=len(state.get("resolved_vendors") or []),
        vendors_enriched=len(enriched),
        vendors_dedup_skipped=state.get("dedup_skipped_count") or 0,
        failures=len(state.get("failures") or []),
        exhibitors_resolve_failed=ref_status_counts.get("resolve_failed", 0),
        exhibitors_enrich_failed=ref_status_counts.get("enrich_failed", 0),
        exhibitors_validation_rejected=ref_status_counts.get("validation_rejected", 0),
        exhibitors_scope_rejected=ref_status_counts.get("scope_rejected", 0),
    )
    await write_run_summary(summary)
    _log.info(
        "graph.finalize",
        run_id=run_id,
        expos=summary.expos_discovered,
        exhibitors=summary.exhibitors_extracted,
        resolved=summary.vendors_resolved,
        enriched=summary.vendors_enriched,
        dedup_skipped=summary.vendors_dedup_skipped,
        failures=summary.failures,
    )
    await emit_event(
        node="finalize",
        event="completed",
        run_id=run_id,
        payload={
            "vendors_enriched": summary.vendors_enriched,
            "expos": summary.expos_discovered,
            "failures": summary.failures,
        },
    )
    return {}


# =====================================================================
# Concurrency caps (singletons per stage)
# =====================================================================

_SEMS: dict[str, asyncio.Semaphore] = {}


def _stage_sem(stage: str, cap: int) -> asyncio.Semaphore:
    sem = _SEMS.get(stage)
    if sem is None:
        sem = asyncio.Semaphore(cap)
        _SEMS[stage] = sem
    return sem


# =====================================================================
# Graph builder
# =====================================================================


def build_graph():
    g = StateGraph(CrawlState)

    g.add_node("discover", _node_discover)
    g.add_node("worker_extract", _worker_extract)
    g.add_node("worker_pdf_extract", _worker_pdf_extract)
    g.add_node("worker_resolve", _worker_resolve)
    g.add_node("worker_enrich", _worker_enrich)
    g.add_node("finalize", _node_finalize)

    g.set_entry_point("discover")
    g.add_conditional_edges("discover", _route_to_extract, ["worker_extract", "worker_pdf_extract"])
    g.add_conditional_edges("worker_extract", _route_to_resolve, ["worker_resolve"])
    g.add_conditional_edges("worker_pdf_extract", _route_to_resolve, ["worker_resolve"])
    g.add_conditional_edges("worker_resolve", _route_to_enrich, ["worker_enrich"])
    g.add_edge("worker_enrich", "finalize")
    g.add_edge("finalize", END)

    return g


async def run_once(*, mode: CrawlMode | None = None) -> RunSummary:
    """Single end-to-end run. Returns the run summary."""
    settings = get_settings()
    selected_mode = mode or settings.mode
    # Clear any leftover stop flag from a previous aborted run.
    _reset_stop_flag()
    started_at = datetime.now(timezone.utc)
    run_id = f"{started_at.strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"

    # Pre-warm the LLM (no-op for OpenAI; loads Ollama models into VRAM).
    from .tools.llm.openai_client import warmup as llm_warmup

    try:
        await llm_warmup()
    except Exception as e:  # noqa: BLE001
        _log.warning("graph.warmup_failed", error=str(e))

    init_state: CrawlState = {
        "run_id": run_id,
        "mode": selected_mode,
        "seed_queries": [],
        "discovered_expos": [],
        "pending_exhibitors": [],
        "resolved_vendors": [],
        "enriched_vendors": [],
        "failures": [],
        "expos_count": 0,
        "exhibitors_count": 0,
        "vendors_resolved_count": 0,
        "vendors_enriched_count": 0,
        "dedup_skipped_count": 0,
        "firecrawl_budget_low": False,
        "phase_2_unlocked": False,
    }

    graph = build_graph()
    # No checkpointer: Pydantic state isn't msgpack-serializable, and we
    # don't need crash-resume mid-run (JSON reports give us persistence).
    compiled = graph.compile()

    config = {"configurable": {"thread_id": run_id}, "recursion_limit": 200}
    result = await compiled.ainvoke(init_state, config=config)

    ref_status_counts: dict[str, int] = {}
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            ref_status_counts = await exhibitor_ref_repo.count_by_status_for_run(session, run_id)
    except Exception as e:  # noqa: BLE001
        _log.debug("graph.refs_status_count_failed", run_id=run_id, error=str(e)[:200])

    return RunSummary(
        run_id=run_id,
        started_at=started_at,
        finished_at=datetime.now(timezone.utc),
        mode=selected_mode,
        expos_discovered=len(result.get("discovered_expos") or []),
        exhibitors_extracted=len(result.get("pending_exhibitors") or []),
        vendors_resolved=len(result.get("resolved_vendors") or []),
        vendors_enriched=len(result.get("enriched_vendors") or []),
        vendors_dedup_skipped=result.get("dedup_skipped_count") or 0,
        failures=len(result.get("failures") or []),
        exhibitors_resolve_failed=ref_status_counts.get("resolve_failed", 0),
        exhibitors_enrich_failed=ref_status_counts.get("enrich_failed", 0),
        exhibitors_validation_rejected=ref_status_counts.get("validation_rejected", 0),
        exhibitors_scope_rejected=ref_status_counts.get("scope_rejected", 0),
    )
