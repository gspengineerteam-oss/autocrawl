"""Gemini-grounded head agent — text-tier alternative to Browser-Use vision.

Why: the existing `agent.py` head agent uses Browser-Use + ChatOllama with a
Chromium fingerprint and screenshot OCR. Two problems:

1. Bot-detection surface area. Real browser = identifiable. Many exhibitor
   pages now serve interstitial CAPTCHAs / Cloudflare 403 to Chromium.
2. Throughput. A vision step on a 27B VLM is 20-60s; a listing page can need
   15-30 steps -> 5-30 minutes per seed.

Grounding tier: ask Gemini (with the `google_search_retrieval` tool enabled)
to fetch the listing URL via Google's own crawl infra and emit JSON of
exhibitors. Three-call sequence:

  (a) Bootstrap: "Visit URL, return exhibitor list as JSON."
  (b) Confidence gate: parsed JSON must report `confidence!=low` AND
      `len(exhibitors) >= grounding_min_threshold`.
  (c) If gate fails: return AgentResult with `error="grounding_low_confidence"`
      so runner.py can fallback to the Browser-Use agent.

Output `AgentResult` shape matches `agent.run_agent_for_seed` so runner.py
treats both interchangeably. `final_url` is the seed URL itself (no browser
navigation happened). `raw_steps` is the Gemini prompt + response for audit.
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any

from pydantic import BaseModel, Field, SecretStr

from crawler.observability.logger import get_logger
from crawler.observability.metrics import errors_total  # reuse generic counter

from .agent import AgentResult, _Exhibitor
from .config import get_agentic_settings
from .seeds import AgenticSeed

_log = get_logger(__name__)


GROUNDING_PROMPT = """You are a vendor extractor. Open and read this exhibitor listing page:

URL: {url}
Event name: {event_name}

Extract EVERY exhibitor company. For each, capture:
  - name: company name verbatim
  - domain: official root domain (without protocol/path), null if unknown
  - booth: booth or stand number if visible, else null
  - description: one-sentence summary if visible, else null

Return ONLY a single JSON object, no commentary, no markdown fences. Schema:

{{
  "exhibitors": [
    {{"name": "...", "domain": "...", "booth": null, "description": "..."}}
  ],
  "total_found": 0,
  "confidence": "high"
}}

confidence rules:
  - "high"   : you reached the actual exhibitor list and read >= 20 entries
  - "medium" : you reached partial content, 5-19 entries
  - "low"    : JS rendering blocked you, page redirected, or <5 entries

If you cannot reach the page at all, return confidence="low" and exhibitors=[].
"""


class _GroundingOutput(BaseModel):
    exhibitors: list[dict] = Field(default_factory=list)
    total_found: int = 0
    confidence: str = "low"


def _strip_fences(s: str) -> str:
    """Remove ```json ... ``` fences sometimes added by the model."""
    s = s.strip()
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", s, flags=re.DOTALL)
    if m:
        return m.group(1).strip()
    return s


def _parse_grounding_response(raw: str) -> _GroundingOutput:
    if not raw or not raw.strip():
        return _GroundingOutput()
    text = _strip_fences(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Some models embed JSON in prose; try a sloppy extract.
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return _GroundingOutput()
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return _GroundingOutput()
    if not isinstance(data, dict):
        return _GroundingOutput()
    return _GroundingOutput(
        exhibitors=data.get("exhibitors") or [],
        total_found=int(data.get("total_found") or 0),
        confidence=str(data.get("confidence") or "low").lower(),
    )


def _exhibitor_from_raw(raw: dict) -> _Exhibitor | None:
    name = (raw.get("name") or "").strip()
    if not name or len(name) < 2:
        return None
    domain = raw.get("domain")
    url = None
    if domain and isinstance(domain, str) and domain.strip():
        d = domain.strip().lower().replace("https://", "").replace("http://", "").strip("/")
        if d and "." in d:
            url = f"https://{d}"
    return _Exhibitor(
        name=name,
        booth=(raw.get("booth") or None),
        url=url,
        description=(raw.get("description") or None),
    )


async def run_agent_grounding(seed: AgenticSeed) -> AgentResult:
    """Single-shot Gemini grounded call. No browser, no Chromium, no Xvfb."""
    s = get_agentic_settings()

    api_key = s.google_api_key or os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return AgentResult(
            seed_name=seed.name,
            expo_id=seed.expo_id,
            error="grounding_no_api_key",
        )

    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError as e:
        return AgentResult(
            seed_name=seed.name,
            expo_id=seed.expo_id,
            error=f"langchain_google_genai missing: {e}",
        )

    llm = ChatGoogleGenerativeAI(
        model=s.grounding_model,
        google_api_key=SecretStr(api_key),
        temperature=0.0,
        timeout=180.0,
        # Enable the Google Search retrieval tool — the model uses Google's
        # internal crawl infra to fetch the URL, bypassing Chromium fingerprint.
        model_kwargs={
            "tools": [{"google_search_retrieval": {}}],
        },
    )

    prompt = GROUNDING_PROMPT.format(url=seed.url, event_name=seed.name)
    t0 = time.monotonic()
    try:
        resp = await llm.ainvoke(prompt)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="agentic_grounding", category=type(e).__name__).inc()
        _log.warning("agentic.grounding_call_failed", seed=seed.name, error=str(e)[:200])
        return AgentResult(
            seed_name=seed.name,
            expo_id=seed.expo_id,
            error=f"grounding_call_failed: {str(e)[:200]}",
        )
    elapsed = time.monotonic() - t0

    raw = getattr(resp, "content", "") or ""
    if isinstance(raw, list):
        raw = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in raw)

    parsed = _parse_grounding_response(raw)

    exhibitors: list[_Exhibitor] = []
    for r in parsed.exhibitors:
        if not isinstance(r, dict):
            continue
        exh = _exhibitor_from_raw(r)
        if exh is not None:
            exhibitors.append(exh)

    threshold = max(1, s.grounding_min_threshold)
    if parsed.confidence == "low" or len(exhibitors) < threshold:
        _log.info(
            "agentic.grounding_low_confidence",
            seed=seed.name,
            confidence=parsed.confidence,
            extracted=len(exhibitors),
            threshold=threshold,
            elapsed_s=int(elapsed),
        )
        try:
            from .agent_trace_publisher import publish_trace
            publish_trace(
                kind="grounding",
                agent="grounding-listing",
                verdict="fail",
                text=(
                    f"{seed.name[:50]} -> low confidence ({parsed.confidence}, "
                    f"{len(exhibitors)} exhibitors), falling back to Browser Use"
                ),
            )
        except Exception:  # noqa: BLE001
            pass
        # Signal runner.py to fallback to Browser-Use head agent.
        return AgentResult(
            seed_name=seed.name,
            expo_id=seed.expo_id,
            exhibitors=exhibitors,  # keep partial for audit/dedup
            raw_output=raw[:5000],
            error="grounding_low_confidence",
            final_url=seed.url,
            raw_steps=[{"prompt": prompt[:1000], "response": raw[:2000], "confidence": parsed.confidence}],
        )

    _log.info(
        "agentic.grounding_success",
        seed=seed.name,
        extracted=len(exhibitors),
        confidence=parsed.confidence,
        elapsed_s=int(elapsed),
    )
    try:
        from .agent_trace_publisher import publish_trace
        publish_trace(
            kind="grounding",
            agent="grounding-listing",
            verdict="success",
            text=(
                f"{seed.name[:50]} -> {len(exhibitors)} exhibitors via Gemini grounding "
                f"({parsed.confidence}, {int(elapsed)}s)"
            ),
        )
    except Exception:  # noqa: BLE001
        pass
    return AgentResult(
        seed_name=seed.name,
        expo_id=seed.expo_id,
        exhibitors=exhibitors,
        raw_output=raw[:5000],
        final_url=seed.url,
        raw_steps=[{"prompt": prompt[:1000], "response": raw[:2000], "confidence": parsed.confidence}],
        n_steps=1,
    )
