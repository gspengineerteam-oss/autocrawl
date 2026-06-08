"""Discovery agent.

Phase A — Dynamic Seed Generation:
  Use the LLM (gpt-4o-mini) to expand the YAML topic config into 8-15 query
  variations per topic, contextualised with the current year. Dedupe against
  recent run history (kept in Redis).

Phase B — Multi-source Search:
  Run the merged search (Firecrawl + DDG + Wikipedia + Google News RSS) on
  each query in parallel, then ask the LLM (gpt-4o) to extract candidate
  expo entries from the merged hit list. Each entry becomes an `Expo`.
"""

from __future__ import annotations

import asyncio
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from ..config import get_seed_topics, get_settings
from ..observability.logger import get_logger
from ..observability.metrics import errors_total, expos_discovered_total
from ..schemas import Expo, ExpoSource
from ..store.redis_queue import get_redis
from ..tools.llm.cloud_router import chat_structured
from ..tools.llm.openai_client import chat
from ..tools.search.base import SearchHit
from ..tools.search.multi import search_all
from ..tools.url_utils import canonical_domain

_log = get_logger(__name__)


class _ExpandedQueries(BaseModel):
    queries: list[str] = Field(default_factory=list)


class _ExpoCandidate(BaseModel):
    name: str
    aggregator_url: str | None = None
    official_url: str | None = None
    location: str | None = None
    country: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class _ExtractedExpos(BaseModel):
    expos: list[_ExpoCandidate] = Field(default_factory=list)


def _slugify(name: str, year: int | None = None) -> str:
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", name).strip().lower()
    s = re.sub(r"\s+", "-", s)
    if year:
        s = f"{year}-{s}" if str(year) not in s else s
    return s[:80]


async def expand_seeds(
    *, max_per_topic: int = 12, force_multilingual: bool = False
) -> list[str]:
    cfg = get_seed_topics()
    topics = cfg.get("topics", [])
    anchors = cfg.get("anchor_expos", [])
    year = datetime.now(timezone.utc).year
    if force_multilingual:
        sys_content = (
            "You expand crawl topics into specific search queries to discover "
            "trade-shows / conferences / expos. Output 8-12 highly varied queries "
            "per topic mixing region keywords, year context, exhibitor / floor "
            "plan / agenda terms, and known landmark events. Avoid duplicates.\n\n"
            "MULTILINGUAL MANDATE — for EVERY topic, regardless of its declared "
            "region tag, you MUST emit at least one query in EACH of these 5 "
            "scripts so all regional search engines get hit:\n"
            "  1. English (Latin)            — e.g. 'security trade show 2026 exhibitor list'\n"
            "  2. Simplified Chinese (Hanzi) — e.g. 中国国际防务展 2026 参展商\n"
            "  3. Japanese (Hiragana/Kana)   — e.g. 防衛装備品展示会 2026 出展者\n"
            "  4. Korean (Hangul)            — e.g. 서울 ADEX 2026 참가업체\n"
            "  5. Russian (Cyrillic)         — e.g. Армия 2026 участники выставки\n"
            "Spread the expansions across these scripts; do not over-weight one. "
            "Do NOT romanize CJK/Cyrillic — emit the native script directly."
        )
    else:
        sys_content = (
            "You expand crawl topics into specific search queries to discover "
            "trade-shows / conferences / expos. Output 8-12 highly varied queries "
            "per topic mixing region keywords, year context, exhibitor / floor "
            "plan / agenda terms, and known landmark events. Avoid duplicates.\n\n"
            "IMPORTANT — when the topic includes Asia / China / Japan / Korea / "
            "Russia regions, ALSO produce 2-4 queries written in the local "
            "language/script so we can hit local search engines (Baidu / Yahoo "
            "Japan / Naver / Yandex):\n"
            "  - China  → Simplified Chinese (e.g. 中国国际防务展 2026 参展商)\n"
            "  - Japan  → Japanese (e.g. 防衛装備品展示会 2026 出展者)\n"
            "  - Korea  → Korean (e.g. 서울 ADEX 2026 참가업체)\n"
            "  - Russia → Russian (e.g. Армия 2026 участники выставки)\n"
            "Mix English + local-language queries; do not output just one or "
            "the other for these regions."
        )
    sys = SystemMessage(content=sys_content)

    async def _expand_one(topic: dict) -> list[str]:
        user = HumanMessage(
            content=(
                f"Topic: {topic.get('label')}\n"
                f"Keywords: {', '.join(topic.get('keywords', []))}\n"
                f"Regions: {', '.join(topic.get('regions', []))}\n"
                f"Anchor events (positive examples): {', '.join(anchors)}\n"
                f"Year context: {year}\n"
                f"Generate up to {max_per_topic} queries."
            )
        )
        try:
            res = await chat_structured(
                [sys, user], _ExpandedQueries, local_chat=chat, tier="light"
            )
            return list(getattr(res, "queries", []))[:max_per_topic]
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="discovery", category="seed_expand").inc()
            _log.warning("discovery.seed_expand_failed", topic=topic.get("name"), error=str(e))
            return []

    expansions = await asyncio.gather(*(_expand_one(t) for t in topics))
    flat: list[str] = []
    seen: set[str] = set()
    for batch in expansions:
        for q in batch:
            stripped = q.strip()
            if not stripped:
                continue
            # NFC-normalize + casefold so 中国 vs 中國 (or half/full-width
            # variants) collapse to a single dedup key — protects the Redis
            # recent-queries set from cache-thrashing on visually equivalent
            # CJK strings.
            k = unicodedata.normalize("NFC", stripped).casefold()
            if k and k not in seen:
                seen.add(k)
                flat.append(stripped)
    flat = await _filter_recent_history(flat)
    _log.info("discovery.seeds_ready", count=len(flat))
    return flat


def _norm_query_key(q: str) -> str:
    """NFC-normalize + casefold for Redis dedup. Same key transform used for
    `seen` set in `expand_seeds`, so visually equivalent CJK/Cyrillic strings
    map to a single Redis member."""
    return unicodedata.normalize("NFC", q.strip()).casefold()


async def _filter_recent_history(queries: list[str], *, lookback_runs: int = 30) -> list[str]:
    client = await get_redis()
    if client is None:
        return queries
    key = "discovery:recent_queries"
    try:
        recent = set(await client.smembers(key))
    except Exception:  # noqa: BLE001
        recent = set()
    new = [q for q in queries if _norm_query_key(q) not in recent]
    try:
        if new:
            await client.sadd(key, *(_norm_query_key(q) for q in new))
            await client.expire(key, 60 * 60 * 24 * lookback_runs)
    except Exception:  # noqa: BLE001
        pass
    return new


async def _extract_expos_from_hits(query: str, hits: list[SearchHit]) -> list[_ExpoCandidate]:
    if not hits:
        return []
    rendered = "\n".join(f"- [{h.source}] {h.title} :: {h.url}\n    {h.snippet[:240]}" for h in hits[:30])
    sys = SystemMessage(
        content=(
            "From the search snippets below, extract trade-show / conference / "
            "expo entries. Each must be a real event with a name. Set "
            "`aggregator_url` if the URL is on an event-listing site (10times, "
            "eventbrite, tradefairdates, conferenceindex, allconferences, "
            "n-events, expopromoter, eventseye). Set `official_url` if the URL "
            "looks like the event's own site. Skip generic news articles unless "
            "they clearly announce a specific event.\n\n"
            "OUTPUT RULE: Always return valid JSON matching the schema. If no "
            "events match, return an empty list `{\"expos\": []}`. NEVER write "
            "prose, explanations, or markdown — only the JSON object."
        )
    )
    user = HumanMessage(content=f"Search query: {query}\n\nResults:\n{rendered}")
    try:
        # gpt-4o-mini is plenty for snippet extraction and has 10x higher TPM than gpt-4o
        res = await chat_structured(
            [sys, user], _ExtractedExpos, local_chat=chat, tier="light"
        )
        return list(getattr(res, "expos", []))
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="discovery", category="expo_extract").inc()
        _log.warning("discovery.expo_extract_failed", query=query, error=str(e))
        return []


def _candidate_to_expo(c: _ExpoCandidate, query: str) -> Expo | None:
    name = (c.name or "").strip()
    if len(name) < 3:
        return None
    year_match = re.search(r"\b(20\d{2})\b", name) or re.search(r"\b(20\d{2})\b", c.aggregator_url or c.official_url or "")
    year = int(year_match.group(1)) if year_match else None
    expo_id = _slugify(name, year)

    source = ExpoSource.UNKNOWN
    if c.aggregator_url:
        dom = canonical_domain(c.aggregator_url)
        for member in ExpoSource:
            if member.value in dom:
                source = member
                break
        else:
            source = ExpoSource.FIRECRAWL_SEARCH if "firecrawl" in (c.aggregator_url or "") else ExpoSource.UNKNOWN

    try:
        return Expo(
            expo_id=expo_id,
            name=name,
            source=source,
            aggregator_url=c.aggregator_url,
            official_url=c.official_url,
            location=c.location,
            country=c.country,
            discovery_query=query,
        )
    except Exception as e:  # noqa: BLE001
        _log.debug("discovery.expo_construct_failed", error=str(e), name=name)
        return None


async def _scrape_industry_directories() -> list[_ExpoCandidate]:
    """Tier 6 — direct scrape of curated conference directories.

    These don't go through the LLM extractor because the source data is
    already structured (name + URL per listing). Returns candidates ready
    for `_candidate_to_expo`.
    """
    settings = get_settings()
    if not settings.enable_directory_scrape:
        return []

    from ..tools.scrapers import allconferences, conferenceindex, eventseye

    sources = [
        ("conferenceindex", conferenceindex.list_expo_candidates),
        ("allconferences", allconferences.list_expo_candidates),
        ("eventseye", eventseye.list_expo_candidates),
    ]
    raws: list[dict] = []
    for name, fn in sources:
        try:
            batch = await fn()
            raws.extend(batch)
            _log.info("discovery.directory_scraped", source=name, candidates=len(batch))
        except Exception as e:  # noqa: BLE001
            _log.warning("discovery.directory_failed", source=name, error=str(e)[:200])

    out: list[_ExpoCandidate] = []
    for r in raws:
        try:
            out.append(
                _ExpoCandidate(
                    name=r.get("name", ""),
                    aggregator_url=r.get("aggregator_url"),
                    official_url=r.get("official_url"),
                )
            )
        except Exception:  # noqa: BLE001
            continue
    return out


async def discover_expos() -> list[Expo]:
    settings = get_settings()
    queries = await expand_seeds()

    sem = asyncio.Semaphore(settings.concurrency().expo_discovery)
    seen_ids: set[str] = set()
    out: list[Expo] = []

    async def _per_query(q: str) -> list[Expo]:
        async with sem:
            hits = await search_all(q, per_source_limit=12)
            cands = await _extract_expos_from_hits(q, hits)
            local: list[Expo] = []
            for c in cands:
                exp = _candidate_to_expo(c, q)
                if not exp:
                    continue
                if exp.expo_id in seen_ids:
                    continue
                seen_ids.add(exp.expo_id)
                local.append(exp)
            return local

    # Run search-driven discovery and directory scrape in parallel so the
    # whole stage finishes in roughly max(slowest_search, slowest_directory).
    search_task = asyncio.gather(*(_per_query(q) for q in queries)) if queries else None
    dir_task = _scrape_industry_directories()

    if search_task is not None:
        batches, dir_candidates = await asyncio.gather(search_task, dir_task)
    else:
        batches = []
        dir_candidates = await dir_task

    for b in batches:
        out.extend(b)
        for e in b:
            expos_discovered_total.labels(source=e.source.value).inc()

    # Convert directory candidates to Expo, dedup by expo_id.
    for c in dir_candidates:
        exp = _candidate_to_expo(c, "directory_scrape")
        if not exp or exp.expo_id in seen_ids:
            continue
        seen_ids.add(exp.expo_id)
        out.append(exp)
        expos_discovered_total.labels(source=exp.source.value).inc()

    if len(out) > settings.max_expos_per_run:
        out = out[: settings.max_expos_per_run]
    _log.info(
        "discovery.done",
        expos=len(out),
        queries=len(queries),
        from_directory=len(dir_candidates),
    )
    return out
