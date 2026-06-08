"""Enrich-pool worker loop.

Why we deliberately don't gate on a hardcoded `must-have-{email,address}`
schema:

  * Phone-only vendors (very common in Asia) get unfairly rejected by an
    "email-required" gate.
  * Wix landing pages with one stale `info@` token email pass an "email-
    required" gate even though they're formality.
  * Both are wrong on opposite ends. A schema gate doesn't capture
    "complete enough to keep" in any robust way.

Self-learning replaces it: the agent's system prompt includes 2-3 success
exemplars and 1-2 formality exemplars (rendered by `enrich_lessons`). The
agent emits a `completeness_score` (0.0-1.0) and an optional `bail_reason`
(`formality | 404 | captcha | image_only`). The worker uses these directly
— no hardcoded thresholds — and lets the operator recalibrate by editing
exemplars in `data/agentic_enrich_lessons/{success,failure}/`.

Concurrency model:
- N parallel async tasks per process (`agentic_enrich_parallel`).
- Each pulls 1 entry per loop via XREADGROUP with block_ms=5000 — no busy
  spin, no thundering herd.
- Per-task `claim()` SET-NX guards against double-delivery (e.g. when
  XAUTOCLAIM redelivers after a crash).
- `acquire_llm_slot("vision")` from Phase 2 caps simultaneous Ollama
  vision calls cluster-wide so the listing pool can't be starved.
"""

from __future__ import annotations

import asyncio
import os
import re
import socket
from typing import Any

_PERSON_NAME_RE = re.compile(
    r"^[A-ZÀ-Ý][a-zà-ÿ]+(?:[-'][A-ZÀ-Ý][a-zà-ÿ]+)?\s+"
    r"(?:[A-ZÀ-Ý]\.?\s+)?"
    r"[A-ZÀ-Ý][a-zà-ÿ]+(?:[-'][A-ZÀ-Ý][a-zà-ÿ]+)?$"
)
_CORP_SUFFIX_KEYWORDS = frozenset({
    "inc", "corp", "ltd", "limited", "llc", "gmbh", "ag", "srl", "sa", "plc",
    "bv", "co", "company", "tech", "technologies", "systems", "solutions",
    "group", "labs", "holdings", "industries", "services", "security",
    "intelligence", "defense", "defence", "software", "energy", "networks",
    "communications", "media", "dynamics", "partners", "aerospace",
    "electronics", "robotics", "telecom", "ventures", "consulting",
    "international", "global", "digital", "platform", "cloud", "data",
    "analytics", "research", "engineering", "automation", "innovations",
    "enterprises", "associates", "manufacturing", "ai", "iot", "cyber",
})


def _looks_like_person_name(name: str) -> bool:
    if not name or len(name) > 50:
        return False
    stripped = name.strip()
    lower_tokens = set(stripped.lower().replace(".", " ").split())
    if lower_tokens & _CORP_SUFFIX_KEYWORDS:
        return False
    if not _PERSON_NAME_RE.match(stripped):
        return False
    return True

from crawler.observability.logger import get_logger
from crawler.observability.metrics import (
    agentic_enrich_inflight,
    agentic_enrich_jina_fast_path_total,
    agentic_enrich_outcomes_total,
)
from crawler.store.redis_queue import claim, release

from . import enrich_queue
from .config import get_agentic_settings
from .enrich_agent import run_enrich_for_task
from .enrich_lessons import invalidate_cache as _invalidate_few_shot_cache
from .enrich_queue import EnrichTask
from .jina_extract import fetch_and_parse_vendor as _jina_fetch_and_parse
from .lessons import archive_lesson, categorize_failure
from .static_scraper import StaticScrapeResult, try_static_scrape

_log = get_logger(__name__)

_SHUTDOWN = asyncio.Event()


def _consumer_id(idx: int) -> str:
    """Stable per-task consumer id so Redis can attribute PEL ownership."""
    host = socket.gethostname()[:24]
    return f"{host}-{os.getpid()}-{idx}"


async def _archive_outcome(
    task: EnrichTask,
    result: Any,
    *,
    status: str,
    failure_category: str | None = None,
    failure_detail: str | None = None,
) -> None:
    """Write the lesson + invalidate the few-shot cache so the next task
    sees fresh exemplars. `result` is an EnrichResult; archive_lesson
    treats it duck-typed (uses .exhibitors, .bail_reason_value via attr)."""
    s = get_agentic_settings()
    # archive_lesson expects `seed.url` and `seed.name`. Build a minimal
    # shim so we don't need to refactor `lessons.py`.

    class _SeedShim:
        def __init__(self, t: EnrichTask) -> None:
            self.name = t.vendor_name
            self.url = t.hint_url or ""
            self.expo_id = t.expo_id
            self.tags = ["agentic_enrich"]
            self.source_query = t.source_query

    seed_shim = _SeedShim(task)
    try:
        await archive_lesson(
            seed=seed_shim,
            agent_result=result,
            elapsed_s=getattr(result, "elapsed_s", 0.0),
            raw_steps=getattr(result, "raw_steps", []) or [],
            status=status,
            failure_category=failure_category,
            failure_detail=failure_detail,
            archive_recordings=False,  # enrich recordings live elsewhere
            lessons_dir=s.enrich_lessons_dir,
        )
    except Exception as e:  # noqa: BLE001
        _log.warning("enrich_worker.archive_failed", error=str(e)[:200])
    _invalidate_few_shot_cache()


_PREWARMED_SESSIONS: dict[int, Any] = {}


def _domain_from_hint_url(hint_url: str | None) -> str | None:
    """Extract bare host from a hint URL ONLY when the URL points at the
    vendor's homepage (path is empty or '/'). Returns None otherwise.

    Listing pool often passes deep aggregator URLs like
    `dimdex.com/exhibitor/YONCA_SHIPYARD` — the host is the expo site,
    not the vendor's, so static-scraping it finds dimdex's contact page
    instead of YONCA's. Static scraper only useful when listing pool
    already discovered the vendor's real homepage.
    """
    if not hint_url:
        return None
    try:
        from urllib.parse import urlparse

        parsed = urlparse(hint_url)
        host = (parsed.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        if not host:
            return None
        # Reject deep paths — listing pool gives us aggregator profile page,
        # not vendor homepage. Path of '' or '/' is acceptable; '/foo/bar'
        # is rejected. The agent (search_vendor) is the path forward for
        # these tasks; PR 4 will re-run static scrape AFTER agent finds
        # the real domain.
        path = parsed.path or "/"
        if path != "/" and path != "":
            return None
        return host
    except Exception:  # noqa: BLE001
        return None


def _vendor_from_static(
    scrape: StaticScrapeResult,
    task: EnrichTask,
    *,
    extraction_method: str = "static_scraper",
) -> Any:
    """Build a `crawler.schemas.Vendor` from a successful static scrape.
    Same shape persist_vendor expects; goes through dedup + translator
    just like an agent-produced vendor.

    `extraction_method` tags the SourceProvenance so downstream consumers
    can distinguish static_scraper vs jina_reader hits.
    """
    from crawler.schemas import ContactPoint, SocialLinks, SourceProvenance, Vendor

    contacts: list[ContactPoint] = []
    for e in scrape.emails:
        contacts.append(ContactPoint(type="email", value=e))
    for p in scrape.phones:
        contacts.append(ContactPoint(type="phone", value=p))

    canonical = f"https://{scrape.domain}/"
    source_tag = (
        "jina_reader" if extraction_method == "jina_reader" else "static_scrape"
    )

    # P3 (iter 12) — populate SocialLinks pydantic model from the dict
    # produced by jina_extract. Empty dict -> default factory keeps the
    # static_scraper path unchanged.
    socials_kwargs: dict[str, object] = {}
    for plat in ("linkedin", "twitter", "facebook", "youtube", "instagram", "github"):
        url = getattr(scrape, "socials", {}).get(plat) if hasattr(scrape, "socials") else None
        if url:
            socials_kwargs[plat] = url  # type: ignore[assignment]
    socials = SocialLinks(**socials_kwargs) if socials_kwargs else SocialLinks()

    # Gate "enriched" on real contact-class signal. Description-only =
    # auto-summary from an LLM that may have hallucinated the blurb from
    # a single SERP snippet; that is NOT enrichment, that is a stub.
    # We keep the vendor (still useful to track that we know the domain
    # exists) but mark it `unresolved` and record gaps so the next pass
    # can re-target it. Frontend UI relies on this to avoid claiming
    # "enriched" on a thin record (see SystemOverview / VendorsListPage).
    has_contacts = bool(contacts)
    has_socials = bool(socials_kwargs)
    has_address = bool(scrape.address)
    has_useful_signal = has_contacts or has_socials or has_address
    enrichment_gap: list[str] = []
    if not has_contacts:
        enrichment_gap.append("contacts")
    if not has_socials:
        enrichment_gap.append("socials")
    if not has_address:
        enrichment_gap.append("address")
    vendor_status = "enriched" if has_useful_signal else "unresolved"

    return Vendor(
        status=vendor_status,
        company_name=task.vendor_name,
        domain=scrape.domain,
        canonical_url=canonical,  # type: ignore[arg-type]
        description=scrape.description,
        contacts=contacts,
        address=scrape.address,
        socials=socials,
        enrichment_gap=enrichment_gap,
        founded_year=getattr(scrape, "founded_year", None),
        employee_count=getattr(scrape, "employee_count", None),
        tech_stack=list(getattr(scrape, "tech_stack", []) or []),
        source_tags=["agentic_enrich", source_tag],
        source_trail=[
            SourceProvenance(
                type="manual",
                url=scrape.source_url,  # type: ignore[arg-type]
                extraction_method=extraction_method,
            )
        ],
        raw_extracts={
            f"{source_tag}_source_url": scrape.source_url,
            f"{source_tag}_country_extracted": scrape.country,
        },
        confidence_score=0.6,  # mid — deterministic but no agent verification
    )


async def _persist_static_scrape_result(
    task: EnrichTask,
    scrape: StaticScrapeResult,
    entry_id: str,
    *,
    extraction_method: str = "static_scraper",
    grounded_extras=None,
) -> None:
    """Persist a static-scrape Vendor through the normal pipeline (dedup
    + translator + reporter). Mirrors the agent-success path but without
    raw_steps / lesson archive (we still archive a minimal lesson so the
    success rate metric reflects this path).

    grounded_extras (optional GroundedVendorSummary) augments the static
    Vendor with products/industries/founded/employee_count extracted via
    Gemini grounded summarize call. Catalog gap closer.
    """
    from crawler.agents import dedup as dedup_agent
    from crawler.agents import reporter as reporter_agent
    from crawler.schemas import VendorURL

    v = _vendor_from_static(scrape, task, extraction_method=extraction_method)

    # Merge grounded extras when present. Static scrape never has products
    # (regex can't infer them), so grounded fill = catalog comes alive.
    if grounded_extras is not None:
        if grounded_extras.products:
            seen = {p.lower() for p in (v.products or [])}
            for p in grounded_extras.products:
                if p and p.lower() not in seen:
                    v.products.append(p)
                    seen.add(p.lower())
        if grounded_extras.industries:
            seen_i = {i.lower() for i in (v.industries or [])}
            for i in grounded_extras.industries:
                if i and i.lower() not in seen_i:
                    v.industries.append(i)
                    seen_i.add(i.lower())
        if not v.description and grounded_extras.description:
            v.description = grounded_extras.description
        if not v.founded_year and grounded_extras.founded_year:
            v.founded_year = grounded_extras.founded_year
        if not v.employee_count and grounded_extras.employee_count:
            v.employee_count = grounded_extras.employee_count
        # Catalog now considered filled — drop from enrichment_gap.
        if v.products and "products" in v.enrichment_gap:
            v.enrichment_gap = [g for g in v.enrichment_gap if g != "products"]
        if "source:gemini_grounded" not in v.source_tags:
            v.source_tags.append("source:gemini_grounded")
    try:
        vurl = VendorURL(
            canonical_url=str(v.canonical_url),
            domain=v.domain,
            expo_id=task.expo_id,
            exhibitor_name=task.vendor_name,
            resolved_from=task.hint_url,
        )
        is_dup = await dedup_agent.check_and_merge(vurl)
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_worker.static_dedup_failed", error=str(e)[:120])
        is_dup = False

    if is_dup:
        try:
            await reporter_agent.merge_existing_with_expo(v.domain, task.expo_id)
        except Exception:  # noqa: BLE001
            pass
        try:
            agentic_enrich_outcomes_total.labels(status="dedup_skipped").inc()
        except Exception:  # noqa: BLE001
            pass
        _log.info(
            "enrich_worker.static_pre_pass_dedup",
            vendor=task.vendor_name[:80], domain=v.domain,
        )
        return

    try:
        from .translator import translate_vendor_inplace
        await translate_vendor_inplace(v)
    except Exception as _e:  # noqa: BLE001
        _log.debug("enrich_worker.static_translate_skipped", error=str(_e)[:120])

    try:
        persisted, reject_cat = await reporter_agent.persist_vendor(v)
    except Exception as e:  # noqa: BLE001
        _log.warning("enrich_worker.static_persist_failed", error=str(e)[:200])
        try:
            agentic_enrich_outcomes_total.labels(status="error").inc()
        except Exception:  # noqa: BLE001
            pass
        return

    if persisted:
        try:
            agentic_enrich_outcomes_total.labels(status="success").inc()
        except Exception:  # noqa: BLE001
            pass
        _log.info(
            "enrich_worker.static_pre_pass_persisted",
            vendor=task.vendor_name[:80], domain=v.domain,
            source_url=scrape.source_url,
            emails=len(scrape.emails), phones=len(scrape.phones),
        )
        # Snowglobe Phase 2 toast: fire the success-feed event for the
        # Jina/static fast-path persist (the BU path has its own publish
        # at line ~1240; this is the high-volume happy path).
        try:
            from .enrich_success_feed import publish_success
            await publish_success(
                vendor_id=v.vendor_id,
                company_name=v.company_name,
                domain=v.domain,
                scope_match_score=v.scope_match_score,
                enrichment_completeness=v.enrichment_completeness,
                catalog_count=v.catalog_count,
                has_email=v.has_email,
                has_phone=v.has_phone,
            )
        except Exception as _e:  # noqa: BLE001
            _log.debug("enrich_worker.success_feed_static_publish_skipped", error=str(_e)[:120])
        await _index_specialty_safe(v)
    else:
        try:
            agentic_enrich_outcomes_total.labels(status=reject_cat or "rejected").inc()
        except Exception:  # noqa: BLE001
            pass
        _log.info(
            "enrich_worker.static_pre_pass_rejected",
            vendor=task.vendor_name[:80], category=reject_cat,
        )


async def _resolve_domain_via_search(task: EnrichTask) -> str | None:
    """F3 resolve hop. Vendor task arrived with hint_url pointing at an
    expo/aggregator catalog page (path.rsaconference.com/<slug>/profile
    style). Call name_resolver.resolve_from_name to get the real vendor
    homepage, then return the bare host so caller can re-invoke Jina
    fast path with the resolved domain.

    Tier 0 (2026-05-21 quantity pivot): try OpenRouter deep-research
    resolver first when OPENROUTER_API_KEY is set. One LLM call with
    server-side search backends, 3-8s vs 30-50s for the engine fanout.
    On miss or unavailable, fall through to the existing chain.

    Best-effort with 30s ceiling — fall back to None on any failure;
    caller will continue to browser_use tier-3 fallback path.
    """
    # Tier 0a — Jina Search (s.jina.ai). Paid tier, ~200 RPM, returns top
    # URLs + content snippets. Fastest path when company name is reasonably
    # unique. Pick first hit that isn't an aggregator domain.
    try:
        from crawler.tools.browsers.jina_search import search as jina_web_search

        from .tools import _AGGREGATOR_TLDS, _registrable_domain

        country = getattr(task, "country_hint", None)
        gl = None
        if country and len(country) >= 2:
            gl = country[:2].lower() if country.isascii() else None
        hits = await jina_web_search(
            task.vendor_name,
            num=5,
            geo_country=gl,
            fast_no_content=True,
            timeout_seconds=12,
        )
        for hit in hits:
            try:
                from urllib.parse import urlparse

                host = (urlparse(hit.url).hostname or "").lower()
                if host.startswith("www."):
                    host = host[4:]
                if not host or "." not in host:
                    continue
                if _registrable_domain(f"https://{host}/") in _AGGREGATOR_TLDS:
                    continue
                # Sanity: vendor name token should appear in title or content
                name_tokens = [
                    t.lower() for t in task.vendor_name.split()
                    if len(t) >= 4
                ]
                hit_blob = (hit.title + " " + hit.content).lower()
                if name_tokens and not any(t in hit_blob for t in name_tokens):
                    continue
                _log.info(
                    "enrich_worker.jina_search_tier0_hit",
                    vendor=task.vendor_name[:60], domain=host,
                )
                return host
            except Exception:  # noqa: BLE001
                continue
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_worker.jina_search_tier0_failed", error=str(e)[:120])

    # Tier 0b — Gemini grounded resolve (google_search tool). Cheap and
    # leverages Google's index for niche vendors that Jina ranks poorly.
    try:
        from .gemini_grounded import resolve_vendor_domain_grounded

        s_tier0g = get_agentic_settings()
        if s_tier0g.google_api_key:
            gm_domain, gm_conf = await resolve_vendor_domain_grounded(
                task.vendor_name,
                country_hint=getattr(task, "country_hint", None),
                product_hint=getattr(task, "product_hint", None),
            )
            if gm_domain and gm_conf in {"high", "medium"}:
                return gm_domain
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_worker.gemini_grounded_tier0_failed", error=str(e)[:120])

    # Tier 0c — deep-research call (OpenRouter). Skip silently if no key.
    try:
        from .domain_resolver_grounding import resolve_via_deep_research

        s_tier0 = get_agentic_settings()
        if s_tier0.openrouter_api_key:
            dr_domain = await resolve_via_deep_research(
                task.vendor_name,
                country_hint=getattr(task, "country_hint", None),
                product_hint=getattr(task, "product_hint", None),
            )
            if dr_domain:
                return dr_domain
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_worker.deep_research_tier0_failed", error=str(e)[:120])

    try:
        from crawler.agents.name_resolver import resolve_from_name
        from crawler.tools.search.multi import FAST_RESOLVE_ENGINES
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_worker.resolve_hop_import_failed", error=str(e)[:120])
        return None
    s = get_agentic_settings()
    per_src = int(getattr(s, "enrich_resolve_hop_per_source_limit", 3))
    try:
        resolved = await asyncio.wait_for(
            resolve_from_name(
                task.vendor_name,
                expo_id=getattr(task, "expo_id", "") or "",
                engines=FAST_RESOLVE_ENGINES,
                per_source_limit=per_src,
            ),
            timeout=int(getattr(s, "enrich_jina_resolve_hop_timeout_s", 20)),
        )
    except asyncio.TimeoutError:
        _log.info(
            "enrich_worker.resolve_hop_timeout",
            vendor=task.vendor_name[:60],
        )
        return None
    except Exception as e:  # noqa: BLE001
        _log.debug(
            "enrich_worker.resolve_hop_error",
            vendor=task.vendor_name[:60], error=str(e)[:160],
        )
        return None
    if not resolved or not getattr(resolved, "domain", None):
        return None
    dom = resolved.domain.lower()
    if dom.startswith("www."):
        dom = dom[4:]
    try:
        from .tools import _AGGREGATOR_TLDS, _registrable_domain

        if _registrable_domain(f"https://{dom}/") in _AGGREGATOR_TLDS:
            _log.debug(
                "enrich_worker.resolve_hop_returned_aggregator",
                vendor=task.vendor_name[:60], domain=dom,
            )
            return None
    except Exception:  # noqa: BLE001
        pass
    return dom


async def _try_jina_fast_path(
    task: EnrichTask,
) -> tuple[StaticScrapeResult | None, float]:
    """S1 Jina Reader fast-path. Returns (result, score). result is None
    when disabled, host is aggregator, hint URL is not a homepage, or
    Jina returns no usable signal."""
    s = get_agentic_settings()
    if not getattr(s, "enrich_jina_fast_path_enabled", True):
        try:
            agentic_enrich_jina_fast_path_total.labels(outcome="disabled").inc()
        except Exception:  # noqa: BLE001
            pass
        return (None, 0.0)
    domain = _domain_from_hint_url(task.hint_url)
    if not domain:
        try:
            agentic_enrich_jina_fast_path_total.labels(outcome="no_domain").inc()
        except Exception:  # noqa: BLE001
            pass
        _log.debug(
            "enrich_worker.jina_fast_path_skip_no_domain",
            vendor=task.vendor_name[:60],
            hint_url=(task.hint_url or "")[:120],
        )
        if getattr(s, "enrich_jina_resolve_hop_enabled", True):
            domain = await _resolve_domain_via_search(task)
            if domain:
                try:
                    agentic_enrich_jina_fast_path_total.labels(outcome="resolved").inc()
                except Exception:  # noqa: BLE001
                    pass
                _log.info(
                    "enrich_worker.jina_fast_path_resolved_domain",
                    vendor=task.vendor_name[:60], resolved=domain,
                )
            else:
                return (None, 0.0)
        else:
            return (None, 0.0)
    try:
        from .tools import _AGGREGATOR_TLDS, _registrable_domain

        if _registrable_domain(f"https://{domain}/") in _AGGREGATOR_TLDS:
            _log.debug(
                "enrich_worker.jina_fast_path_skip_aggregator",
                domain=domain, vendor=task.vendor_name[:60],
            )
            try:
                agentic_enrich_jina_fast_path_total.labels(outcome="skipped").inc()
            except Exception:  # noqa: BLE001
                pass
            return (None, 0.0)
    except ImportError:
        pass

    paths = tuple(
        getattr(s, "enrich_jina_paths", ("/", "/about", "/contact", "/contact-us"))
    )
    max_conc = int(getattr(s, "enrich_jina_max_concurrent_fetches", 5))
    timeout = int(getattr(s, "enrich_jina_fetch_timeout_s", 25))
    try:
        return await _jina_fetch_and_parse(
            f"https://{domain}/", task.vendor_name,
            paths=paths,
            max_concurrent=max_conc,
            fetch_timeout_s=timeout,
        )
    except Exception as e:  # noqa: BLE001
        _log.debug(
            "enrich_worker.jina_fast_path_error",
            vendor=task.vendor_name[:80], error=str(e)[:160],
        )
        try:
            agentic_enrich_jina_fast_path_total.labels(outcome="error").inc()
        except Exception:  # noqa: BLE001
            pass
        return (None, 0.0)


async def _try_static_pre_pass(task: EnrichTask) -> StaticScrapeResult | None:
    """Phase 4 PR 3 — attempt deterministic HTTP scrape before spawning
    Browser-Use. Returns scrape result on hit, None on miss/disabled.

    Skips when hint_url points at an aggregator (dimdex.com style listing
    pages) — static-scraping an aggregator finds the directory's contact
    page, not the vendor's. For aggregator-only vendors the agent must
    search_vendor first to discover the real domain."""
    s = get_agentic_settings()
    if not getattr(s, "enrich_static_pre_pass_enabled", True):
        return None
    domain = _domain_from_hint_url(task.hint_url)
    if not domain:
        return None
    # Defense: don't waste HTTP probes on aggregators. Reuse the same
    # blocklist `search_vendor` uses code-side (PR 5).
    try:
        from .tools import _AGGREGATOR_TLDS, _registrable_domain

        if _registrable_domain(f"https://{domain}/") in _AGGREGATOR_TLDS:
            _log.debug(
                "enrich_worker.static_pre_pass_skip_aggregator",
                domain=domain, vendor=task.vendor_name[:60],
            )
            return None
    except ImportError:
        pass
    try:
        return await try_static_scrape(domain, task.vendor_name)
    except Exception as e:  # noqa: BLE001
        _log.debug(
            "enrich_worker.static_pre_pass_error",
            vendor=task.vendor_name[:80], error=str(e)[:160],
        )
        return None


_OLLAMA_PROBE_CACHE: dict[str, tuple[float, bool]] = {}


async def _index_specialty_safe(vendor: Any) -> None:
    """Fire-and-forget upsert into the Chroma `vendor_specialty` collection.

    Called post-commit so an embed failure (Ollama down, ChromaDB hiccup)
    NEVER rolls back the DB write. The semantic search endpoint degrades
    to lexical when this collection is stale, so missing one entry is not
    fatal — but the live hook is what keeps it from being permanently
    catchup-only.
    """
    try:
        if vendor is None or not getattr(vendor, "vendor_id", None):
            return
        from crawler.store.specialty_index import add_specialty

        addr = getattr(vendor, "address", None)
        country = None
        if addr is not None:
            country = getattr(addr, "country", None) or (
                addr.get("country") if isinstance(addr, dict) else None
            )
        await add_specialty(
            vendor_id=str(vendor.vendor_id),
            company_name=getattr(vendor, "company_name", "") or "",
            domain=getattr(vendor, "domain", None),
            products=list(getattr(vendor, "products", None) or []),
            industries=list(getattr(vendor, "industries", None) or []),
            description=getattr(vendor, "description", None),
            domain_of_interest=list(getattr(vendor, "domain_of_interest", None) or []),
            country=country,
        )
    except Exception as e:  # noqa: BLE001
        _log.debug(
            "enrich_worker.specialty_index_failed",
            vendor_id=getattr(vendor, "vendor_id", None),
            error=str(e)[:160],
        )


async def _probe_ollama_alive(ttl_seconds: int = 60) -> bool:
    """Cheap probe: HEAD/GET on /api/version. Cached for ttl_seconds so
    parallel workers don't spam the daemon. Used to gate Browser Use
    fallback when VPN to Ollama host is down."""
    import time as _t

    s = get_agentic_settings()
    base = s.llm_base_url.rstrip("/")
    now = _t.monotonic()
    cached = _OLLAMA_PROBE_CACHE.get(base)
    if cached and (now - cached[0]) < ttl_seconds:
        return cached[1]
    import httpx as _hx

    try:
        async with _hx.AsyncClient(timeout=_hx.Timeout(3.0, connect=2.0)) as c:
            r = await c.get(f"{base}/api/version")
            alive = r.status_code == 200
    except Exception:  # noqa: BLE001
        alive = False
    _OLLAMA_PROBE_CACHE[base] = (now, alive)
    return alive


async def _persist_grounded_summary(
    task: EnrichTask,
    summary,
    entry_id: str,
) -> None:
    """Persist a vendor row built from Gemini grounded extraction. Used as
    a fast-path fallback when static scrape returned no contacts but the
    company is well-known enough on the public web for Gemini to summarize.
    """
    from crawler.agents import reporter as reporter_agent
    from crawler.schemas import ContactPoint, Vendor

    try:
        contacts = []
        if summary.primary_email:
            contacts.append(ContactPoint(
                type="email", value=summary.primary_email, verified=False,
            ))
        if summary.primary_phone:
            contacts.append(ContactPoint(
                type="phone", value=summary.primary_phone, verified=False,
            ))
        gaps = ["socials", "address"]
        if not contacts:
            gaps.insert(0, "contacts")
        domain = (task.hint_url or "").lower().replace("https://", "").replace("http://", "").strip("/")
        if "/" in domain:
            domain = domain.split("/", 1)[0]
        if not domain or "." not in domain:
            domain = None
        vendor = Vendor(
            status="enriched" if contacts else "unresolved",
            domain=domain,
            company_name=task.vendor_name,
            description=summary.description,
            products=summary.products or [],
            industries=summary.industries or [],
            employee_count=summary.employee_count,
            founded_year=summary.founded_year,
            contacts=contacts,
            confidence_score=0.55 if contacts else 0.35,
            enrichment_gap=gaps,
            source_tags=["source:gemini_grounded", f"expo:{task.expo_id}"],
            expos_seen=[task.expo_id] if task.expo_id else [],
        )
        await reporter_agent.persist_vendor(vendor)
        await _index_specialty_safe(vendor)
        _log.info(
            "enrich_worker.gemini_grounded_persisted",
            vendor=task.vendor_name[:60],
            has_contacts=bool(contacts),
        )
        try:
            agentic_enrich_outcomes_total.labels(status="grounded_extract").inc()
        except Exception:  # noqa: BLE001
            pass
        await enrich_queue.ack(entry_id)
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "enrich_worker.grounded_persist_failed",
            vendor=task.vendor_name[:60], error=str(e)[:160],
        )


async def _persist_unresolved_fallback(task: EnrichTask, category: str) -> None:
    """When enrich agent fails (parse_failed / formality / Browser-Use bug
    / etc.) persist the listing-provided ref data anyway. Frontend gets
    the row with name + country + product hint — operator can deepen
    later via the API.
    """
    try:
        from crawler.agents import reporter as reporter_agent
        from crawler.schemas import ExhibitorRef

        # Country hint goes into short_description so it surfaces in the
        # frontend row (ExhibitorRef has no country field).
        desc_parts = [task.product_hint, task.country_hint]
        desc = " | ".join(p for p in desc_parts if p) or None
        ref = ExhibitorRef(
            expo_id=task.expo_id or "",
            name=task.vendor_name,
            raw_url=task.hint_url,
            aggregator_domain=None,
            short_description=desc,
            booth=None,
        )
        ok = await reporter_agent.persist_unresolved_vendor(
            ref, failure_category=f"enrich_{category}"
        )
        _log.info(
            "enrich_worker.fallback_unresolved_persisted",
            vendor=task.vendor_name[:80],
            category=category,
            persisted=ok,
        )
    except Exception as _e:  # noqa: BLE001
        _log.warning(
            "enrich_worker.fallback_persist_failed",
            vendor=task.vendor_name[:80],
            error=str(_e)[:200],
        )


async def _process_one(
    consumer_id: str,
    entry_id: str,
    task: EnrichTask,
    *,
    consumer_idx: int = 0,
) -> None:
    """Run one task end-to-end: claim → agent → dedup → persist → ack."""
    s = get_agentic_settings()
    # Idempotency guard. If a redelivery (XAUTOCLAIM) of an already-handled
    # task slips through, the second worker sees the claim and skips.
    if not await claim(task.task_id, ttl_seconds=3600):
        _log.info(
            "enrich_worker.task_already_claimed",
            vendor=task.vendor_name[:80], task_id=task.task_id,
        )
        try:
            await enrich_queue.ack(entry_id)
        except Exception:  # noqa: BLE001
            pass
        return

    try:
        agentic_enrich_inflight.labels(worker_id=consumer_id).inc()
    except Exception:  # noqa: BLE001
        pass

    _log.info(
        "enrich_worker.task_started",
        vendor=task.vendor_name[:80], expo_id=task.expo_id,
        consumer=consumer_id,
    )

    # Name-quality short-circuit. Defensive layer for pre-filter queue
    # leftovers. Catches "VK", "Privacy Statement", "AI & Big Data",
    # "S4x26 Videos", "About Us" etc that slipped past the runner-side
    # filter or were enqueued before the filter shipped.
    from .jina_listing import _looks_like_org as _name_ok
    if not _name_ok(task.vendor_name):
        _log.info(
            "enrich_worker.name_rejected",
            vendor=task.vendor_name[:80],
            expo_id=task.expo_id,
        )
        try:
            await enrich_queue.ack(entry_id)
        except Exception:  # noqa: BLE001
            pass
        try:
            agentic_enrich_outcomes_total.labels(status="name_rejected").inc()
            agentic_enrich_inflight.labels(worker_id=consumer_id).dec()
        except Exception:  # noqa: BLE001
            pass
        return

    # Snowglobe rule 1 (2026-05-25): hard URL dedup BEFORE running the
    # Browser-Use vision agent. Enrich pool also uses vision (enrich_agent.py)
    # so wasting 5+ minutes re-researching a vendor we already enriched is
    # the main expense to eliminate. Probes both Postgres canonical_url and
    # the Chroma vendor store for the task's hint_url.
    if task.hint_url:
        try:
            from .dedup import url_already_reached

            if await url_already_reached(task.hint_url):
                _log.info(
                    "enrich_worker.url_already_reached",
                    vendor=task.vendor_name[:80], hint=task.hint_url,
                )
                try:
                    await enrich_queue.ack(entry_id)
                except Exception:  # noqa: BLE001
                    pass
                try:
                    agentic_enrich_outcomes_total.labels(status="dedup_skipped").inc()
                    agentic_enrich_inflight.labels(worker_id=consumer_id).dec()
                except Exception:  # noqa: BLE001
                    pass
                return
        except Exception as _e:  # noqa: BLE001
            _log.debug("enrich_worker.url_dedup_check_failed", error=str(_e)[:160])

    # Snowglobe rule 2/3 — light classifier pre-hint. If the vendor name +
    # product hint already contains military taxonomy keywords we log the
    # match so the operator can audit pre-vision scope intent. We do NOT
    # hard-reject here because a generic name like "Acme Corp" can still
    # be a defense vendor — only the post-enrich classifier (scope_gate)
    # has enough context to reject for real.
    try:
        from tools.skills import military_classifier as _mc

        prehint_text = " ".join([
            task.vendor_name or "",
            task.product_hint or "",
            (task.hint_url or "").lower(),
        ])
        prehint = _mc.classify(prehint_text)
        if prehint.is_military:
            _log.info(
                "enrich_worker.scope_prehint_military",
                vendor=task.vendor_name[:80],
                cats=list(prehint.matched_categories),
                score=round(prehint.score, 3),
            )
    except Exception as _e:  # noqa: BLE001
        _log.debug("enrich_worker.scope_prehint_failed", error=str(_e)[:160])

    # Person-name short-circuit. Listing agent sometimes mis-extracts
    # speaker/attendee profiles as exhibitors. Reject before any LLM or
    # Browser-Use work so we don't burn ~4 minutes per false positive.
    # Conservative: only fires when the name matches a person-shaped
    # pattern AND no corp suffix keyword is present.
    if _looks_like_person_name(task.vendor_name):
        _log.info(
            "enrich_worker.person_name_rejected",
            vendor=task.vendor_name[:80],
            expo_id=task.expo_id,
        )
        try:
            await _persist_unresolved_fallback(task, "person_name_rejected")
        except Exception:  # noqa: BLE001
            pass
        try:
            await enrich_queue.ack(entry_id)
        except Exception:  # noqa: BLE001
            pass
        try:
            agentic_enrich_outcomes_total.labels(status="person_rejected").inc()
            agentic_enrich_inflight.labels(worker_id=consumer_id).dec()
        except Exception:  # noqa: BLE001
            pass
        return

    # Snowglobe Phase 2 — bring-back wave bypass. When force_vision is set,
    # skip Jina/static/Gemini fast-paths AND the "always skip browser"
    # killswitch and route straight to the Browser-Use vision agent. Used by
    # restore_hidden_for_reenrich.py so 22K previously-hidden vendors get a
    # real scrape instead of another seed-only classification.
    #
    # 2026-05-26: yield to global Jina fast-path setting. If the operator
    # has enabled Jina (AGENTIC_ENRICH_JINA_FAST_PATH=true), they've chosen
    # throughput priority — force_vision is honored only when Jina is OFF.
    _jina_globally_on = bool(getattr(s, "enrich_jina_fast_path_enabled", True))
    _forced_vision = bool(getattr(task, "force_vision", False)) and not _jina_globally_on

    try:
        # S1 Jina Reader fast-path. Tries r.jina.ai/{url} for homepage +
        # 3 contact sub-paths in parallel. If markdown carries email/phone
        # plus vendor-name signal above the full threshold, skip everything
        # downstream. Median ~10-15s per vendor vs 180-400s for Browser-Use.
        jina_scrape, jina_score = (None, 0.0) if _forced_vision else await _try_jina_fast_path(task)
        s_full = float(
            getattr(s, "enrich_jina_score_threshold_full", 0.6)
        )
        if jina_scrape is not None and jina_scrape.has_contact and jina_score >= s_full:
            _log.info(
                "enrich_worker.jina_fast_path_hit",
                vendor=task.vendor_name[:80], domain=jina_scrape.domain,
                score=jina_score,
                emails=len(jina_scrape.emails), phones=len(jina_scrape.phones),
            )
            try:
                agentic_enrich_jina_fast_path_total.labels(outcome="hit").inc()
            except Exception:  # noqa: BLE001
                pass
            try:
                from .agent_trace_publisher import publish_trace
                publish_trace(
                    kind="jina_hit",
                    agent="jina-reader",
                    verdict="success",
                    text=(
                        f"{task.vendor_name[:50]} @ {jina_scrape.domain} -> "
                        f"{len(jina_scrape.emails)} email, "
                        f"{len(jina_scrape.phones)} phone (score {jina_score:.2f})"
                    ),
                )
            except Exception:  # noqa: BLE001
                pass
            # Quantity pivot 2026-05-21 — also fire Gemini grounded extract
            # to fill products/industries/employee/founded that Jina regex
            # cannot infer. Best-effort: if Gemini misses, persist with just
            # static scrape result; user can deepen later.
            grounded_extras = None
            try:
                from .agent_trace_publisher import publish_trace
                from .vendor_extract import extract_vendor_summary as extract_vendor_summary_grounded
                _s_jx = get_agentic_settings()
                if _s_jx.extract_via_llm:
                    grounded_extras = await extract_vendor_summary_grounded(
                        task.vendor_name, jina_scrape.domain,
                    )
                    if grounded_extras:
                        publish_trace(
                            kind="grounded_extract",
                            agent="gemini-catalog",
                            verdict="success" if (grounded_extras.products or grounded_extras.description) else "fail",
                            text=(
                                f"{task.vendor_name[:50]} -> "
                                f"{len(grounded_extras.products)} products, "
                                f"{len(grounded_extras.industries)} industries"
                            ),
                        )
            except Exception as _e:  # noqa: BLE001
                _log.debug("enrich_worker.grounded_catalog_skip", error=str(_e)[:120])
            await _persist_static_scrape_result(
                task, jina_scrape, entry_id,
                extraction_method="jina_reader",
                grounded_extras=grounded_extras,
            )
            return
        if jina_scrape is not None and jina_scrape.has_contact:
            # Partial signal — keep going through static + agent pipeline,
            # downstream may merge for better completeness.
            try:
                agentic_enrich_jina_fast_path_total.labels(outcome="partial").inc()
            except Exception:  # noqa: BLE001
                pass
            _log.info(
                "enrich_worker.jina_fast_path_partial",
                vendor=task.vendor_name[:80], score=jina_score,
            )
        else:
            try:
                agentic_enrich_jina_fast_path_total.labels(outcome="miss").inc()
            except Exception:  # noqa: BLE001
                pass

        # Phase 4 PR 3 — Static-scraper pre-pass. ~3-15s per call. If we
        # extract email or phone via deterministic HTTP, build a Vendor
        # directly and skip Browser-Use entirely. Saves ~4 minutes/vendor
        # for the 30-40% of domains with static contact pages.
        # Snowglobe Phase 2: bypass when force_vision wants a real vision scrape.
        static_scrape = None if _forced_vision else await _try_static_pre_pass(task)
        if static_scrape is not None and static_scrape.has_contact:
            # Quantity pivot 2026-05-21 — also fire Gemini grounded extract
            # for catalog/products/industries on static-scrape success path.
            # Without this, static-only vendors persist with empty products
            # array and operator sees "katalog kosong" in UI.
            static_grounded_extras = None
            try:
                from .agent_trace_publisher import publish_trace
                from .vendor_extract import extract_vendor_summary as extract_vendor_summary_grounded
                _s_extract = get_agentic_settings()
                if _s_extract.extract_via_llm:
                    static_grounded_extras = await extract_vendor_summary_grounded(
                        task.vendor_name, static_scrape.domain,
                    )
                    if static_grounded_extras:
                        publish_trace(
                            kind="grounded_extract",
                            agent="gemini-catalog",
                            verdict="success" if (static_grounded_extras.products or static_grounded_extras.description) else "fail",
                            text=(
                                f"{task.vendor_name[:50]} (static) -> "
                                f"{len(static_grounded_extras.products)} products, "
                                f"{len(static_grounded_extras.industries)} industries"
                            ),
                        )
            except Exception as _e:  # noqa: BLE001
                _log.debug("enrich_worker.grounded_catalog_static_skip", error=str(_e)[:120])
            await _persist_static_scrape_result(
                task, static_scrape, entry_id,
                grounded_extras=static_grounded_extras,
            )
            return

        # Quantity pivot 2026-05-21 — Gemini grounded extract as soft fallback
        # before Browser Use. Cheaper, no Ollama needed, often enough for
        # well-known companies. Skip if no Google key or vendor unknown.
        s_grounded = get_agentic_settings()
        if not _forced_vision and s_grounded.extract_via_llm and task.vendor_name:
            try:
                from .vendor_extract import extract_vendor_summary as extract_vendor_summary_grounded

                grounded_summary = await extract_vendor_summary_grounded(
                    task.vendor_name,
                    task.hint_url or "",
                )
                if grounded_summary and (grounded_summary.primary_email or grounded_summary.description):
                    await _persist_grounded_summary(task, grounded_summary, entry_id)
                    return
            except Exception as e:  # noqa: BLE001
                _log.debug("enrich_worker.gemini_grounded_extract_skip", error=str(e)[:120])

        # Quantity pivot — gate Browser Use fallback behind Ollama probe.
        # If Ollama unreachable, skip browser path entirely and persist as
        # unresolved-with-partial so the user can re-enrich later when LLM
        # is back. Prevents queue backup during VPN outages.
        # 2026-05-22 tick: even when Ollama up, skip Browser Use because
        # Chromium Cloudflare/SSL/DNS retries burn 30-60s per vendor with
        # 5% success rate. Static scrape + Ollama extract covers same
        # ground in 3-8s per vendor. Set flag to always skip.
        # Snowglobe Phase 2: when force_vision is set we want the browser
        # path NO MATTER WHAT — bypass the "always skip browser" killswitch.
        # The killswitch was added because the default fast-path covers most
        # ground for ordinary SERP-driven enqueues, but the bring-back wave
        # needs the vision agent specifically so the operator gets real
        # scraped haystack on the 22K hidden vendors. Ollama vision model is
        # pre-warmed in run_workers_forever; assume reachable.
        if s_grounded.enrich_skip_browser_when_ollama_down:
            # 2026-05-26 (Snowglobe Phase 2): lifted the `or True` killswitch.
            # Ollama is now dual-GPU + warm-model + 6-parallel — the Cloudflare/
            # SSL/DNS retry pain that motivated the 05-22 always-skip is moot.
            # User instruction: vision agent MUST be used for enrichment fallback,
            # never just skip silently. Only bail when daemon is actually down.
            ollama_alive = await _probe_ollama_alive()
            if not ollama_alive:
                _log.info(
                    "enrich_worker.skip_browser_ollama_down",
                    vendor=task.vendor_name[:60],
                )
                await _persist_unresolved_fallback(task, "ollama_unavailable")
                try:
                    agentic_enrich_outcomes_total.labels(status="ollama_unavailable").inc()
                except Exception:  # noqa: BLE001
                    pass
                await enrich_queue.ack(entry_id)
                return

        prewarmed = _PREWARMED_SESSIONS.get(consumer_idx)
        result = await run_enrich_for_task(task, prewarmed_session=prewarmed)

        # Outcome routing — purely from agent self-judgment, no gate.
        if result.bail_reason and not result.vendor:
            cat = (
                "formality" if result.bail_reason == "formality"
                else result.bail_reason
            )
            await _archive_outcome(
                task, result,
                status="failure", failure_category=cat,
                failure_detail=result.error,
            )
            try:
                agentic_enrich_outcomes_total.labels(status=cat).inc()
            except Exception:  # noqa: BLE001
                pass
            # Fallback persist with what listing pool already gave us
            # (name + country + product hint). Same as the vendor=None
            # branch below — even a bailed enrich shouldn't lose the
            # listing-provided ref. Operator can manually deepen via
            # /vendors/{id}/deepen later.
            await _persist_unresolved_fallback(task, cat)
            return

        if result.vendor is None:
            # No bail but no vendor either — parse fail, schema invalid, etc.
            cat = result.bail_reason or "empty_result"
            await _archive_outcome(
                task, result,
                status="failure", failure_category=cat,
                failure_detail=result.error,
            )
            try:
                agentic_enrich_outcomes_total.labels(status="error").inc()
            except Exception:  # noqa: BLE001
                pass
            await _persist_unresolved_fallback(task, cat)
            return

        # Chroma vendor dedup before persist — same gate the deterministic
        # path runs. We synthesise a minimal VendorURL for the dedup call.
        from crawler.agents import dedup as dedup_agent
        from crawler.agents import reporter as reporter_agent
        from crawler.schemas import VendorURL

        v = result.vendor
        vurl: Any = None
        if v.domain and v.canonical_url:
            try:
                vurl = VendorURL(
                    canonical_url=str(v.canonical_url),
                    domain=v.domain,
                    expo_id=task.expo_id,
                    exhibitor_name=task.vendor_name,
                    resolved_from=task.hint_url,
                )
            except Exception as e:  # noqa: BLE001
                _log.debug("enrich_worker.vendor_url_build_failed", error=str(e)[:120])
                vurl = None

        if vurl is not None:
            try:
                is_dup = await dedup_agent.check_and_merge(vurl)
            except Exception as e:  # noqa: BLE001
                _log.debug("enrich_worker.dedup_failed", error=str(e)[:120])
                is_dup = False
            if is_dup:
                try:
                    await reporter_agent.merge_existing_with_expo(v.domain, task.expo_id)
                except Exception:  # noqa: BLE001
                    pass
                await _archive_outcome(
                    task, result,
                    status="failure", failure_category="dedup_skipped",
                    failure_detail=f"vendor {v.domain} already in store",
                )
                try:
                    agentic_enrich_outcomes_total.labels(status="dedup_skipped").inc()
                except Exception:  # noqa: BLE001
                    pass
                return

        # Phase 3.x: translate description/tagline/products EN → ID via the
        # already-loaded vision LLM. Reuses Ollama compute, no extra VRAM.
        # Idempotent + fail-soft: errors leave English text intact.
        try:
            from .translator import translate_vendor_inplace

            await translate_vendor_inplace(v)
        except Exception as _e:  # noqa: BLE001
            _log.debug("enrich_worker.translate_skipped", error=str(_e)[:120])

        # Snowglobe reset (rule 2/3/4/6, 2026-05-25): classify against
        # military taxonomy + extract real contacts deterministically + probe
        # catalog signals before persist. Off-scope vendors land hidden.
        try:
            from .scope_gate import apply_scope_and_signals, should_enqueue_catalog_backfill

            apply_scope_and_signals(v)
            _enqueue_catalog = should_enqueue_catalog_backfill(v)
        except Exception as _e:  # noqa: BLE001
            _log.warning("enrich_worker.scope_gate_failed", error=str(_e)[:200])
            _enqueue_catalog = False

        try:
            persisted, reject_cat = await reporter_agent.persist_vendor(v)
        except Exception as e:  # noqa: BLE001
            _log.warning("enrich_worker.persist_failed", error=str(e)[:200])
            await _archive_outcome(
                task, result,
                status="failure", failure_category="persist_error",
                failure_detail=str(e)[:300],
            )
            try:
                agentic_enrich_outcomes_total.labels(status="error").inc()
            except Exception:  # noqa: BLE001
                pass
            return

        if persisted:
            await _archive_outcome(task, result, status="success")
            try:
                agentic_enrich_outcomes_total.labels(status="success").inc()
            except Exception:  # noqa: BLE001
                pass
            _log.info(
                "enrich_worker.task_persisted",
                vendor=task.vendor_name[:80],
                domain=v.domain,
                completeness=result.completeness_score,
            )
            # Snowglobe Phase 2: push to the toast feed so the bottom-right
            # widget can confirm the persist immediately to the operator.
            # Best-effort; never blocks persist path.
            try:
                from .enrich_success_feed import publish_success
                await publish_success(
                    vendor_id=v.vendor_id,
                    company_name=v.company_name,
                    domain=v.domain,
                    scope_match_score=v.scope_match_score,
                    enrichment_completeness=v.enrichment_completeness,
                    catalog_count=v.catalog_count,
                    has_email=v.has_email,
                    has_phone=v.has_phone,
                )
            except Exception as _e:  # noqa: BLE001
                _log.debug("enrich_worker.success_feed_publish_skipped", error=str(_e)[:120])
            await _index_specialty_safe(v)
            # Phase 5 — enqueue product-catalog enrichment for this vendor.
            # Fire-and-forget at the queue level (XADD is fast); the actual
            # LLM work runs in product_backfill_worker which has its own
            # tier=light cap so it can't starve the live enrich pool.
            # Snowglobe rule 6: only enqueue catalog backfill when vendor is
            # in scope, has a real website, AND we already saw a catalog hint.
            # Hides catalog by default when no website exists.
            if (
                getattr(s, "product_catalog_live_enabled", True)
                and v.products
                and _enqueue_catalog
            ):
                try:
                    from . import product_backfill_queue
                    await product_backfill_queue.publish_vendor(
                        v.vendor_id, source="live"
                    )
                except Exception as _e:  # noqa: BLE001
                    _log.debug(
                        "enrich_worker.product_backfill_enqueue_skipped",
                        error=str(_e)[:120],
                    )
        else:
            cat = reject_cat or "rejected"
            await _archive_outcome(
                task, result,
                status="failure", failure_category=cat,
            )
            try:
                agentic_enrich_outcomes_total.labels(status=cat).inc()
            except Exception:  # noqa: BLE001
                pass

    except Exception as e:  # noqa: BLE001
        # Defensive — anything not caught downstream lands here so the
        # worker stays up and the entry gets ack'd (XAUTOCLAIM would
        # redeliver in 5 minutes; better to record a lesson + move on).
        _log.warning(
            "enrich_worker.task_unhandled_error",
            vendor=task.vendor_name[:80], error=str(e)[:200],
        )
        try:
            await _archive_outcome(
                task,
                _MinimalErrorResult(task, str(e)),
                status="failure",
                failure_category=categorize_failure(str(e)),
                failure_detail=str(e)[:300],
            )
        except Exception:  # noqa: BLE001
            pass
        try:
            agentic_enrich_outcomes_total.labels(status="error").inc()
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            agentic_enrich_inflight.labels(worker_id=consumer_id).dec()
        except Exception:  # noqa: BLE001
            pass
        # ALWAYS XACK — at-least-once is enough; we have idempotency via claim().
        try:
            await enrich_queue.ack(entry_id)
        except Exception as e:  # noqa: BLE001
            _log.debug("enrich_worker.ack_failed", error=str(e)[:120])
        # Release the per-task SET-NX claim so a fresh re-encounter (e.g.
        # next pass, different run_date) isn't blocked by yesterday's claim.
        try:
            await release(task.task_id)
        except Exception:  # noqa: BLE001
            pass


class _MinimalErrorResult:
    """Stand-in for EnrichResult when the worker itself blew up before
    `run_enrich_for_task` returned. Just enough surface for archive_lesson."""

    def __init__(self, task: EnrichTask, err: str) -> None:
        self.task = task
        self.vendor = None
        self.completeness_score = 0.0
        self.bail_reason = None
        self.elapsed_s = 0.0
        self.n_steps = None
        self.raw_steps = []
        self.final_url = None
        self.error = err
        self.exhibitors = []
        self.expo_id = task.expo_id
        self.seed_name = task.vendor_name


async def _consumer_loop(idx: int) -> None:
    """One long-running consumer task. Pulls + processes one entry at a
    time per loop iteration; the surrounding `gather` provides parallelism."""
    consumer_id = _consumer_id(idx)
    _log.info("enrich_worker.consumer_started", consumer=consumer_id, idx=idx)
    while not _SHUTDOWN.is_set():
        try:
            entries = await enrich_queue.pull(consumer_id, count=1, block_ms=5000)
        except Exception as e:  # noqa: BLE001
            _log.warning("enrich_worker.pull_failed", error=str(e)[:200])
            await asyncio.sleep(2.0)
            continue
        for entry_id, task in entries:
            if _SHUTDOWN.is_set():
                break
            await _process_one(consumer_id, entry_id, task, consumer_idx=idx)
    _log.info("enrich_worker.consumer_stopped", consumer=consumer_id)


async def _reclaim_loop() -> None:
    """Periodic XAUTOCLAIM so PEL entries from crashed workers get re-
    delivered instead of stranding forever."""
    s = get_agentic_settings()
    reclaim_consumer = _consumer_id(0)  # any consumer can claim; pick #0
    idle_ms = s.enrich_pel_reclaim_idle_seconds * 1000
    while not _SHUTDOWN.is_set():
        try:
            entries = await enrich_queue.claim_pending_idle(reclaim_consumer, idle_ms)
            for entry_id, task in entries:
                # Just process it on the reclaiming worker. Keep it simple
                # — don't re-publish; XAUTOCLAIM already moved ownership.
                await _process_one(reclaim_consumer, entry_id, task, consumer_idx=0)
        except Exception as e:  # noqa: BLE001
            _log.debug("enrich_worker.reclaim_loop_failed", error=str(e)[:160])
        try:
            await asyncio.wait_for(_SHUTDOWN.wait(), timeout=60.0)
        except asyncio.TimeoutError:
            pass


async def _prewarm_sessions(n: int) -> None:
    """Spawn N persistent BrowserSessions at worker startup so each consumer
    has a ready Chromium to reuse across tasks. Tab stays open in noVNC
    even when queue is idle — operator gets continuous visual presence
    of the enrich pool."""
    s = get_agentic_settings()
    if s.headless:
        # No display, no point pre-warming.
        return
    if not s.agentic_enrich_prewarm:
        # Default OFF — shared session was a cascading-failure footgun.
        _log.info("enrich_worker.prewarm_disabled", reason="agentic_enrich_prewarm=false")
        return
    if not s.agentic_persistent_profiles:
        # Without persistent profiles each session uses a tmp dir; reuse
        # is still valuable for visibility but operator may prefer fresh
        # sessions. Skip pre-warm to preserve original behavior.
        return
    try:
        from .enrich_agent import build_prewarmed_session
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_worker.prewarm_import_failed", error=str(e)[:120])
        return

    for i in range(n):
        try:
            session = await build_prewarmed_session(i)
            if session is not None:
                _PREWARMED_SESSIONS[i] = session
                _log.info("enrich_worker.session_prewarmed", slot=i)
        except Exception as e:  # noqa: BLE001
            _log.warning(
                "enrich_worker.prewarm_session_failed",
                slot=i, error=str(e)[:160],
            )


async def _prewarm_ollama_vision() -> bool:
    """Snowglobe Phase 2 — load qwen3-vl into VRAM before the consumer pool
    starts pulling. Skips cold-start latency on the first ~6 enrichments
    and keeps the model resident via explicit keep_alive=1h. Survives
    failure: a missed pre-warm just means the first enrich call pays the
    load cost like before.
    """
    s = get_agentic_settings()
    base = (s.llm_base_url or "").rstrip("/")
    model = s.vision_model
    if not base or not model:
        return False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=90.0) as c:
            r = await c.post(
                f"{base}/api/generate",
                json={
                    "model": model,
                    "prompt": "ping",
                    "stream": False,
                    "keep_alive": "1h",
                    "options": {"num_predict": 1},
                },
            )
            r.raise_for_status()
        _log.info("enrich_worker.ollama_vision_prewarmed", model=model, host=base)
        return True
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "enrich_worker.ollama_vision_prewarm_failed",
            model=model, host=base, error=str(e)[:160],
        )
        return False


async def _shutdown_prewarmed_sessions() -> None:
    for slot, session in list(_PREWARMED_SESSIONS.items()):
        try:
            if hasattr(session, "stop"):
                await session.stop()
            elif hasattr(session, "close"):
                await session.close()
        except Exception as e:  # noqa: BLE001
            _log.debug(
                "enrich_worker.session_stop_failed",
                slot=slot, error=str(e)[:120],
            )
    _PREWARMED_SESSIONS.clear()


async def run_workers_forever() -> None:
    """Entry point used by `agentic-crawl enrich-worker` and by the
    in-process spawner in `scheduler.py`. Spawns N consumer loops + 1
    reclaim loop + 1 queue-depth gauge updater, then waits for shutdown."""
    s = get_agentic_settings()
    n = max(1, int(s.agentic_enrich_parallel))
    _log.info(
        "enrich_worker.started",
        parallel=n, llm_base_url=s.llm_base_url,
        lessons_dir=str(s.enrich_lessons_dir),
    )

    # Snowglobe Phase 2: load the vision model into VRAM BEFORE Chromium
    # sessions spin up, so the first enrich call hits a warm slot. Non-fatal —
    # operator can see prewarm status in logs.
    await _prewarm_ollama_vision()

    # Phase 3.2: pre-warm one persistent BrowserSession per consumer so a
    # Chromium tab stays visible in noVNC across tasks. Each consumer
    # reuses its session via _PREWARMED_SESSIONS[idx].
    await _prewarm_sessions(n)

    tasks = [asyncio.create_task(_consumer_loop(i)) for i in range(n)]
    tasks.append(asyncio.create_task(_reclaim_loop()))
    tasks.append(asyncio.create_task(enrich_queue.watch_depth(30.0)))

    try:
        await _SHUTDOWN.wait()
    finally:
        await _shutdown_prewarmed_sessions()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def request_shutdown() -> None:
    _SHUTDOWN.set()
