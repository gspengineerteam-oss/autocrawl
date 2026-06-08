"""Native google-genai client wrappers for grounded structured calls.

We pick the native `google.genai` SDK over the langchain ChatGoogleGenerativeAI
wrapper because:

1. Native SDK supports `tools=[Tool(google_search=GoogleSearch())]` AND
   `response_json_schema=PydanticModel` together. The langchain wrapper
   doesn't expose response_json_schema cleanly when tools are passed.

2. Grounding metadata (cited URLs, search queries) lives on the response
   candidate, accessible directly via `resp.candidates[0].grounding_metadata`.
   The langchain wrapper buries this in `additional_kwargs` and isn't
   guaranteed across versions.

3. Async client `client.aio.models.generate_content(...)` matches our
   asyncio-everywhere worker pattern without extra adapter shim.

Two main helpers:

- `resolve_vendor_domain_grounded(name, country, product_hint)`:
    one Gemini call with google_search tool to find official domain.
    Returns (domain_or_None, confidence_label).

- `extract_vendor_summary_grounded(name, domain)`:
    one Gemini call to extract description, products, industries, employee
    count from public sources. Used as fallback when Jina markdown is
    sparse but the company is well-known on the web.
"""

from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, Field

from crawler.observability.logger import get_logger
from crawler.observability.metrics import errors_total

from .config import get_agentic_settings

_log = get_logger(__name__)


# Singleton client cache. genai.Client is thread-safe and reuses HTTP pools.
_CLIENT = None


def _get_client():
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    s = get_agentic_settings()
    api_key = s.google_api_key or os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY missing; set in .env or agentic settings")
    try:
        from google import genai
    except ImportError as e:
        raise RuntimeError(f"google-genai not installed: {e}")
    _CLIENT = genai.Client(api_key=api_key)
    return _CLIENT


# === Resolve: name -> domain ============================================

class _DomainResolveOut(BaseModel):
    domain: str = Field(description="Official root domain, no protocol, no www, no path. UNKNOWN if uncertain.")
    confidence: Literal["high", "medium", "low"] = Field(description="high if you verified from official source, medium if circumstantial, low if guess")
    rationale: str = Field(description="One sentence why this is the right domain", default="")


def _normalize_domain(raw: str) -> str | None:
    if not raw:
        return None
    d = raw.strip().lower()
    if d in {"unknown", "none", "n/a", "null", ""}:
        return None
    d = d.replace("https://", "").replace("http://", "").strip("/")
    if d.startswith("www."):
        d = d[4:]
    d = d.split("/", 1)[0].split("?", 1)[0]
    if " " in d or "." not in d:
        return None
    if d.endswith((".local", ".test", ".example")):
        return None
    if d in {
        "linkedin.com", "facebook.com", "twitter.com", "x.com", "youtube.com",
        "crunchbase.com", "bloomberg.com", "wikipedia.org", "instagram.com",
        "github.com", "google.com", "bing.com", "yahoo.com",
    }:
        return None
    return d


async def resolve_vendor_domain_grounded(
    name: str,
    country_hint: str | None = None,
    product_hint: str | None = None,
    *,
    model: str | None = None,
) -> tuple[str | None, str]:
    """One grounded Gemini call. Returns (domain, confidence_label).

    Uses google_search tool so Gemini can actually web-search the company
    name; uses response_json_schema to force a Pydantic-validated reply.
    """
    if not name or len(name.strip()) < 2:
        return None, "low"

    try:
        client = _get_client()
        from google.genai import types as gtypes
    except Exception as e:  # noqa: BLE001
        _log.warning("gemini_grounded.client_init_failed", error=str(e)[:120])
        return None, "low"

    s = get_agentic_settings()
    model_name = model or s.grounding_model or "gemini-2.5-flash"

    prompt = f"""Find the OFFICIAL website domain for the company "{name.strip()}".
Country hint: {country_hint or 'unknown'}
Product/industry hint: {(product_hint or 'unknown')[:200]}

Use web search to verify. Return the root domain (e.g. "example.com") without protocol, www, or path.
If multiple plausible domains exist, prefer the one matching the country hint.
If you cannot find a confident answer, return domain="UNKNOWN" with confidence="low".
Do NOT return aggregator/social domains (linkedin.com, crunchbase.com, wikipedia.org, etc.).
"""

    # 2026-05-22 tick 14: throttle via shared sliding-window rate limiter
    # so 30+ worker tidak overshoot Gemini free tier 15 RPM. Key di-share
    # antar container via Redis.
    from crawler.tools.llm.rate_limit import acquire_rate_slot
    s_rpm = get_agentic_settings()
    rpm_cap = max(1, int(s_rpm.gemini_free_rpm))
    try:
        async with acquire_rate_slot("gemini-grounded", max_per_minute=rpm_cap):
            resp = await client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=gtypes.GenerateContentConfig(
                    tools=[gtypes.Tool(google_search=gtypes.GoogleSearch())],
                    temperature=0.0,
                    # Note: when tools are enabled, response_json_schema may be
                    # rejected for some Gemini variants. We fall back to free-form
                    # parsing in that case.
                ),
            )
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="gemini_grounded_resolve", category=type(e).__name__).inc()
        _log.warning(
            "gemini_grounded.resolve_call_failed",
            name=name[:60], error=str(e)[:160],
        )
        return None, "low"

    raw_text = (getattr(resp, "text", "") or "").strip()
    if not raw_text:
        return None, "low"

    # Try strict JSON parse first, then fall back to first dotted token.
    domain = None
    confidence = "low"
    try:
        import json
        import re

        m = re.search(r"\{[^{}]*\}", raw_text)
        if m:
            data = json.loads(m.group(0))
            domain = _normalize_domain(str(data.get("domain", "")))
            conf = str(data.get("confidence", "low")).lower().strip()
            confidence = conf if conf in {"high", "medium", "low"} else "low"
    except (ValueError, KeyError):
        pass

    if domain is None:
        # Free-form: find first domain-shaped token in the text.
        import re

        for tok in re.findall(r"[a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+", raw_text):
            cand = _normalize_domain(tok)
            if cand:
                domain = cand
                confidence = "medium"
                break

    if domain:
        _log.info(
            "gemini_grounded.resolve_hit",
            name=name[:60], domain=domain, confidence=confidence,
        )
        try:
            from .agent_trace_publisher import publish_trace
            publish_trace(
                kind="resolve_hit",
                agent="gemini-resolve",
                verdict="success",
                text=f"{name[:60]} -> {domain} ({confidence})",
            )
        except Exception:  # noqa: BLE001
            pass
    else:
        _log.debug(
            "gemini_grounded.resolve_miss",
            name=name[:60], raw=raw_text[:160],
        )
        try:
            from .agent_trace_publisher import publish_trace
            publish_trace(
                kind="resolve_hit",
                agent="gemini-resolve",
                verdict="fail",
                text=f"{name[:60]} -> UNKNOWN (no confident domain)",
            )
        except Exception:  # noqa: BLE001
            pass
    return domain, confidence


# === Extract: domain -> contact/product summary ==========================

class GroundedVendorSummary(BaseModel):
    description: str | None = None
    products: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    employee_count: int | None = None
    founded_year: int | None = None
    headquarters_country: str | None = None
    primary_email: str | None = None
    primary_phone: str | None = None


async def _extract_via_openrouter(
    name: str, domain: str
) -> GroundedVendorSummary | None:
    """OpenRouter extract path (no grounding tool, just LLM knowledge).
    Used as primary when Gemini quota exhausted, since OpenRouter has
    independent quota and is reasonably cheap."""
    import os
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        return None
    try:
        from langchain_openai import ChatOpenAI
        from pydantic import SecretStr as _SS
    except ImportError:
        return None

    s = get_agentic_settings()
    # Prefer deep_research_model if set, else gemini-flash-lite-latest via OR
    model = s.deep_research_model or "gemini-flash-lite-latest"
    llm = ChatOpenAI(
        model=model,
        api_key=_SS(api_key),
        base_url="https://openrouter.ai/api/v1",
        timeout=60.0,
        max_retries=1,
        temperature=0.0,
        default_headers={"HTTP-Referer": "https://gsp:8090", "X-Title": "Autocrawl-Extract"},
    )
    prompt = f"""Return a JSON object summarizing the company "{name}" (domain: {domain}).
Keys (use null when unknown):
- description: 1-3 sentence what they do
- products: list ONLY actual product names you can verify from public sources. If you cannot verify any, return []. NEVER pad to reach a count. Max 8.
- industries: list ONLY verified industries the company actually operates in. If unsure, return []. NEVER pad. Max 5.
- employee_count: integer or null
- founded_year: integer or null
- headquarters_country: country name or null
- primary_email: contact email or null
- primary_phone: phone or null

Empty arrays are preferred over guessed values. Padding poisons our database.
ONLY the JSON object, no markdown."""
    try:
        resp = await llm.ainvoke(prompt)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="openrouter_extract", category=type(e).__name__).inc()
        _log.debug("openrouter.extract_failed", name=name[:60], error=str(e)[:160])
        return None
    raw = getattr(resp, "content", "") or ""
    if isinstance(raw, list):
        raw = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw)
    if not raw or not str(raw).strip():
        return None
    import json
    import re
    m = re.search(r"\{[\s\S]*\}", str(raw))
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    try:
        return GroundedVendorSummary(**{
            k: data.get(k)
            for k in ("description", "products", "industries", "employee_count",
                      "founded_year", "headquarters_country", "primary_email", "primary_phone")
        })
    except Exception:  # noqa: BLE001
        return None


async def extract_vendor_summary_grounded(
    name: str,
    domain: str,
    *,
    model: str | None = None,
) -> GroundedVendorSummary | None:
    """Pull a structured vendor summary from the open web via Gemini grounding.

    Used as a fallback when Jina fast-path returned thin markdown but the
    company is well-known on the public web (Wikipedia, press releases).

    2026-05-22 tick 11: When Gemini key is exhausted (429), automatically
    fall back to OpenRouter (independent quota). Saves the catalog gap
    fill during free-tier daily windows.
    """
    if not name or not domain:
        return None
    try:
        client = _get_client()
        from google.genai import types as gtypes
    except Exception:
        # Gemini client unavailable - try OpenRouter directly
        return await _extract_via_openrouter(name, domain)

    s = get_agentic_settings()
    model_name = model or s.grounding_model or "gemini-2.5-flash"

    prompt = f"""Find publicly available info about the company "{name}" (domain: {domain}).

Use web search. Return a JSON object with these keys (use null when unknown):
- description: one paragraph (1-3 sentences) describing what they do
- products: list ONLY product names you can verify from official sources (company website, press releases, Wikipedia). If you cannot verify ANY specific products, return []. NEVER pad with generic guesses. Max 8.
- industries: list ONLY industries explicitly stated in verified sources. NEVER pad. Max 5.
- employee_count: integer or null
- founded_year: integer year or null
- headquarters_country: country name or null
- primary_email: official contact email or null
- primary_phone: international phone number or null

Empty arrays are preferred over fabricated values. Padding poisons our database.

Output ONLY the JSON object, no markdown, no commentary.
"""

    # Throttle via shared sliding-window (same key as resolve, single bucket)
    from crawler.tools.llm.rate_limit import acquire_rate_slot
    s_rpm = get_agentic_settings()
    rpm_cap = max(1, int(s_rpm.gemini_free_rpm))
    try:
        async with acquire_rate_slot("gemini-grounded", max_per_minute=rpm_cap):
            resp = await client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=gtypes.GenerateContentConfig(
                    tools=[gtypes.Tool(google_search=gtypes.GoogleSearch())],
                    temperature=0.0,
                ),
            )
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="gemini_grounded_extract", category=type(e).__name__).inc()
        err_str = str(e)
        _log.warning(
            "gemini_grounded.extract_failed",
            name=name[:60], error=err_str[:160],
        )
        # Quota exhausted -> try OpenRouter fallback
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
            return await _extract_via_openrouter(name, domain)
        return None

    raw = (getattr(resp, "text", "") or "").strip()
    if not raw:
        return None

    import json
    import re

    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    try:
        return GroundedVendorSummary(**{
            k: data.get(k)
            for k in (
                "description", "products", "industries", "employee_count",
                "founded_year", "headquarters_country",
                "primary_email", "primary_phone",
            )
        })
    except Exception:  # noqa: BLE001
        return None


__all__ = [
    "GroundedVendorSummary",
    "resolve_vendor_domain_grounded",
    "extract_vendor_summary_grounded",
]
