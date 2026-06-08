"""Name-to-domain resolver via OpenRouter deep-research models.

For vendor rows with no URL (15-20% of ChatGPT-imported corpus + most
unresolved candidates from listing agent), the existing resolver chain is
slow: `name_resolver.resolve_from_name()` fans out 25 search engines and
takes 30-50s per vendor.

A research-class model (e.g. OpenRouter's `deep-research-preview-04-2026`)
queries multiple search backends server-side, evaluates candidate domains
for plausibility, and returns a single guess in 3-8s. Cheaper + faster +
no IP burn on our side.

Used as TIER 0 in `enrich_worker._resolve_domain_via_search`: if this
returns a non-null domain, the rest of the resolver chain is skipped. If
it returns None or fails, the existing chain runs as before.

Note: we keep this independent of the head agent's vision LLM — head agent
might be on Gemini grounding, this resolver always uses OpenRouter so the
two can run in parallel without sharing rate-limit budgets.
"""

from __future__ import annotations

import os
import re
from typing import Any

from pydantic import SecretStr

from crawler.observability.logger import get_logger
from crawler.observability.metrics import errors_total

from .config import get_agentic_settings

_log = get_logger(__name__)

_RESOLVER_PROMPT = """You are a vendor domain resolver. Given the company name and a country hint,
return the OFFICIAL primary domain for the company's website.

Company name: {name}
Country hint: {country}
Product/industry hint: {product}

Rules:
  - Return ONLY the root domain (e.g. "example.com"), no protocol, no www, no path
  - If multiple plausible domains exist, prefer the one matching the country hint
  - If you cannot find a confident answer, return exactly: UNKNOWN
  - Do NOT return aggregator pages (linkedin.com, crunchbase.com, bloomberg.com, wikipedia.org)
  - Do NOT include parent company domains unless the vendor uses that domain themselves

Output: just the domain or UNKNOWN. No quotes, no explanation.
"""

_DOMAIN_RE = re.compile(r"^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$")
_AGGREGATOR_BLACKLIST = {
    "linkedin.com", "crunchbase.com", "bloomberg.com", "wikipedia.org",
    "facebook.com", "twitter.com", "x.com", "youtube.com", "instagram.com",
    "github.com", "google.com", "bing.com", "yahoo.com", "duckduckgo.com",
}


def _extract_domain(raw: str) -> str | None:
    """Pull a domain out of a possibly-prosy model response."""
    if not raw:
        return None
    text = raw.strip().lower()
    if text in {"unknown", "none", "n/a", "null", ""}:
        return None
    # Strip prefixes
    text = re.sub(r"^https?://", "", text).strip()
    text = re.sub(r"^www\.", "", text)
    # Split on whitespace/punct and take first dotted token
    for token in re.split(r"[\s,;\"'<>(){}\[\]]+", text):
        token = token.strip(".").strip("/").strip()
        if not token:
            continue
        # Drop path/query
        token = token.split("/", 1)[0].split("?", 1)[0]
        if _DOMAIN_RE.match(token) and "." in token:
            if token in _AGGREGATOR_BLACKLIST:
                continue
            # Reject obviously-wrong TLDs
            if token.endswith(".local") or token.endswith(".test"):
                continue
            return token
    return None


async def resolve_via_deep_research(
    vendor_name: str,
    country_hint: str | None = None,
    product_hint: str | None = None,
) -> str | None:
    """Single OpenRouter call. Returns root domain or None."""
    s = get_agentic_settings()

    api_key = s.openrouter_api_key or os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        return None
    if not vendor_name or len(vendor_name.strip()) < 2:
        return None

    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        return None

    llm = ChatOpenAI(
        model=s.deep_research_model,
        api_key=SecretStr(api_key),
        base_url="https://openrouter.ai/api/v1",
        timeout=60.0,
        max_retries=1,
        temperature=0.0,
        default_headers={
            "HTTP-Referer": "https://gsp:8090",
            "X-Title": "Autocrawl-Resolver",
        },
    )

    prompt = _RESOLVER_PROMPT.format(
        name=vendor_name.strip(),
        country=country_hint or "unknown",
        product=(product_hint or "unknown")[:200],
    )

    try:
        resp = await llm.ainvoke(prompt)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="deep_research_resolve", category=type(e).__name__).inc()
        _log.warning(
            "agentic.deep_research_resolve_failed",
            vendor=vendor_name[:60], error=str(e)[:150],
        )
        return None

    raw: Any = getattr(resp, "content", "") or ""
    if isinstance(raw, list):
        raw = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in raw)

    domain = _extract_domain(str(raw))
    if domain:
        _log.info(
            "agentic.deep_research_resolve_hit",
            vendor=vendor_name[:60], domain=domain, country=country_hint,
        )
    else:
        _log.debug(
            "agentic.deep_research_resolve_miss",
            vendor=vendor_name[:60], raw=str(raw)[:120],
        )
    return domain
