"""Bridge from agent output to the existing storage layer.

Reuses `crawler.agents.{resolver,name_resolver,enricher,reporter}` so vendor
records produced by the agent go through the same normalize-and-enrich pipeline
as the deterministic crawler. Output lands in the same JSON files + Postgres
+ Chroma — single source of truth, no schema fork.

Source-trail entries carry `extraction_method="agentic_browser"` so audit
queries can attribute which producer found a vendor.
"""

from __future__ import annotations

from crawler.agents import enricher as enricher_agent
from crawler.agents import name_resolver as name_resolver_agent
from crawler.agents import reporter as reporter_agent
from crawler.agents import resolver as resolver_agent
from crawler.observability.logger import get_logger
from crawler.observability.metrics import errors_total
from crawler.schemas import Expo, ExhibitorRef, ExpoSource
from crawler.store.db_reporter import persist_expo_to_db

from .agent import AgentResult, _Exhibitor

_log = get_logger(__name__)


def _to_ref(exh: _Exhibitor, expo_id: str, seed_url: str) -> ExhibitorRef:
    """Map Browser-Use output to ExhibitorRef the existing pipeline expects.

    `country` and any other agent-specific hints land in `short_description`
    so they survive the round-trip through resolver+enricher even though
    ExhibitorRef itself doesn't have a country field.
    """
    desc_parts: list[str] = []
    if exh.description:
        desc_parts.append(exh.description.strip())
    if exh.country:
        desc_parts.append(f"[Country: {exh.country.strip()}]")
    short_desc = " ".join(desc_parts) or None

    # Snowglobe rule 6 (2026-05-25): no provenance. Frontend stopped
    # rendering source_trail / SUMBER tab — keep ref construction lean and
    # don't pretend we have authoritative source confidence per field.
    return ExhibitorRef(
        expo_id=expo_id,
        name=exh.name.strip(),
        raw_url=exh.url,
        booth=exh.booth,
        short_description=short_desc,
        provenance=[],
    )


def _slug(text: str) -> str:
    import re

    s = re.sub(r"[^a-zA-Z0-9\s-]", "", text).strip().lower()
    return re.sub(r"\s+", "-", s)[:80]


async def report_agent_result(seed_url: str, result: AgentResult) -> dict[str, int]:
    """Push every exhibitor through resolver → enricher → reporter.

    Returns counters for telemetry: how many resolved, enriched, deduped,
    rejected. Failures per-row are caught locally so one bad row doesn't
    sink the whole batch.
    """
    counts = {"resolved": 0, "enriched": 0, "dedup_skipped": 0, "rejected": 0, "failed": 0}
    if not result.exhibitors:
        return counts

    # ExhibitorRef.expo_id is required. If the seed didn't specify one, derive
    # a stable slug from the seed name so all exhibitors from the same agent
    # run share the same expo grouping.
    expo_id = result.expo_id or f"agentic-{_slug(result.seed_name)}"

    # Ensure an ExpoORM record exists for this seed so the /api/expos endpoint
    # and expo_vendors join work correctly.
    try:
        expo_obj = Expo(
            expo_id=expo_id,
            name=result.seed_name,
            source=ExpoSource.AGENTIC,
            aggregator_url=seed_url,  # type: ignore[arg-type]
        )
        await persist_expo_to_db(expo_obj, vendor_domains=[])
    except Exception as _e:  # noqa: BLE001
        _log.debug("agentic.expo_persist_failed", expo_id=expo_id, error=str(_e))

    refs = [_to_ref(e, expo_id, seed_url) for e in result.exhibitors]

    for ref in refs:
        try:
            if ref.raw_url:
                vurl = await resolver_agent.resolve_vendor_url(ref)
            else:
                vurl = await name_resolver_agent.resolve_from_name(
                    ref.name,
                    expo_id=ref.expo_id,
                    context_snippet=ref.short_description,
                )
            if vurl is None:
                counts["failed"] += 1
                continue

            # Carry the agentic provenance forward.
            vurl.provenance = list(ref.provenance) + list(vurl.provenance or [])
            counts["resolved"] += 1

            # Run dedup first — same path as the LangGraph worker_enrich node.
            from crawler.agents import dedup as dedup_agent

            if await dedup_agent.check_and_merge(vurl):
                await reporter_agent.merge_existing_with_expo(vurl.domain, vurl.expo_id)
                counts["dedup_skipped"] += 1
                continue

            vendor = await enricher_agent.enrich_vendor(vurl)
            if vendor is None:
                counts["failed"] += 1
                continue
            persisted, reject_cat = await reporter_agent.persist_vendor(vendor)
            if persisted:
                counts["enriched"] += 1
            else:
                counts["rejected"] += 1
                _log.debug("agentic.vendor_rejected", domain=vendor.domain, reason=reject_cat)
        except Exception as e:  # noqa: BLE001
            counts["failed"] += 1
            errors_total.labels(stage="agentic", category="report").inc()
            _log.warning("agentic.report_row_failed", name=ref.name[:80], error=str(e)[:200])

    return counts
