"""One-shot agentic crawl: take a seed, run the agent, persist results.

Self-learning hooks:
  - Pre-run: tag log with `from_knowledge` so we can see when scheduler
    picked up a previously-successful URL vs a fresh search.
  - Post-run on success: record URL + extraction time + vendor list in the
    knowledge store. Embed every new vendor name into the Chroma vector
    index so future passes can dedupe.
  - Post-run on failure: increment domain fail counter; blacklist the
    domain entirely if the error matches a blocking-pattern (CAPTCHA,
    Cloudflare, 403, etc.) AND fail count crossed the threshold.
  - Vendor dedup BEFORE reporter: only NEW vendors get pushed through
    resolver/enricher/reporter. Known-seen vendors short-circuit out,
    saving significant LLM + scraping cost.
"""

from __future__ import annotations

import asyncio
import time

from crawler.observability.logger import get_logger

from .agent import AgentResult, run_agent_for_seed
from .knowledge import KnowledgeStore, domain_of, is_blocking_error
from .lessons import archive_lesson, categorize_failure
from .reporter import report_agent_result
from .seeds import AgenticSeed

_log = get_logger(__name__)


def _zero_counts() -> dict[str, int]:
    return {"resolved": 0, "enriched": 0, "dedup_skipped": 0, "rejected": 0, "failed": 0}


async def run_seed(seed: AgenticSeed) -> dict[str, int]:
    """Run the agent on one seed and persist the results.

    Returns the per-stage counts dict from `report_agent_result`. On agent
    failure (timeout, no exhibitors found), the dict is all zeros — caller
    can use it as-is for metrics without special-casing the error path.
    """
    store = await KnowledgeStore.load()
    started = time.monotonic()

    _log.info(
        "agentic.seed_started",
        name=seed.name,
        url=seed.url,
        from_knowledge="from_knowledge" in (seed.tags or []),
    )

    # Quantity pivot 2026-05-21 — grounding-first dispatch. When
    # AGENTIC_GROUNDING_FIRST=true, try Gemini grounded fetch first (no
    # browser, no Chromium fingerprint, bypass bot-detect). On low confidence
    # or partial result, fallback to existing Browser-Use head agent.
    from .config import get_agentic_settings as _runner_gs
    _rs = _runner_gs()
    result = None
    if _rs.use_grounding_first:
        try:
            from .agent_grounding import run_agent_grounding
            grounding_result = await run_agent_grounding(seed)
            if grounding_result.error == "grounding_low_confidence":
                _log.info(
                    "agentic.grounding_fallback_to_browser",
                    seed=seed.name,
                    grounded_count=len(grounding_result.exhibitors),
                )
                result = await run_agent_for_seed(seed)
                # Merge any partial exhibitors that grounding caught (dedup later in pipeline)
                if grounding_result.exhibitors:
                    existing_names = {(e.name or "").lower() for e in result.exhibitors}
                    for ge in grounding_result.exhibitors:
                        if (ge.name or "").lower() not in existing_names:
                            result.exhibitors.append(ge)
            else:
                result = grounding_result
        except Exception as e:  # noqa: BLE001
            _log.warning(
                "agentic.grounding_dispatch_failed_fallback_to_browser",
                seed=seed.name, error=str(e)[:200],
            )
            result = await run_agent_for_seed(seed)
    else:
        result = await run_agent_for_seed(seed)
    elapsed = time.monotonic() - started

    if result.error:
        domain = domain_of(seed.url)
        await store.record_failure(seed.name, seed.url, result.error)
        if domain and is_blocking_error(result.error):
            await store.mark_blacklist(domain, result.error)
        await store.save()
        if "discovery" in (seed.tags or []) and seed.source_query and domain:
            await store.record_discovery_attempt(
                seed.source_query, domain, outcome="failure"
            )
        # Lesson archive — fail-soft so a write error doesn't crash the seed.
        try:
            from .config import get_agentic_settings as _gs

            await archive_lesson(
                seed=seed,
                agent_result=result,
                elapsed_s=elapsed,
                raw_steps=result.raw_steps,
                status="failure",
                failure_category=categorize_failure(result.error),
                failure_detail=result.error,
                archive_recordings=_gs().lessons_archive_recordings,
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.lesson_archive_failed", error=str(e))
        _log.warning(
            "agentic.seed_error",
            name=seed.name,
            domain=domain,
            error=result.error,
            elapsed_s=int(elapsed),
        )
        return _zero_counts()

    # Snowglobe reset (rule 1, 2026-05-25): combine hard URL-match against
    # Postgres vendors with the existing Chroma fuzzy match. Exact URL hit
    # short-circuits — if we already enriched this canonical_url, never
    # research it again.
    from .dedup import was_reached

    new_vendors = []
    seen_count = 0
    for exh in result.exhibitors:
        if await was_reached(exh.name, exh.url, knowledge_store=store):
            seen_count += 1
            continue
        new_vendors.append(exh)
        await store.record_vendor_seen(exh.name, exh.url, seed.name)

    # Only record as success when we actually extracted vendors. An empty
    # result with no exception (agent gave up gracefully or timed-out hitting
    # `done` early) shouldn't poison knowledge.successful_urls — otherwise the
    # next pass warm-starts back to a useless landing page.
    extracted_total = len(result.exhibitors)
    if extracted_total > 0:
        # Prefer the agent's final URL (the actual exhibitor list page) over
        # seed.url (which for search-then-extract seeds is the Bing SERP).
        success_url = result.final_url or seed.url
        await store.record_success(
            seed.name, success_url, [v.name for v in new_vendors], elapsed
        )
    else:
        await store.record_failure(seed.name, seed.url, "extracted_zero_vendors")
        _log.info(
            "agentic.seed_zero_extracted",
            name=seed.name,
            elapsed_s=int(elapsed),
        )
        try:
            from .config import get_agentic_settings as _gs

            await archive_lesson(
                seed=seed,
                agent_result=result,
                elapsed_s=elapsed,
                raw_steps=result.raw_steps,
                status="failure",
                failure_category="empty_result",
                failure_detail="extracted_zero_vendors",
                archive_recordings=_gs().lessons_archive_recordings,
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.lesson_archive_failed_zero", error=str(e))
    await store.save()

    # Discovery audit trail: record per-pair outcome so the next pass's
    # `was_recently_tried` filter can skip dead query→domain combinations.
    if "discovery" in (seed.tags or []) and seed.source_query:
        domain = domain_of(seed.url)
        if domain:
            outcome = "success" if extracted_total > 0 else "failure"
            await store.record_discovery_attempt(
                seed.source_query, domain, outcome=outcome
            )

    # Pipe ONLY new vendors through resolver+enricher+reporter — saves the
    # cost of re-resolving a vendor we already enriched in a previous run.
    filtered = AgentResult(
        seed_name=result.seed_name,
        expo_id=result.expo_id,
        exhibitors=new_vendors,
        raw_output=result.raw_output,
    )

    # Phase 3: when AGENTIC_ENRICH_ENABLED, hand off each new vendor to
    # the agentic enrich pool via Redis stream INSTEAD OF the deterministic
    # Stage 03+04 path in `crawler.graph`. Deterministic resolver chronically
    # fails on bare vendor names ("REPKON" — could be .com / .info / parent
    # company); the agentic enricher searches first, then visits.
    #
    # Fail-soft: if the queue publish fails 3× in a row, we fall back to
    # the legacy `report_agent_result` path so a vendor isn't lost mid-flight.
    from .config import get_agentic_settings as _enrich_gs

    _enrich_settings = _enrich_gs()
    if _enrich_settings.agentic_enrich_enabled and new_vendors:
        import re as _re
        from urllib.parse import urlparse as _urlparse

        from .enrich_queue import EnrichTask, make_task_id, publish
        from .jina_listing import _looks_like_internal_nav, _looks_like_org

        try:
            _seed_host = (_urlparse(seed.url).hostname or "").lower()
        except Exception:  # noqa: BLE001
            _seed_host = ""

        # Extract distinctive seed-name tokens to filter sub-page candidates.
        # A vendor candidate whose name contains a seed-name token is almost
        # certainly an event sub-page (e.g. "Intersec Pulse Studio" under
        # seed "Intersec 2026"), not a real exhibitor.
        _seed_tokens: set[str] = set()
        for tok in _re.findall(r"[A-Za-z]+", seed.name or ""):
            t = tok.lower()
            if len(t) >= 5 and t not in {
                "expo", "fair", "conference", "summit", "world", "global",
                "international", "annual", "show",
            }:
                _seed_tokens.add(t)

        last_lesson_id = ""  # populated below; for now keep empty
        enqueued = 0
        nav_filtered = 0
        name_filtered = 0
        publish_failures: list[str] = []
        for exh in new_vendors:
            raw_url = getattr(exh, "url", None) or None
            exh_name = (getattr(exh, "name", "") or "").strip()
            # Name quality filter — denylist + length + verb-led + suffix.
            if not _looks_like_org(exh_name):
                name_filtered += 1
                continue
            # Seed-name token check: vendor name containing a seed token
            # is an event sub-page, not an exhibitor.
            name_lower = exh_name.lower()
            if any(tok in name_lower for tok in _seed_tokens):
                name_filtered += 1
                continue
            # Drop entries whose only URL is internal nav on the listing
            # host (track filters, session pages). Prevents the Enterprise
            # Connect-class garbage from polluting the enrich queue.
            if raw_url and _seed_host and _looks_like_internal_nav(_seed_host, raw_url):
                nav_filtered += 1
                continue
            task = EnrichTask(
                task_id=make_task_id(exh.name, result.expo_id),
                vendor_name=exh.name,
                hint_url=raw_url,
                expo_id=result.expo_id or f"agentic-{seed.name[:40]}",
                country_hint=getattr(exh, "country", None),
                product_hint=(
                    getattr(exh, "description", None)
                    or getattr(exh, "short_description", None)
                ),
                source_query=getattr(seed, "source_query", None),
                lesson_id_of_listing=last_lesson_id,
            )
            entry_id: str | None = None
            for attempt in range(3):
                try:
                    entry_id = await publish(task)
                    if entry_id:
                        break
                except Exception as e:  # noqa: BLE001
                    publish_failures.append(str(e)[:120])
                # Tiny back-off — Redis hiccup vs hard outage.
                await asyncio.sleep(0.2 * (attempt + 1))
            if entry_id:
                enqueued += 1
            else:
                publish_failures.append(f"vendor={exh.name[:40]} no entry id")

        if publish_failures and enqueued < len(new_vendors):
            _log.warning(
                "agentic.enrich_publish_failed",
                enqueued=enqueued,
                total=len(new_vendors),
                first_error=publish_failures[0] if publish_failures else "",
            )
            # Fall back to legacy path for the unenqueued tail. Keeps the
            # vendor in flight rather than silently losing it.
            counts = await report_agent_result(seed.url, filtered)
            counts["enqueued"] = enqueued
        else:
            # Async path: enrich pool will resolve, dedup, persist. Listing-
            # side counts can't reflect enrich outcomes anymore — operators
            # read enrich-side metrics for the second half of the funnel.
            counts = {
                "resolved": len(new_vendors),
                "enriched": 0,
                "dedup_skipped": 0,
                "rejected": 0,
                "failed": 0,
                "enqueued": enqueued,
                "nav_filtered": nav_filtered,
                "name_filtered": name_filtered,
            }
            if nav_filtered or name_filtered:
                _log.info(
                    "agentic.enrich_filter_dropped",
                    seed_host=_seed_host,
                    seed_tokens=sorted(_seed_tokens),
                    nav_filtered=nav_filtered,
                    name_filtered=name_filtered,
                    enqueued=enqueued,
                )
    else:
        counts = await report_agent_result(seed.url, filtered)

    # Lesson archive — additive; runs after reporter so the operator-facing
    # lesson reflects the same data the rest of the pipeline saw. Fail-soft.
    try:
        from .config import get_agentic_settings as _gs

        if extracted_total > 0:
            await archive_lesson(
                seed=seed,
                agent_result=result,
                elapsed_s=elapsed,
                raw_steps=result.raw_steps,
                status="success",
                archive_recordings=_gs().lessons_archive_recordings,
            )
        else:
            await archive_lesson(
                seed=seed,
                agent_result=result,
                elapsed_s=elapsed,
                raw_steps=result.raw_steps,
                status="failure",
                failure_category=categorize_failure(
                    result.bail_reason or "extracted_zero_vendors"
                ),
                failure_detail=result.bail_reason or "extracted_zero_vendors",
                archive_recordings=_gs().lessons_archive_recordings,
            )
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.lesson_archive_failed", error=str(e))

    _log.info(
        "agentic.seed_done",
        name=seed.name,
        extracted=len(result.exhibitors),
        new_vendors=len(new_vendors),
        skipped_seen=seen_count,
        elapsed_s=int(elapsed),
        **counts,
    )
    return counts
