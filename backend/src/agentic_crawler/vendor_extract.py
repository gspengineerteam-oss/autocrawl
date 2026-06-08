from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

from crawler.observability.logger import get_logger
from crawler.observability.metrics import errors_total

from .config import get_agentic_settings
from .gemini_grounded import GroundedVendorSummary

_log = get_logger(__name__)


_OLLAMA_MAX_CONCURRENT = int(os.getenv("AGENTIC_OLLAMA_MAX_CONCURRENT", "2"))
_ollama_sem: asyncio.Semaphore | None = None


def _get_ollama_sem() -> asyncio.Semaphore:
    global _ollama_sem
    if _ollama_sem is None:
        _ollama_sem = asyncio.Semaphore(_OLLAMA_MAX_CONCURRENT)
    return _ollama_sem


_JUNK_NAMES = frozenset({
    "consent", "details", "cloudflare 1", "cloudflare", "loading",
    "cookie", "accept", "decline", "submit", "search", "menu", "home",
    "about", "contact", "login", "register", "signup", "subscribe",
    "more info", "info", "information", "click here", "read more",
    "privacy", "terms", "policy", "skip", "close", "next", "previous",
    "show all", "show more", "filter", "sort", "share", "follow",
    "information for visitors", "information for exhibitors",
    "exhibitor information", "visitor information", "press release",
    "experience", "exhibition", "networking", "tech seminar",
    "plan your trip", "build your custom agenda", "registration",
    "schedule", "agenda", "venue", "hotels", "travel", "speakers",
    "sponsors", "media", "news", "blog", "events", "exhibitor list",
    "floor plan", "map", "directions", "parking", "shuttle", "faq",
    "faqs", "faqs & contact us", "frequently asked questions",
    "register now", "buy tickets", "get tickets", "free pass",
    "media pass", "press pass", "join us", "learn more", "see more",
    "view all", "all events", "all exhibitors", "browse",
    "exhibition preview", "preview", "overview", "welcome",
    "what's new", "highlights", "program", "sessions", "tracks",
})

# 2026-05-22: regex pattern untuk UI text yang lolos exact match
_JUNK_PATTERNS = (
    re.compile(r"^(welcome|join|register|sign\s*up|sign\s*in|log\s*in|get\s+started)", re.I),
    re.compile(r"^(here'?s\s+|let'?s\s+|you'?re\s+)", re.I),
    re.compile(r"^(click|tap|press|swipe)\b", re.I),
    re.compile(r"\?$"),  # ends with question mark = call to action
    re.compile(r"\.{3,}|…"),  # ellipsis = truncated UI text
    re.compile(r"^(faqs?|faq\b|terms|privacy|cookie)\s*(&|and|\+)", re.I),
    re.compile(r"^\s*(home|contact|about)\s*[|/>-]", re.I),
)


def _normalize_unicode_punct(s: str) -> str:
    """Curly quotes/apostrophes/dashes → ASCII so junk-name compare hits."""
    return (
        s.replace("’", "'").replace("‘", "'")
        .replace("“", '"').replace("”", '"')
        .replace("–", "-").replace("—", "-")
        .replace("…", "...")
    )


def _is_junk_name(name: str) -> bool:
    if not name or len(name.strip()) < 3:
        return True
    n = _normalize_unicode_punct(name.strip()).lower()
    if n in _JUNK_NAMES:
        return True
    # Reject if entire name is a single common stopword/UI verb
    if " " not in n and n in {
        "submit", "click", "select", "open", "save", "delete",
        "view", "show", "hide", "edit", "create", "remove",
    }:
        return True
    if n.isdigit() or len(n.replace(" ", "")) < 4:
        return True
    for pat in _JUNK_PATTERNS:
        if pat.search(name.strip()):
            return True
    return False


def _name_appears_in_markdown(name: str, markdown: str) -> bool:
    if not markdown or not name:
        return False
    md_l = markdown.lower()
    n_l = name.strip().lower()
    if n_l in md_l:
        return True
    tokens = [t for t in re.split(r"[\s\-_,&]+", n_l) if len(t) > 3]
    skip = {"corporation", "company", "incorporated", "limited", "group", "global"}
    for tok in tokens:
        if tok in skip:
            continue
        if tok in md_l:
            return True
    return False


_EXTRACT_PROMPT = """You receive raw markdown from a company's website. Extract
structured info about the company. Return ONLY a single JSON object, no
markdown fences, no commentary.

Company name: {name}
Domain: {domain}

Markdown content (truncated):
{markdown}

Return JSON with these keys (use null when unknown):
{{
  "description": "1-3 sentences describing what they do",
  "products": ["list ONLY product or service names that appear LITERALLY in the markdown above. If you see only 2 real products, return 2. If you see none, return []. NEVER pad with guessed or generic names. Max 8."],
  "industries": ["list ONLY industries explicitly mentioned in the markdown. If you only see 1 industry, return 1. NEVER pad to reach a count. Max 5."],
  "employee_count": integer or null,
  "founded_year": integer or null,
  "headquarters_country": "country name" or null,
  "primary_email": "official contact email" or null,
  "primary_phone": "+CC phone number" or null
}}

Padding with guessed values poisons our database. Empty arrays are valid and preferred over fabricated content.
"""


def _strip_fences(s: str) -> str:
    s = s.strip()
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", s, flags=re.DOTALL)
    if m:
        return m.group(1).strip()
    return s


def _parse_json_to_summary(raw: str) -> GroundedVendorSummary | None:
    if not raw:
        return None
    text = _strip_fences(raw)
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except (ValueError, TypeError):
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
    except Exception:  
        return None


def _normalize_to_url(domain_or_url: str) -> str | None:
    if not domain_or_url:
        return None
    s = domain_or_url.strip()
    if not s:
        return None
    # If looks like URL, parse it
    if "://" in s or s.startswith("//") or "/" in s:
        try:
            from urllib.parse import urlparse
            candidate = s if "://" in s else f"https://{s.lstrip('/')}"
            host = (urlparse(candidate).hostname or "").lower()
        except Exception:  # noqa: BLE001
            return None
        if not host:
            return None
        if host.startswith("www."):
            host = host[4:]
        return f"https://{host}"
    host = s.lower().rstrip("/")
    if host.startswith("www."):
        host = host[4:]
    if "." not in host:
        return None
    return f"https://{host}"


async def _fetch_jina_markdown(domain: str, timeout_s: int = 20) -> str | None:
    url = _normalize_to_url(domain)
    if not url:
        return None
    try:
        from crawler.tools.browsers.jina_reader import fetch_clean_markdown
        md = await asyncio.wait_for(
            fetch_clean_markdown(url, timeout_seconds=timeout_s),
            timeout=timeout_s + 5,
        )
        if md:
            _log.debug("vendor_extract.jina_fetch_ok", url=url, bytes=len(md))
        else:
            _log.debug("vendor_extract.jina_fetch_empty", url=url)
        return md
    except Exception as e:  # noqa: BLE001
        _log.debug("vendor_extract.jina_fetch_failed", domain=domain, error=str(e)[:120])
        return None


async def _extract_via_ollama(name: str, domain: str, markdown: str | None) -> GroundedVendorSummary | None:
    s = get_agentic_settings()
    base = (s.llm_base_url or "http://10.83.81.246:11434").rstrip("/")
    model = s.vision_model or "qwen3-coder:30b"

    if not markdown:
        markdown = await _fetch_jina_markdown(domain) or ""
    md_trim = markdown[:6000] if markdown else ""
    if not md_trim:
        _log.info(
            "vendor_extract.skip_no_grounding",
            name=name[:60], domain=(domain or "")[:60],
            reason="markdown_unavailable",
        )
        return None
    if not _name_appears_in_markdown(name, md_trim):
        _log.info(
            "vendor_extract.skip_no_anchor",
            name=name[:60], domain=(domain or "")[:60],
            reason="name_absent_from_markdown",
        )
        return None

    prompt = _EXTRACT_PROMPT.format(
        name=name, domain=domain or "unknown",
        markdown=md_trim or "(no markdown available, infer from name+domain only)",
    )

    import httpx
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.0, "num_predict": 500, "num_ctx": 8192},
    }
    try:
        async with _get_ollama_sem():
            async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
                r = await client.post(f"{base}/api/chat", json=payload)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="vendor_extract_ollama", category=type(e).__name__).inc()
        _log.warning(
            "vendor_extract.ollama_call_failed",
            name=name[:60],
            error_type=type(e).__name__,
            error=(str(e) or repr(e))[:160],
        )
        return None

    if r.status_code != 200:
        _log.warning("vendor_extract.ollama_http", name=name[:60], status=r.status_code, body=r.text[:200])
        return None

    try:
        body = r.json()
    except Exception:  # noqa: BLE001
        return None
    raw = body.get("message", {}).get("content", "") if isinstance(body, dict) else ""
    summary = _parse_json_to_summary(raw)
    if summary and (summary.products or summary.description):
        _log.info(
            "vendor_extract.ollama_hit",
            name=name[:60], domain=domain,
            products=len(summary.products), industries=len(summary.industries),
        )
    return summary


def _looks_like_padded_halu(summary: GroundedVendorSummary | None) -> bool:
    if summary is None:
        return False
    p = summary.products or []
    i = summary.industries or []
    return len(p) == 8 and len(i) == 5


async def extract_vendor_summary(
    name: str,
    domain: str,
    *,
    markdown: str | None = None,
) -> GroundedVendorSummary | None:
    if not name:
        return None
    if _is_junk_name(name):
        _log.info(
            "vendor_extract.skip_junk_name",
            name=name[:60], domain=domain,
        )
        return None
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()

    if provider in {"google", "gemini", "google_gemini"}:
        try:
            from .gemini_grounded import extract_vendor_summary_grounded
            result = await extract_vendor_summary_grounded(name, domain)
        except Exception as e:  # noqa: BLE001
            _log.debug("vendor_extract.gemini_failed_fallback_ollama", error=str(e)[:120])
            result = await _extract_via_ollama(name, domain, markdown)
    else:
        result = await _extract_via_ollama(name, domain, markdown)

    if _looks_like_padded_halu(result):
        _log.info(
            "vendor_extract.skip_padded_halu",
            name=name[:60], domain=(domain or "")[:60],
            products=len(result.products), industries=len(result.industries),
        )
        return None
    return result


__all__ = ["extract_vendor_summary"]
