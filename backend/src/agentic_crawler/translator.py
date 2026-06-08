"""Vendor field translation via Mistral (or whichever vision LLM is loaded).

Why a separate module
---------------------
Base crawler ships an NLLB-200 translator at `crawler.tools.llm.translator`
that runs on CPU via CTranslate2 and is wired into the deterministic
pipeline. The agentic enrich path bypasses that pipeline (publishes via
queue → enrich worker → reporter) so vendors land in DB still in English.

Rather than re-wire the NLLB pipeline (which needs CUDA-less torch +
ctranslate2 running well on this host), we just reuse the **already-loaded
vision LLM** (mistral-small3.2:24b on Ollama) for translation. Zero extra
VRAM, multilingual, fast enough for vendor-row scale (50-200/day).

Output target language is `TARGET_LANGUAGE` from base settings (default `id`).
"""

from __future__ import annotations

from typing import Any

from crawler.observability.logger import get_logger

from .config import get_agentic_settings

_log = get_logger(__name__)


_PROMPT_TEMPLATE = (
    "You are a professional English to Indonesian translator. "
    "Produce ONLY the Indonesian translation, no explanation, no "
    "markdown, no quotes, no prefix. Preserve product names, "
    "trademarks, and proper nouns in their original form.\n\n"
    "Translate this English text:\n\n{text}"
)


async def _translate_one(text: str, *, max_chars: int = 1500) -> str | None:
    """Translate a single string EN → ID via Ollama. Returns None on
    error; caller falls back to original."""
    if not text or len(text.strip()) < 4:
        return None
    snippet = text[:max_chars]
    s = get_agentic_settings()
    try:
        import ollama  # type: ignore
    except ImportError:
        _log.debug("translator.ollama_module_missing")
        return None

    host = s.llm_base_url.rstrip("/")
    try:
        client = ollama.AsyncClient(host=host)
        resp = await client.chat(
            model=s.vision_model,
            messages=[{"role": "user", "content": _PROMPT_TEMPLATE.format(text=snippet)}],
            options={"temperature": 0.0, "num_predict": 600},
            keep_alive="1h",
        )
        out = (resp.get("message") or {}).get("content") or ""
        out = out.strip().strip('"').strip("'")
        if not out or out.lower() == snippet.lower()[: len(out)]:
            return None
        return out[: max_chars * 2]  # safety cap
    except Exception as e:  # noqa: BLE001
        _log.debug("translator.call_failed", error=str(e)[:120])
        return None


_BATCH_PROMPT_TEMPLATE = (
    "You are a professional English to Indonesian translator. Translate the "
    "following list of strings into Indonesian. Preserve product names, "
    "trademarks, and proper nouns in their original form. Return ONLY a "
    "JSON array of strings in the exact same order as the input (no markdown, "
    "no fences, no prose, no numbering).\n\n"
    "Input JSON array:\n{payload}"
)


async def translate_batch(
    items: list[str], *, max_chars_per_item: int = 600,
) -> list[str | None]:
    """Translate up to ~8 short strings in a single Ollama call. Cuts the
    RTT cost per vendor when many small fields need translation (e.g.
    products_detailed has pros, cons, summary, category per product).

    Returns list aligned with `items`. Empty / too-short entries yield
    None at the same index. On any parse failure returns all-None so
    caller can fall back to per-item translation.
    """
    if not items:
        return []
    # Cap each item; build aligned input list and index map for the LLM call.
    trimmed: list[str] = []
    out_idx: list[int] = []
    for i, t in enumerate(items):
        if not t or len(t.strip()) < 4:
            continue
        trimmed.append(t[:max_chars_per_item])
        out_idx.append(i)
    result: list[str | None] = [None] * len(items)
    if not trimmed:
        return result

    s = get_agentic_settings()
    try:
        import json as _json
        import ollama  # type: ignore
    except ImportError:
        _log.debug("translator.ollama_module_missing")
        return result

    host = s.llm_base_url.rstrip("/")
    try:
        payload = _json.dumps(trimmed, ensure_ascii=False)
        client = ollama.AsyncClient(host=host)
        resp = await client.chat(
            model=s.vision_model,
            messages=[{
                "role": "user",
                "content": _BATCH_PROMPT_TEMPLATE.format(payload=payload),
            }],
            options={"temperature": 0.0, "num_predict": 1200},
            keep_alive="1h",
        )
        raw = (resp.get("message") or {}).get("content") or ""
        raw = raw.strip()
        # Salvage JSON array even when the model wraps it in fences or prose.
        start = raw.find("[")
        end = raw.rfind("]")
        if start == -1 or end == -1 or end <= start:
            _log.debug("translator.batch_no_array", preview=raw[:160])
            return result
        try:
            parsed = _json.loads(raw[start:end + 1])
        except Exception as e:  # noqa: BLE001
            _log.debug("translator.batch_json_parse_failed", error=str(e)[:120])
            return result
        if not isinstance(parsed, list) or len(parsed) != len(trimmed):
            _log.debug(
                "translator.batch_length_mismatch",
                got=len(parsed) if isinstance(parsed, list) else -1,
                want=len(trimmed),
            )
            return result
        for slot, val in zip(out_idx, parsed):
            if isinstance(val, str) and val.strip():
                result[slot] = val.strip().strip('"').strip("'")
        return result
    except Exception as e:  # noqa: BLE001
        _log.debug("translator.batch_failed", error=str(e)[:120])
        return result


async def translate_vendor_inplace(vendor: Any) -> bool:
    """Translate vendor.description / tagline / products EN → ID. Mutates
    `vendor` in place; original English values mirrored to *_original
    fields per the schema's localization contract.

    Returns True if at least one field was translated. Idempotent — skips
    when language_code == 'id' already.
    """
    try:
        from crawler.config import get_settings

        target = get_settings().target_language or "id"
    except Exception:  # noqa: BLE001
        target = "id"

    if target != "id":
        return False

    already_translated = getattr(vendor, "language_code", "en") == "id"
    changed = False

    # Legacy fields — only translate if not already done. After Phase 5,
    # translator can be re-invoked (backfill worker) and we still want to
    # process products_detailed even when description/tagline are already
    # in ID from the earlier pass.
    if not already_translated:
        if vendor.description:
            original = vendor.description
            translated = await _translate_one(original)
            if translated and translated != original:
                vendor.description_original = original
                vendor.description = translated
                changed = True

        if vendor.tagline:
            original = vendor.tagline
            translated = await _translate_one(original)
            if translated and translated != original:
                vendor.tagline_original = original
                vendor.tagline = translated
                changed = True

        # Products: short keywords, batch as one to save round trips.
        if vendor.products:
            joined = " | ".join(vendor.products[:8])
            translated_joined = await _translate_one(joined, max_chars=600)
            if translated_joined and translated_joined != joined:
                translated_list = [
                    p.strip() for p in translated_joined.split("|") if p.strip()
                ]
                if translated_list:
                    vendor.products_original = list(vendor.products)
                    vendor.products = translated_list[:8]
                    changed = True

    # Phase 5 — products_detailed + focus_summary. Always check (independent
    # of legacy already_translated state) because product enrichment can
    # run AFTER initial vendor translation; products_detailed gets populated
    # later and needs its own translation pass.
    if getattr(vendor, "focus_summary", None):
        translated = await _translate_one(vendor.focus_summary)
        if translated and translated != vendor.focus_summary:
            vendor.focus_summary = translated
            changed = True

    products_detailed = getattr(vendor, "products_detailed", None) or []
    # S4: batch-translate all per-product short fields in one Ollama call
    # per product (was 4+ calls per product). For 5 products that is ~20
    # RTT collapsed to ~5. Field order is fixed so we can write the
    # result back to the right attribute by index.
    for p in products_detailed:
        pros_joined = " | ".join(p.pros) if p.pros else ""
        cons_joined = " | ".join(p.cons) if p.cons else ""
        slots = [
            ("summary", getattr(p, "summary", None) or ""),
            ("scope_match_reason", getattr(p, "scope_match_reason", None) or ""),
            ("category", (getattr(p, "category", None) or "")[:200]),
            ("pros_joined", pros_joined),
            ("cons_joined", cons_joined),
        ]
        inputs = [s_val for _, s_val in slots]
        translated_list = await translate_batch(inputs, max_chars_per_item=600)
        for (field, original), translated in zip(slots, translated_list):
            if not translated or translated == original:
                continue
            if field == "pros_joined":
                items_new = [x.strip() for x in translated.split("|") if x.strip()]
                if items_new and p.pros:
                    p.pros = items_new[: len(p.pros)]
                    changed = True
            elif field == "cons_joined":
                items_new = [x.strip() for x in translated.split("|") if x.strip()]
                if items_new and p.cons:
                    p.cons = items_new[: len(p.cons)]
                    changed = True
            else:
                setattr(p, field, translated)
                changed = True

    if changed:
        vendor.language_code = "id"
        vendor.translation_method = f"ollama:{get_agentic_settings().vision_model}"
        try:
            from datetime import datetime, timezone

            vendor.translated_at = datetime.now(timezone.utc)
        except Exception:  # noqa: BLE001
            pass
        _log.info(
            "translator.vendor_translated",
            domain=getattr(vendor, "domain", None),
            company=getattr(vendor, "company_name", "")[:80],
        )

    return changed
