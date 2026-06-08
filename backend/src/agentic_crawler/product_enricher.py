"""Phase 5 — Product catalog enricher.

Takes a Vendor with `products: list[str]` (legacy generic categories like
"Land Platforms" or already-specific names like "Cougar 4x4 MRAP") and
produces a rich `list[Product]` with per-product summary, pros/cons,
scope-fit score, and matched DOI topics.

Two LLM calls per product:
1. **Summary call** (tier=light): generate {category, summary, pros[], cons[]}
   from buyer perspective. Reuses the same Mistral instance the live agent
   uses.
2. **Scope call** via `product_scope_scorer.score_product()` (tier=light):
   judge against `seed_topics.yaml` taxonomy. Returns score + reason +
   matched topics.

One LLM call per vendor at the end:
3. **Focus summary call** (tier=light): synthesise 1-paragraph "what this
   vendor does" from name + description + top products. Surfaces in
   frontend Katalog tab header.

Concurrency: per-product calls are awaited sequentially per vendor (we
don't want 10 simultaneous LLM calls for one vendor — listing pool would
starve). Multiple vendors processed in parallel = OK because the LLM
queue semaphore caps tier=light cluster-wide.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from crawler.agents.product_scope_scorer import score_product
from crawler.observability.logger import get_logger
from crawler.schemas import Product, Vendor
from crawler.tools.llm.cloud_router import chat_structured
from crawler.tools.llm.openai_client import chat

_log = get_logger(__name__)


_SUMMARY_SYSTEM = (
    "You write concise procurement-officer-friendly product briefs. "
    "Given a vendor and one of its products, return JSON with: "
    "category (2-4 word noun phrase), summary (1 paragraph, 2-4 sentences), "
    "pros (2-3 short bullet phrases — strengths from a BUYER's perspective), "
    "cons (2-3 short bullet phrases — risks/limits/trade-offs the buyer "
    "should know). "
    "Be factual where possible; mark inference clearly with 'likely' or 'typically'. "
    "If the product name is generic (e.g. 'Land Platforms'), interpret it as "
    "the vendor's offering category and write accordingly. "
    "Respond ONLY with valid JSON. No prose, no fences."
)

_FOCUS_SYSTEM = (
    "You write 1-paragraph vendor focus statements for a procurement officer. "
    "Given vendor name, description, and top products, write a single paragraph "
    "(3-5 sentences) describing what the vendor does, their primary market, "
    "and what makes them notable for procurement. "
    "Plain prose only. No bullets. No JSON. Maximum 600 characters."
)


class _ProductBrief(BaseModel):
    category: str | None = Field(default=None, max_length=80)
    summary: str | None = Field(default=None, max_length=800)
    pros: list[str] = Field(default_factory=list, max_length=4)
    cons: list[str] = Field(default_factory=list, max_length=4)


async def _generate_product_brief(
    product_name: str,
    *,
    vendor_name: str,
    vendor_description: str | None,
) -> _ProductBrief:
    """LLM call #1: summary + pros + cons."""
    user_lines = [
        f"Vendor: {vendor_name}",
    ]
    if vendor_description:
        user_lines.append(f"Vendor context: {vendor_description[:400]}")
    user_lines.append(f"Product: {product_name}")
    user = HumanMessage(content="\n".join(user_lines))
    system = SystemMessage(content=_SUMMARY_SYSTEM)
    try:
        result = await chat_structured(
            [system, user], _ProductBrief, local_chat=chat, tier="light"
        )
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "product_enricher.brief_failed",
            product=product_name[:80], error=str(e)[:200],
        )
        return _ProductBrief()
    if not isinstance(result, _ProductBrief):
        return _ProductBrief()
    return result


async def _generate_focus_summary(
    vendor: Vendor,
    top_products: list[Product],
) -> str | None:
    """LLM call #3: vendor-level focus paragraph."""
    if not top_products:
        return None
    products_str = ", ".join(
        f"{p.name}" + (f" ({p.category})" if p.category else "")
        for p in top_products[:6]
    )
    user_lines = [
        f"Vendor name: {vendor.company_name}",
        f"Vendor description: {(vendor.description or '')[:600]}",
        f"Top products: {products_str}",
    ]
    user = HumanMessage(content="\n".join(user_lines))
    system = SystemMessage(content=_FOCUS_SYSTEM)
    try:
        # Plain text response, no Pydantic schema. The chat() helper
        # returns a string when no response_format is given.
        result = await chat([system, user], tier="light")
    except Exception as e:  # noqa: BLE001
        _log.debug(
            "product_enricher.focus_failed",
            vendor=vendor.company_name[:80], error=str(e)[:200],
        )
        return None
    if isinstance(result, str):
        return result.strip()[:600] or None
    # langchain returns AIMessage in some configs; pull .content
    content = getattr(result, "content", None)
    if isinstance(content, str):
        return content.strip()[:600] or None
    return None


# Image extraction — best-effort `og:image` / `twitter:image` from vendor
# homepage. One fetch per vendor (not per product) to stay polite. All
# products of a vendor share the same vendor-level hero image. If extract
# fails, image_url stays None and frontend renders a gradient placeholder.
_HERO_IMAGE_PATTERNS = [
    re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', re.I),
    re.compile(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', re.I),
    re.compile(r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)', re.I),
]


async def _fetch_vendor_hero_image(domain: str | None) -> str | None:
    """Try to extract og:image from vendor homepage. Returns absolute URL
    or None if not extractable. ~3-second budget, single shot, fails soft."""
    if not domain:
        return None
    try:
        import httpx
    except ImportError:
        return None
    base = f"https://{domain.lstrip('https://').lstrip('http://').rstrip('/')}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        async with httpx.AsyncClient(
            headers=headers, timeout=httpx.Timeout(8.0, connect=4.0),
            follow_redirects=True,
        ) as client:
            r = await client.get(base + "/")
            if r.status_code != 200:
                return None
            ctype = r.headers.get("content-type", "").lower()
            if "html" not in ctype:
                return None
            html = r.text[:200_000]  # cap to first 200KB
    except Exception as e:  # noqa: BLE001
        _log.debug(
            "product_enricher.hero_image_fetch_failed",
            domain=domain, error=str(e)[:120],
        )
        return None

    for pat in _HERO_IMAGE_PATTERNS:
        m = pat.search(html)
        if not m:
            continue
        raw = m.group(1).strip()
        if not raw or len(raw) > 2000:
            continue
        # Resolve relative URLs against vendor base.
        try:
            absolute = urljoin(base + "/", raw)
        except Exception:  # noqa: BLE001
            absolute = raw
        # Sanity: must be http(s).
        try:
            parsed = urlparse(absolute)
            if parsed.scheme not in ("http", "https"):
                continue
        except Exception:  # noqa: BLE001
            continue
        return absolute
    return None


def _is_generic_product_name(name: str) -> bool:
    """Heuristic: True if the product name is a category-like generic
    phrase (e.g. 'Land Platforms', 'Software Solutions') rather than a
    specific product. Used to route generic items through a slightly
    different summary prompt — they describe the *category* not a SKU."""
    if not name:
        return True
    n = name.strip().lower()
    if len(n) < 4 or len(n.split()) > 5:
        return False
    generics = {
        "platforms", "solutions", "services", "products", "systems",
        "software", "hardware", "equipment", "supplies", "tools",
    }
    last_word = n.split()[-1]
    return last_word in generics


async def _enrich_one_product(
    product_name: str,
    *,
    vendor: Vendor,
) -> Product:
    """Run summary + scope LLM calls for one product. Returns Product
    with all fields populated (zeroed-out on LLM errors)."""
    # 1) Summary call
    brief = await _generate_product_brief(
        product_name,
        vendor_name=vendor.company_name,
        vendor_description=vendor.description,
    )
    # 2) Scope call (uses summary as additional context if available)
    scope = await score_product(
        product_name,
        product_summary=brief.summary,
        vendor_name=vendor.company_name,
        vendor_description=vendor.description,
    )
    return Product(
        name=product_name.strip()[:200],
        category=brief.category or scope.category,
        summary=brief.summary,
        scope_match_score=scope.score,
        scope_match_reason=scope.reason or None,
        matched_topics=scope.matched_topics,
        pros=brief.pros[:4],
        cons=brief.cons[:4],
        source_url=None,
    )


def _aggregate_doi(products: list[Product]) -> list[str]:
    """Union of matched_topics across products, ordered by frequency desc."""
    counts: dict[str, int] = {}
    for p in products:
        for t in p.matched_topics:
            counts[t] = counts.get(t, 0) + 1
    return [t for t, _ in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)]


def _aggregate_score(products: list[Product]) -> float:
    """Vendor-level scope score = max of any product's score (a vendor with
    even one strongly-matching product is worth surfacing)."""
    if not products:
        return 0.0
    return max(p.scope_match_score for p in products)


class EnrichmentOutput(BaseModel):
    """Return shape for `enrich_vendor_products`. Persisted by caller."""

    products_detailed: list[Product] = Field(default_factory=list)
    overall_scope_score: float = 0.0
    focus_summary: str | None = None
    domain_of_interest: list[str] = Field(default_factory=list)
    elapsed_s: float = 0.0
    n_products: int = 0


async def enrich_vendor_products(
    vendor: Vendor,
    *,
    product_cap: int | None = None,
) -> EnrichmentOutput:
    """Enrich the vendor's product catalog. Returns structured result;
    caller persists via `vendor_repo.update_product_catalog`.

    `product_cap` limits how many products we run LLM on per vendor.
    When None, reads `settings.product_cap` (env AGENTIC_PRODUCT_CAP,
    default 6). Lower cap = faster backfill drain at the cost of fewer
    products per vendor surfaced.
    """
    from .config import get_agentic_settings as _agentic_settings
    _s = _agentic_settings()
    cap = product_cap if product_cap is not None else _s.product_cap
    focus_min = _s.product_focus_min_score
    started = time.perf_counter()
    products_input = [p.strip() for p in (vendor.products or []) if p and p.strip()]
    products_input = list(dict.fromkeys(products_input))  # dedupe preserve order
    products_input = products_input[:cap]

    if not products_input:
        return EnrichmentOutput(elapsed_s=time.perf_counter() - started)

    # Sequentially per-vendor (don't blast 10 LLM calls in parallel — share
    # tier=light cap with other vendors processing concurrently). The vendor-
    # level concurrency comes from the worker pool above us.
    products_detailed: list[Product] = []
    for name in products_input:
        try:
            p = await _enrich_one_product(name, vendor=vendor)
        except Exception as e:  # noqa: BLE001
            _log.warning(
                "product_enricher.product_failed",
                vendor=vendor.company_name[:80], product=name[:80],
                error=str(e)[:200],
            )
            p = Product(name=name[:200])
        products_detailed.append(p)

    overall = _aggregate_score(products_detailed)
    doi = _aggregate_doi(products_detailed)
    # Sort products: highest score first (frontend renders in order).
    products_detailed.sort(key=lambda p: p.scope_match_score, reverse=True)

    # Hero image extraction — one fetch per vendor, all products inherit.
    # Cheaper than per-product image scraping which would need product-page
    # navigation. Frontend renders gradient fallback when image_url=None.
    hero = await _fetch_vendor_hero_image(vendor.domain)
    if hero:
        for p in products_detailed:
            if not p.image_url:
                p.image_url = hero

    # Skip focus_summary LLM call for low-scope vendors. Saves ~1 RTT
    # per vendor when overall score is below threshold (irrelevant to
    # buyer anyway since frontend hides low-scope vendors).
    if overall >= focus_min:
        focus = await _generate_focus_summary(vendor, products_detailed)
    else:
        focus = None

    elapsed = time.perf_counter() - started
    _log.info(
        "product_enricher.done",
        vendor=vendor.company_name[:80], domain=vendor.domain,
        n_products=len(products_detailed),
        overall_score=round(overall, 3),
        n_doi=len(doi), elapsed_s=round(elapsed, 1),
    )
    return EnrichmentOutput(
        products_detailed=products_detailed,
        overall_scope_score=overall,
        focus_summary=focus,
        domain_of_interest=doi,
        elapsed_s=elapsed,
        n_products=len(products_detailed),
    )


# CLI smoke-test entrypoint:
# `python -m agentic_crawler.product_enricher --vendor-id <id> --dry-run`
def _main() -> None:
    import argparse
    import json

    parser = argparse.ArgumentParser()
    parser.add_argument("--vendor-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    async def _run() -> None:
        from crawler.db.repositories.vendor_repo import (
            get_by_vendor_id, orm_to_dict,
        )
        from crawler.db.session import get_session

        async with get_session() as session:
            row = await get_by_vendor_id(session, args.vendor_id)
        if not row:
            print(f"vendor {args.vendor_id} not found")
            return
        v = Vendor.model_validate(orm_to_dict(row))
        out = await enrich_vendor_products(v)
        print(json.dumps(out.model_dump(), indent=2, ensure_ascii=False, default=str))
        if args.dry_run:
            return
        # When run live (no --dry-run), caller would persist via vendor_repo.

    asyncio.run(_run())


if __name__ == "__main__":
    _main()
