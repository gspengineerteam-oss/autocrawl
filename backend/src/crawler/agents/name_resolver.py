"""Name-only Vendor URL Resolver.

Used when an ExhibitorRef comes from a PDF and has no `raw_url`. Strategy:
  1. Multi-source search: '"<vendor name>" official website', plus optional
     country and context_snippet variations.
  2. Filter aggregator/social/utility/blacklist domains.
  3. Score remaining candidates by domain ↔ name overlap, plus frequency.
  4. LLM tie-break with the candidate list and exhibitor name + context.
  5. Validate (DNS alive, not parking page, http 2xx).
  6. Return VendorURL with resolution_method="search_llm_tiebreak".

Reuses utilities from existing `resolver.py` and `search.multi`.
"""

from __future__ import annotations

from collections import Counter

from pydantic import BaseModel, Field

from ..observability.logger import get_logger
from ..observability.metrics import errors_total, vendors_resolved_total
from ..schemas import SourceProvenance, VendorURL
from ..tools.url_utils import canonical_domain, canonical_url, is_aggregator_or_excluded

_log = get_logger(__name__)


class _NamePick(BaseModel):
    chosen_url: str | None = Field(default=None)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reasoning: str = Field(default="")


def _name_overlap_score(name: str, domain: str) -> float:
    if not name or not domain:
        return 0.0
    name_tokens = {t.lower() for t in name.replace("-", " ").replace(".", " ").split() if len(t) >= 3}
    if not name_tokens:
        return 0.0
    dom_token = domain.split(".")[0].lower()
    matches = sum(1 for t in name_tokens if t in dom_token or dom_token in t)
    return min(1.0, matches / max(1, len(name_tokens)))


async def resolve_from_name(
    vendor_name: str,
    *,
    expo_id: str = "",
    expo_country: str | None = None,
    context_snippet: str | None = None,
    engines: frozenset[str] | set[str] | None = None,
    per_source_limit: int = 8,
) -> VendorURL | None:
    """Resolve a vendor name (no URL) to canonical website.

    `engines` and `per_source_limit` forwarded to `search_all`. Use
    `FAST_RESOLVE_ENGINES` + `per_source_limit=3` for the agentic enrich
    fast-resolve hop (target 8-12s wall time).
    """
    from ..tools.search.multi import search_all

    queries = [
        f'"{vendor_name}" official website',
        f'"{vendor_name}" company',
    ]
    if expo_country:
        queries.append(f'"{vendor_name}" {expo_country}')
    if context_snippet:
        snippet_excerpt = context_snippet.strip()[:80]
        queries.append(f'"{vendor_name}" {snippet_excerpt}')

    all_hits: list = []
    for q in queries:
        try:
            hits = await search_all(q, per_source_limit=per_source_limit, engines=engines)
            all_hits.extend(hits)
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="name_resolver", category="search").inc()
            _log.debug("name_resolver.search_failed", query=q, error=str(e))

    if not all_hits:
        return None

    candidates_by_domain: dict[str, dict] = {}
    domain_freq: Counter[str] = Counter()
    for h in all_hits:
        if not h.url:
            continue
        if is_aggregator_or_excluded(h.url):
            continue
        dom = canonical_domain(h.url)
        if not dom:
            continue
        domain_freq[dom] += 1
        prior = candidates_by_domain.get(dom)
        if not prior or len(h.title or "") > len(prior.get("title", "")):
            candidates_by_domain[dom] = {
                "url": canonical_url(h.url),
                "domain": dom,
                "title": h.title or "",
                "snippet": h.snippet or "",
            }

    if not candidates_by_domain:
        return None

    scored: list[tuple[float, dict]] = []
    for dom, info in candidates_by_domain.items():
        score = domain_freq[dom] * 1.0 + _name_overlap_score(vendor_name, dom) * 5.0
        scored.append((score, info))
    scored.sort(key=lambda t: t[0], reverse=True)

    top_candidates = [info for _, info in scored[:10]]

    if scored and scored[0][0] >= 6.0:
        winner = scored[0][1]
        from .resolver import _validate_candidate

        if await _validate_candidate(winner["url"]):
            cu = winner["url"]
            vendors_resolved_total.labels(resolution_method="search_llm_tiebreak").inc()
            return VendorURL(
                domain=canonical_domain(cu),
                canonical_url=cu,
                resolved_from=None,
                expo_id=expo_id or "unknown",
                exhibitor_name=vendor_name,
                resolution_method="search_llm_tiebreak",
                confidence=0.8,
                provenance=[SourceProvenance(
                    type="search",
                    url=cu,
                    extraction_method="name_resolver_score",
                    confidence=0.8,
                )],
            )

    pick = await _llm_pick(vendor_name, top_candidates, context_snippet=context_snippet)
    if pick.chosen_url and not is_aggregator_or_excluded(pick.chosen_url):
        from .resolver import _validate_candidate

        if await _validate_candidate(pick.chosen_url):
            cu = canonical_url(pick.chosen_url)
            vendors_resolved_total.labels(resolution_method="search_llm_tiebreak").inc()
            return VendorURL(
                domain=canonical_domain(cu),
                canonical_url=cu,
                resolved_from=None,
                expo_id=expo_id or "unknown",
                exhibitor_name=vendor_name,
                resolution_method="search_llm_tiebreak",
                confidence=max(0.5, min(pick.confidence, 0.85)),
                provenance=[SourceProvenance(
                    type="search",
                    url=cu,
                    extraction_method="name_resolver_llm_tiebreak",
                    confidence=pick.confidence,
                    context_snippet=pick.reasoning[:200] if pick.reasoning else None,
                )],
            )

    _log.info("name_resolver.no_match", vendor=vendor_name, candidates_considered=len(top_candidates))
    return None


async def _llm_pick(vendor_name: str, candidates: list[dict], *, context_snippet: str | None = None) -> _NamePick:
    if not candidates:
        return _NamePick()
    from langchain_core.messages import HumanMessage, SystemMessage

    from ..tools.llm.cloud_router import chat_structured
    from ..tools.llm.openai_client import chat

    rendered = "\n".join(
        f"- {c['url']}\n    title: {c.get('title', '')[:120]!r}\n    snippet: {c.get('snippet', '')[:160]!r}"
        for c in candidates[:15]
    )
    sys = SystemMessage(content=(
        "You disambiguate company URLs. Given a vendor name (and optional "
        "context from a trade-show brochure), return THE ONE URL most likely "
        "to be that company's official website. REJECT social platforms, "
        "news/media, search engines, event aggregators, generic directories. "
        "If unsure, set chosen_url to null."
    ))
    user_text = f"Vendor name: {vendor_name}\n"
    if context_snippet:
        user_text += f"Context from PDF: {context_snippet[:400]}\n"
    user_text += f"\nCandidates:\n{rendered}"
    user = HumanMessage(content=user_text)
    try:
        result = await chat_structured(
            [sys, user], _NamePick, local_chat=chat, tier="light"
        )
        return result if isinstance(result, _NamePick) else _NamePick()
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="name_resolver", category="llm_pick").inc()
        _log.warning("name_resolver.llm_failed", error=str(e))
        return _NamePick()
