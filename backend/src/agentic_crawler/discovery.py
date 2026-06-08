"""Mode C — autonomous discovery of new exhibitor-list URLs.

Every pass the scheduler calls `discover_new_seeds()` which:
  1. Slices a round-robin window over the topic taxonomy in agentic_seeds.yaml
     (so over time the full taxonomy gets exercised, even if per-pass cap is
     smaller than total topic count).
  2. Asks the base crawler's `expand_seeds()` to LLM-expand each topic into
     multilingual queries (English + Chinese / Japanese / Korean / Russian
     for Asia/Russia regions).
  3. Fans out queries across Bing/Baidu/Yandex/DDG/SearXNG/OpenSERP via
     `search_all()`.
  4. Scores each hit URL by a keyword heuristic — positive keywords like
     `exhibitor`/`directory`/`participants`, negatives like `news`/`blog`/
     `linkedin.com/feed`. Threshold-tunable via env.
  5. Filters out (a) recently-tried (query, domain) pairs (avoid retry storm),
     (b) currently-blacklisted domains.
  6. Builds AgenticSeed entries with the discovery task prompt + records each
     as a `queued` DiscoveryAttempt in knowledge.

Reuses every primitive from the base crawler — `expand_seeds`, `search_all`,
`canonical_domain` — so we don't reimplement multilingual query generation
or multi-engine search. Only the URL scorer is local because the base
crawler's pdf_finder scorer targets PDFs, not exhibitor pages.
"""

from __future__ import annotations

import asyncio
from typing import Any

from crawler.observability.logger import get_logger

from .config import get_agentic_settings
from .knowledge import KnowledgeStore, domain_of
from .seeds import _BAIL_OUT_INSTRUCTION, AgenticSeed

_log = get_logger(__name__)


# Positive keywords — substrings that bump the score when present in the URL,
# title, or snippet. Tuned for exhibitor-list / participant-directory pages.
_POS_KEYWORDS = (
    "exhibitor",
    "exhibitors",
    "exhibitor-list",
    "exhibitor_list",
    "exhibitors-list",
    "directory",
    "vendors",
    "participants",
    "participant",
    "attendees",
    "companies",
    "expolist",
    "expo-list",
    "show-guide",
    "showguide",
    "exposants",       # French
    "ausstellerverzeichnis",  # German
    "ausstellerliste", # German
    "出展者",            # Japanese (exhibitors)
    "参展商",            # Simplified Chinese (exhibitors)
    "참가업체",          # Korean (participating companies)
    "участники",        # Russian (participants)
)

# Negative keywords — substrings that subtract from the score. Targets:
# social platforms (LinkedIn feed, YouTube, TikTok), news/blog noise,
# pure ticket/registration pages, irrelevant content.
_NEG_KEYWORDS = (
    "news",
    "blog",
    "wiki",
    "wikipedia.org",
    "youtube.com",
    "tiktok.com",
    "facebook.com",
    "instagram.com",
    "pinterest.com",
    "reddit.com/r",
    "linkedin.com/feed",
    "linkedin.com/posts",
    "10times.com/news",
    "ticket",
    "register",
    "registration",
    "agenda",
    "schedule",
    "press-release",
    "media-kit",
    "/career",
    "/jobs",
)


_QUERY_BIAS_PENALTY = 0.25
_QUERY_BIAS_MIN_DISTINCT_DOMAINS = 3


def _score_url_relevance(
    url: str,
    title: str = "",
    snippet: str = "",
    *,
    query: str | None = None,
    query_failures: dict[str, set[str]] | None = None,
) -> float:
    """0..1 — higher = more likely to be an exhibitor list page.

    Mirrors the keyword-scoring idiom in `pdf_finder._score_pdf_relevance` but
    with discovery-specific keyword sets. Cheap pre-filter so we burn agent
    turns only on URLs that look right at the SERP level.

    Phase 2: when `query_failures` is supplied, queries that have produced
    failures across ≥3 distinct domains in the lookback window get a
    `_QUERY_BIAS_PENALTY` deduction. This is the per-query bias correction —
    keeps a structurally bad query (e.g. one whose translations consistently
    surface news indexes instead of exhibitor lists) from monopolizing
    every discovery pass.
    """
    if not url:
        return 0.0
    haystack = f"{url} {title} {snippet}".lower()
    pos_hits = sum(1 for kw in _POS_KEYWORDS if kw in haystack)
    neg_hits = sum(1 for kw in _NEG_KEYWORDS if kw in haystack)
    score = 0.4  # neutral baseline below threshold — needs ≥1 pos to qualify
    score += min(0.6, pos_hits * 0.20)
    score -= min(0.7, neg_hits * 0.30)
    if query and query_failures:
        norm = (query or "").strip().lower()
        doms = query_failures.get(norm)
        if doms and len(doms) >= _QUERY_BIAS_MIN_DISTINCT_DOMAINS:
            score -= _QUERY_BIAS_PENALTY
    return max(0.0, min(1.0, score))


async def _load_query_failure_map(
    lessons_dir: "Path | None" = None,
    lookback_days: int | None = None,
) -> dict[str, set[str]]:
    """Walk the lesson archive and build {normalized_query → {failed_domains}}.

    Reads `failure/*/meta.json` rows whose `archived_at` is within
    `lookback_days`, then groups by `query` field. Returns an empty dict on
    any IO problem so the scorer falls back to keyword-only behavior.

    The query key is lowercased + stripped — same normalization the scorer
    uses, so lookups are O(1) with no per-call massaging.
    """
    import json
    from datetime import datetime, timedelta, timezone
    from pathlib import Path

    s = get_agentic_settings()
    root = Path(lessons_dir) if lessons_dir else Path(s.lessons_dir)
    failure_root = root / "failure"
    if not failure_root.exists():
        return {}
    cutoff_days = lookback_days if lookback_days is not None else s.discovery_history_lookback_days
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(0, cutoff_days))

    out: dict[str, set[str]] = {}
    try:
        children = await asyncio.to_thread(list, failure_root.iterdir())
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.bias_scan_failed", error=str(e)[:120])
        return {}

    for child in children:
        if not child.is_dir():
            continue
        meta_path = child / "meta.json"
        if not meta_path.exists():
            continue
        try:
            raw = await asyncio.to_thread(meta_path.read_text, encoding="utf-8")
            meta = json.loads(raw)
        except Exception:  # noqa: BLE001
            continue
        archived_raw = meta.get("archived_at")
        try:
            archived_at = datetime.fromisoformat(str(archived_raw))
            if archived_at.tzinfo is None:
                archived_at = archived_at.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            continue
        if archived_at < cutoff:
            continue
        query = (meta.get("query") or "").strip().lower()
        domain = (meta.get("domain") or "").strip().lower()
        if not query or not domain:
            continue
        out.setdefault(query, set()).add(domain)

    return out


def _discovery_task_prompt(name: str, query: str) -> str:
    """Task prompt for a discovery seed. The agent treats the URL as the
    candidate exhibitor-list page and goes straight to scroll → bulk extract.
    Bail clause appended so unworkable pages don't burn the full budget."""
    return (
        f"Discovery seed for query '{query}'. Candidate exhibitor list: '{name}'.\n"
        f"Plan: (1) call `scroll_until_loaded` ONCE. (2) Inspect DOM for the "
        f"recurring exhibitor row selector. (3) Call `extract_by_selector(<sel>)`. "
        f"(4) Emit done with parsed result.\n\n"
        f"If the page turns out to NOT be an exhibitor list (it's a news article, "
        f"a 'related events' index, or just the event homepage with no list), "
        f"do NOT navigate around hunting for one — emit done with empty exhibitors "
        f"and bail_reason 'image_only'. Discovery is best-effort; we'd rather "
        f"finish fast on a bad URL than waste turns wandering.\n\n"
        f"For each exhibitor extract: company name (required), booth, profile "
        f"URL, country."
        f"{_BAIL_OUT_INSTRUCTION}"
    )


async def discover_new_seeds() -> list[AgenticSeed]:
    """Generate up to N new AgenticSeed entries via LLM-expanded multi-engine
    search. Returns [] when discovery is disabled or no qualifying URLs found.
    """
    s = get_agentic_settings()
    if not s.discovery_enabled:
        return []

    # Lazy imports — keep the agentic module import-cheap when discovery is off.
    try:
        from crawler.agents.discovery import expand_seeds
        from crawler.config import get_seed_topics
        from crawler.tools.search.multi import search_all
    except ImportError as e:
        _log.warning("agentic.discovery_imports_failed", error=str(e))
        return []

    topics_cfg = get_seed_topics() or {}
    topics = topics_cfg.get("topics") or []
    if not topics:
        _log.info("agentic.discovery_no_topics")
        return []

    store = await KnowledgeStore.load()
    start, end = await store.next_discovery_topics(
        s.discovery_max_topics_per_pass, len(topics)
    )
    # Slice may wrap when the cursor lands close to len(topics) — handle both.
    if end <= len(topics):
        topic_window = topics[start:end]
    else:
        topic_window = topics[start:] + topics[: end - len(topics)]

    _log.info(
        "agentic.discovery_topics_picked",
        cursor_start=start,
        cursor_end=end,
        total_topics=len(topics),
        labels=[t.get("label") for t in topic_window],
    )

    # `expand_seeds` doesn't take a per-call topic filter — it uses
    # get_seed_topics() under the hood and returns queries for all topics.
    # We call it once and then keep only queries whose lowercased text matches
    # a keyword from our topic window. Cheaper than re-implementing expansion.
    try:
        all_queries = await expand_seeds(
            max_per_topic=s.discovery_max_queries_per_topic,
            force_multilingual=s.agentic_force_multilingual,
        )
    except Exception as e:  # noqa: BLE001
        _log.warning("agentic.discovery_expand_failed", error=str(e)[:200])
        return []

    if not all_queries:
        _log.info("agentic.discovery_no_queries")
        return []

    window_keywords: set[str] = set()
    for t in topic_window:
        for kw in t.get("keywords", []) or []:
            kw = (kw or "").strip().lower()
            if kw:
                window_keywords.add(kw)

    # Filter queries to those that touch one of the windowed topics' keywords.
    # Falls back to the full set when keyword overlap is weak (e.g. queries
    # written in the local script that don't share substrings).
    queries = [
        q for q in all_queries
        if any(kw in q.lower() for kw in window_keywords)
    ]
    if not queries:
        queries = all_queries[: s.discovery_max_queries_per_topic * len(topic_window)]
    queries = queries[: s.discovery_max_queries_per_topic * max(1, len(topic_window))]

    _log.info("agentic.discovery_queries", count=len(queries))

    sem = asyncio.Semaphore(4)

    async def _per_query(q: str) -> list[tuple[str, Any]]:
        async with sem:
            try:
                hits = await search_all(
                    q,
                    per_source_limit=10,
                    force_regions=s.agentic_force_multilingual,
                )
            except Exception as e:  # noqa: BLE001
                _log.debug("agentic.discovery_search_failed", query=q, error=str(e)[:120])
                return []
            return [(q, h) for h in hits]

    raw = await asyncio.gather(*(_per_query(q) for q in queries))
    flat: list[tuple[str, Any]] = [pair for batch in raw for pair in batch]

    threshold = s.discovery_url_score_threshold
    lookback = s.discovery_history_lookback_days

    # Phase 2 — query-level bias map. Built once per pass so the scorer
    # gets a frozen snapshot. Empty dict on first run / wiped archive →
    # no bias applied (scoring degrades gracefully to keyword-only).
    try:
        query_failures = await _load_query_failure_map(s.lessons_dir, lookback)
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.bias_map_failed", error=str(e)[:120])
        query_failures = {}
    if query_failures:
        biased = sum(
            1 for doms in query_failures.values()
            if len(doms) >= _QUERY_BIAS_MIN_DISTINCT_DOMAINS
        )
        _log.info(
            "agentic.discovery_bias_loaded",
            queries_with_failures=len(query_failures),
            biased_queries=biased,
            penalty=_QUERY_BIAS_PENALTY,
        )

    scored: list[tuple[float, str, Any]] = []
    seen_urls: set[str] = set()
    for query, hit in flat:
        url = getattr(hit, "url", "") or ""
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        title = getattr(hit, "title", "") or ""
        snippet = getattr(hit, "snippet", "") or ""
        score = _score_url_relevance(
            url, title, snippet, query=query, query_failures=query_failures,
        )
        if score < threshold:
            continue
        domain = domain_of(url)
        if not domain:
            continue
        if store.is_blacklisted(domain):
            continue
        if store.was_recently_tried(query, domain, lookback):
            continue
        scored.append((score, query, hit))

    # Sort descending by score, take top N.
    scored.sort(key=lambda x: x[0], reverse=True)
    keep = scored[: s.discovery_max_seeds_per_pass]

    out: list[AgenticSeed] = []
    for score, query, hit in keep:
        url = hit.url
        domain = domain_of(url)
        title = (getattr(hit, "title", "") or url)[:60]
        seed = AgenticSeed(
            name=title or domain or "discovered",
            url=url,
            task=_discovery_task_prompt(title or domain or "candidate", query),
            expo_id=None,
            tags=["discovery"],
            source_query=query,
        )
        out.append(seed)
        await store.record_discovery_attempt(query, domain, outcome="queued")

    _log.info(
        "agentic.discovery_done",
        candidates=len(scored),
        kept=len(out),
        threshold=threshold,
    )
    return out
