"""Few-shot exemplar renderer for the enrich agent's system prompt.

Why
---
We deliberately don't gate enrichment on a hardcoded "must have email +
address + phone" schema (see `enrich_worker.py` docstring for the full
rationale). Instead the agent learns the bar implicitly from past
exemplars:

  * `agentic_enrich_lessons/success/*/meta.json` — vendors the operator
    has been keeping. Showing 2-3 of these to the agent calibrates "this
    is what a complete profile looks like."
  * `agentic_enrich_lessons/failure/*/meta.json` whose `failure_category`
    starts with `formality` — sites we explicitly classified as too thin
    to keep. Showing 1-2 of these calibrates "this is what to skip."

The rendered block is small (≤2KB tokens overall) and cached in-process
for 60s so we don't re-walk the directory every enrich task.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

from crawler.observability.logger import get_logger

_log = get_logger(__name__)

# (rendered_block, expires_at) — set on first call.
_CACHE: tuple[str, float] | None = None
_CACHE_TTL_SECONDS = 60.0
_CACHE_LOCK = asyncio.Lock()


def invalidate_cache() -> None:
    """Called by the worker after archiving a new lesson so the next
    enrich task picks up the fresh exemplar pool."""
    global _CACHE
    _CACHE = None


async def render_few_shot(
    lessons_dir: Path,
    success_n: int,
    failure_n: int,
) -> str:
    """Build the few-shot block. Returns "" when no usable exemplars yet."""
    global _CACHE
    now = time.monotonic()
    if _CACHE is not None and _CACHE[1] > now:
        return _CACHE[0]

    async with _CACHE_LOCK:
        # Re-check inside the lock so concurrent enrich workers don't all
        # rebuild simultaneously.
        if _CACHE is not None and _CACHE[1] > time.monotonic():
            return _CACHE[0]

        success_exs = await _load_recent(lessons_dir / "success", success_n, kind="success")
        failure_exs = await _load_recent(
            lessons_dir / "failure", failure_n, kind="failure",
            require_category_prefix="formality",
        )

        if not success_exs and not failure_exs:
            block = ""
        else:
            parts: list[str] = []
            if success_exs:
                parts.append("# WHAT 'COMPLETE ENOUGH TO KEEP' LOOKS LIKE")
                parts.append("# (recent successful enrichments — match this bar):")
                for ex in success_exs:
                    parts.append(_format_exemplar(ex, label="KEEP"))
            if failure_exs:
                parts.append("")
                parts.append("# WHAT 'FORMALITY — SKIP' LOOKS LIKE")
                parts.append("# (recent rejections — emit done with bail_reason='formality' for this kind of site):")
                for ex in failure_exs:
                    parts.append(_format_exemplar(ex, label="SKIP"))
            block = "\n".join(parts)

        _CACHE = (block, time.monotonic() + _CACHE_TTL_SECONDS)
        return block


async def _load_recent(
    bucket_dir: Path,
    n: int,
    *,
    kind: str,
    require_category_prefix: str | None = None,
) -> list[dict[str, Any]]:
    """Walk `bucket_dir`, sort by `archived_at` desc, return top N
    deserialized meta dicts. Filters by `failure_category` prefix when set."""
    if n <= 0 or not bucket_dir.exists():
        return []
    try:
        children = await asyncio.to_thread(list, bucket_dir.iterdir())
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_lessons.scan_failed", dir=str(bucket_dir), error=str(e)[:120])
        return []

    metas: list[tuple[float, dict[str, Any]]] = []
    for child in children:
        if not child.is_dir():
            continue
        meta_path = child / "meta.json"
        if not meta_path.exists():
            continue
        try:
            raw = await asyncio.to_thread(meta_path.read_text, encoding="utf-8")
            m = json.loads(raw)
        except Exception:  # noqa: BLE001
            continue
        if require_category_prefix:
            cat = (m.get("failure_category") or "").lower()
            if not cat.startswith(require_category_prefix):
                continue
        # Use mtime as tiebreaker if archived_at missing/malformed.
        ts = 0.0
        try:
            ts = (child / "meta.json").stat().st_mtime
        except Exception:  # noqa: BLE001
            pass
        metas.append((ts, m))

    metas.sort(key=lambda x: x[0], reverse=True)
    return [m for _, m in metas[:n]]


def _format_exemplar(meta: dict[str, Any], *, label: str) -> str:
    """Render one meta dict as a compact ≤300-char description."""
    name = (meta.get("seed_name") or meta.get("vendor_name") or "?")[:60]
    domain = (meta.get("domain") or "?")[:40]
    bail = meta.get("bail_reason") or meta.get("failure_category") or ""
    n_v = meta.get("n_vendors")
    extras = []
    md = meta.get("metadata") or {}
    score = md.get("agentic_completeness_score")
    if score is not None:
        extras.append(f"completeness={score}")
    extracted = md.get("agentic_fields_extracted")
    if extracted:
        extras.append(f"fields={','.join(extracted)[:60]}")
    if n_v not in (None, 0):
        extras.append(f"vendors={n_v}")
    extra_str = " | " + " ".join(extras) if extras else ""
    if label == "SKIP":
        return f"[{label}] {name} → {domain} (bail={bail}){extra_str}"[:300]
    return f"[{label}] {name} → {domain}{extra_str}"[:300]
