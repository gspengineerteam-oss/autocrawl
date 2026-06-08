"""Multi-source search aggregator with 6 tier orchestration.

Strategi: fan out paralel ke setiap provider yang aktif, dedupe by canonical
URL di akhir. Setiap provider tag `source` field unik untuk metrics. Kalau
satu provider down, sisanya tetap kontribusi.

Tier breakdown.

Tier 1 — DDGS legacy + Wikipedia direct + Google News RSS. Always-on.
Tier 2 — Self-hosted meta-search (SearXNG).
Tier 3 — Free APIs with optional key (Tavily, Brave, Bing).
Tier 4 — Niche public APIs (Reddit, HackerNews, GitHub, arXiv, OpenAlex,
         Semantic Scholar, Internet Archive, Wayback CDX).
Tier 5 — OpenSERP container (Google, Bing, Yandex, Baidu via headless).
Tier 6 — Region-specific engines (Baidu, Naver, Yahoo Japan) when query hints.
Tier 7 — China-deep engines (Sogou+WeChat, Zhihu, Bilibili, Baidu Scholar).
         Surfaces vendor pages Baidu under-indexes: 公众号 articles, Q&A
         procurement threads, factory-tour videos, CNKI/Wanfang abstracts.
         Fires when query has CN intent OR `force_china_deep=True`.

Hasil tiap provider digabung lewat OrderedDict by `canonical_url(hit.url)`,
preserving insertion order so the higher-tier hits win when there's a tie.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from typing import Any, Awaitable

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import external_search_total
from ..url_utils import canonical_url
from . import (
    arxiv,
    baidu,
    baidu_xueshu,
    bilibili,
    bing,
    brave,
    ddg,
    github_search,
    google_news_rss,
    hackernews,
    internet_archive,
    naver,
    openalex,
    openserp,
    reddit,
    searxng,
    semantic_scholar,
    sogou,
    tavily,
    wayback_cdx,
    wikipedia,
    yahoo_japan,
    zhihu,
)
from .base import SearchHit
from .region import detect_regions

_log = get_logger(__name__)


# Engine subsets for queries that only make sense on a specific provider class.
# `pdf` = engines that honor the `filetype:`/`site:` Google-dialect operators or
# otherwise meaningfully index document URLs. Wikipedia/Reddit/HN/ArXiv/etc are
# excluded because they ignore these operators and never carry event brochures.
PDF_FRIENDLY_ENGINES: frozenset[str] = frozenset(
    {"openserp", "searxng", "ddg", "tavily", "brave", "bing", "wayback_cdx", "firecrawl"}
)

# Engine subset for the name->domain resolve hop in the agentic enrich pipeline.
# Goal: domain candidate in 8-12s wall time, not 30-50s. `search_all` poll all
# 25+ engines in parallel but slowest tail (Wayback, GitHub, ArXiv) dominates;
# this trims to the 5 fastest+highest-precision web engines (DDG always on,
# SearXNG self-hosted local, plus the API-keyed tier-3). Used by
# `enrich_worker._resolve_domain_via_search` with per_source_limit=3.
FAST_RESOLVE_ENGINES: frozenset[str] = frozenset(
    {"ddg", "searxng", "brave", "bing", "tavily"}
)


def _build_tasks(
    query: str,
    per_source_limit: int,
    engines: frozenset[str] | set[str] | None = None,
    force_regions: bool = False,
    force_china_deep: bool = False,
) -> dict[str, Awaitable[Any]]:
    """Compose the dict of provider coroutines based on current settings.

    `engines` (optional): if provided, only include providers whose key is in
    the set. Use `PDF_FRIENDLY_ENGINES` for `filetype:pdf` queries to skip
    providers that would just return 0 hits + waste a roundtrip.

    `force_regions`: when True (or `settings.enable_force_multilingual_search`),
    schedule Baidu/Naver/Yahoo Japan unconditionally. Otherwise the legacy
    behavior — gate them on `detect_regions(query)` matching CJK/keywords —
    applies.

    `force_china_deep`: when True, schedule Tier-7 (Sogou/WeChat, Zhihu,
    Bilibili, Baidu Scholar) regardless of detected regions. Useful for
    CCIPT-style topic seeds that may not contain Chinese characters in
    the English query template but absolutely should hit CN-only sources.
    """
    settings = get_settings()
    tasks: dict[str, Awaitable[Any]] = {}

    def _allow(name: str) -> bool:
        return engines is None or name in engines

    # Tier 1 — always-on lightweight sources.
    if _allow("wikipedia"):
        tasks["wikipedia"] = wikipedia.search(query, max_results=min(per_source_limit, 10))
    if _allow("ddg"):
        tasks["ddg"] = ddg.search(query, max_results=per_source_limit)
    if _allow("google_news"):
        tasks["google_news"] = google_news_rss.search(query, max_results=per_source_limit)

    # Tier 2 — self-hosted meta-search.
    if settings.enable_searxng and _allow("searxng"):
        tasks["searxng"] = searxng.search(query, max_results=per_source_limit * 2)

    # Tier 3 — free-tier APIs with optional key (each module checks its own key).
    if settings.enable_tavily and _allow("tavily"):
        tasks["tavily"] = tavily.search(query, max_results=per_source_limit)
    if settings.enable_brave and _allow("brave"):
        tasks["brave"] = brave.search(query, max_results=per_source_limit)
    if settings.enable_bing and _allow("bing"):
        tasks["bing"] = bing.search(query, max_results=per_source_limit)

    # Tier 4 — niche public APIs (each module checks its own enable flag).
    if settings.enable_reddit and _allow("reddit"):
        tasks["reddit"] = reddit.search(query, max_results=per_source_limit)
    if settings.enable_hackernews and _allow("hackernews"):
        tasks["hackernews"] = hackernews.search(query, max_results=per_source_limit)
    if settings.enable_github_search and _allow("github"):
        tasks["github"] = github_search.search(query, max_results=per_source_limit)
    if settings.enable_arxiv and _allow("arxiv"):
        tasks["arxiv"] = arxiv.search(query, max_results=per_source_limit)
    if settings.enable_openalex and _allow("openalex"):
        tasks["openalex"] = openalex.search(query, max_results=per_source_limit)
    if settings.enable_semantic_scholar and _allow("semantic_scholar"):
        tasks["semantic_scholar"] = semantic_scholar.search(query, max_results=per_source_limit)
    if settings.enable_internet_archive and _allow("internet_archive"):
        tasks["internet_archive"] = internet_archive.search(query, max_results=per_source_limit)
    if settings.enable_wayback_cdx and _allow("wayback_cdx"):
        tasks["wayback_cdx"] = wayback_cdx.search(query, max_results=per_source_limit)

    # Tier 5 — OpenSERP container (off by default; enable via env when ready).
    if settings.enable_openserp and _allow("openserp"):
        tasks["openserp"] = openserp.search(query, max_results=per_source_limit)

    # Legacy Firecrawl (paid; keep wired but off by default).
    if settings.enable_firecrawl and _allow("firecrawl"):
        from ..firecrawl.client import search as firecrawl_search

        tasks["firecrawl"] = firecrawl_search(query, limit=per_source_limit)

    # Tier 6 — region-specific engines.
    # When force_regions or the global force flag is on, fire all three
    # unconditionally (Phase 2: drops Asian-engine bias for English queries).
    # Otherwise gate on detected query language as before.
    forced = force_regions or settings.enable_force_multilingual_search
    regions = detect_regions(query)
    if (forced or "cn" in regions) and _allow("baidu"):
        tasks["baidu"] = baidu.search(query, max_results=per_source_limit)
    if (forced or "kr" in regions) and _allow("naver"):
        tasks["naver"] = naver.search(query, max_results=per_source_limit)
    if (forced or "jp" in regions) and _allow("yahoo_japan"):
        tasks["yahoo_japan"] = yahoo_japan.search(query, max_results=per_source_limit)

    # Tier 7 — China-deep. Fire when CN intent detected OR forced. The
    # individual engine flags let operators kill a specific source if it
    # starts captcha-blocking. Sogou's WeChat surface is gated by its own
    # `sogou_include_weixin` flag (cuts network cost in half when off).
    cn_deep_active = force_china_deep or "cn" in regions or forced
    if cn_deep_active:
        if settings.enable_sogou and _allow("sogou"):
            tasks["sogou"] = sogou.search(
                query,
                max_results=per_source_limit,
                include_weixin=settings.sogou_include_weixin,
            )
        if settings.enable_zhihu and _allow("zhihu"):
            tasks["zhihu"] = zhihu.search(query, max_results=per_source_limit)
        if settings.enable_bilibili and _allow("bilibili"):
            tasks["bilibili"] = bilibili.search(
                query, max_results=per_source_limit
            )
        if settings.enable_baidu_xueshu and _allow("baidu_xueshu"):
            tasks["baidu_xueshu"] = baidu_xueshu.search(
                query, max_results=per_source_limit
            )

    if regions or forced or cn_deep_active:
        _log.info(
            "multi_search.regions_detected",
            query=query[:60],
            regions=regions,
            forced=forced,
            cn_deep=cn_deep_active,
            engines=list(tasks.keys()),
        )

    return tasks


def _coerce_hits(source: str, result: Any) -> list[SearchHit]:
    """Normalize per-provider responses into a list[SearchHit]."""
    if source == "firecrawl":
        # firecrawl returns a custom response object with `.data`.
        data = result.data if hasattr(result, "data") else None
        hits: list[SearchHit] = []
        if data:
            for r in (data.get("results") or data.get("data") or []):
                if isinstance(r, dict):
                    hits.append(
                        SearchHit(
                            title=r.get("title", "") or "",
                            url=r.get("url", "") or r.get("link", "") or "",
                            snippet=r.get("description", "") or r.get("snippet", "") or "",
                            source="firecrawl",
                        )
                    )
        return hits
    # Every other provider already returns list[SearchHit].
    if isinstance(result, list):
        return result
    return []


async def search_all(
    query: str,
    *,
    per_source_limit: int = 15,
    engines: frozenset[str] | set[str] | None = None,
    force_regions: bool = False,
    force_china_deep: bool = False,
) -> list[SearchHit]:
    tasks = _build_tasks(
        query,
        per_source_limit,
        engines=engines,
        force_regions=force_regions,
        force_china_deep=force_china_deep,
    )
    if not tasks:
        return []

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    merged: OrderedDict[str, SearchHit] = OrderedDict()
    per_source_counts: dict[str, int] = {}
    for (source, _), result in zip(tasks.items(), results, strict=True):
        if isinstance(result, BaseException):
            external_search_total.labels(provider=source, status="error").inc()
            _log.debug("multi_search.source_failed", source=source, error=str(result)[:200])
            continue
        hits = _coerce_hits(source, result)
        external_search_total.labels(provider=source, status="ok").inc()
        per_source_counts[source] = len(hits)
        for h in hits:
            if not h.url:
                continue
            key = canonical_url(h.url)
            if key not in merged:
                merged[key] = h

    _log.info(
        "multi_search.tier_complete",
        query=query[:60],
        total_unique=len(merged),
        per_source=per_source_counts,
    )
    return list(merged.values())
