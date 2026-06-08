"""LLM agent buat fitur Labs (Fusion Vendor).

Tiga fungsi async:
1. suggest_fusions: kasih saran 3 sampe 5 combo dari kandidat vendor
2. generate_artifacts: dari vendor terpilih, generate nama produk, tagline, deskripsi
3. draft_email: per vendor, generate satu email outreach

Semua pakai chat() dari tools/llm/openai_client.py dengan structured output.
Failure mode: suggest return empty list (non-fatal). artifacts dan email raise
biar caller bisa handle (typically wrapped jadi 5xx response).
"""

from __future__ import annotations

import time

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from ..observability.logger import get_logger
from ..observability.metrics import errors_total, request_duration_seconds
from ..schemas import EmailDraftPayload, FusionArtifacts, FusionSuggestion, Vendor
from ..tools.llm.cloud_router import chat_structured
from ..tools.llm.openai_client import chat

_log = get_logger(__name__)


class _SuggestionsWrap(BaseModel):
    suggestions: list[FusionSuggestion]


async def suggest_fusions(candidates: list[Vendor], *, k: int = 5) -> list[FusionSuggestion]:
    """Kasih k saran combo dari kandidat vendor. Return list FusionSuggestion."""
    if len(candidates) < 2:
        return []

    started = time.monotonic()
    try:
        summaries: list[str] = []
        for v in candidates[:30]:
            summaries.append(
                f"- vendor_id={v.vendor_id} name={v.company_name} "
                f"industries={v.industries[:3]} products={v.products[:3]} "
                f"description={(v.description or '')[:200]}"
            )
        prompt_data = "\n".join(summaries)

        sys = SystemMessage(content=(
            "Lo asisten brainstorm produk baru dari kombinasi vendor security defense industri. "
            "Tugas lo nyaranin kombinasi 2 sampe 4 vendor yang produknya kalo digabung jadi "
            "produk baru yang masuk akal dan menarik. Contoh CCTV plus Drone jadi Drone CCTV. "
            "Hasil HARUS list of FusionSuggestion dengan minimal 2 vendor_id valid dari input."
        ))
        user = HumanMessage(content=(
            f"Kandidat vendor (max 30):\n{prompt_data}\n\n"
            f"Kasih {k} saran combo paling menarik. Confidence rendah ga apa, ini eksperimen."
        ))

        result = await chat_structured(
            [sys, user], _SuggestionsWrap, local_chat=chat, tier="heavy"
        )
        if result is None:
            return []
        valid_ids = {v.vendor_id for v in candidates}
        valid = [
            s for s in result.suggestions
            if all(sid in valid_ids for sid in s.source_vendor_ids)
        ]
        _log.info(
            "fusion.suggest_ok",
            count=len(valid),
            duration_s=round(time.monotonic() - started, 2),
        )
        return valid[:k]
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="fusion", category="suggest_failed").inc()
        _log.warning("fusion.suggest_failed", error=str(e))
        return []
    finally:
        request_duration_seconds.labels(tool="fusion_suggest").observe(time.monotonic() - started)


async def generate_artifacts(vendors: list[Vendor], hint: str | None = None) -> FusionArtifacts:
    """Generate produk baru dari vendor terpilih."""
    started = time.monotonic()
    try:
        summaries = "\n".join(
            f"- {v.company_name} ({', '.join(v.industries[:3])}): {(v.description or '')[:300]}"
            for v in vendors
        )
        sys = SystemMessage(content=(
            "Lo product designer yang gabungin dua atau lebih perusahaan jadi ide produk baru. "
            "Output harus Pydantic FusionArtifacts dengan name singkat catchy, tagline satu kalimat, "
            "description 2 paragraf, industries plus tags inheritance dari sumber-nya."
        ))
        user_text = f"Source vendor:\n{summaries}\n\n"
        if hint:
            user_text += f"Hint user: {hint}\n\n"
        user_text += "Generate satu produk baru yang gabungkan kekuatan mereka."
        user = HumanMessage(content=user_text)

        result = await chat_structured(
            [sys, user], FusionArtifacts, local_chat=chat, tier="heavy"
        )
        if result is None:
            raise RuntimeError("fusion.artifacts returned no parseable result")
        _log.info(
            "fusion.artifacts_ok",
            name=result.name,
            duration_s=round(time.monotonic() - started, 2),
        )
        return result
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="fusion", category="artifacts_failed").inc()
        _log.warning("fusion.artifacts_failed", error=str(e))
        raise
    finally:
        request_duration_seconds.labels(tool="fusion_artifacts").observe(time.monotonic() - started)


async def draft_email(
    *,
    fusion_name: str,
    fusion_description: str,
    vendor: Vendor,
    to_email: str,
) -> EmailDraftPayload:
    """Generate email draft outreach buat satu vendor."""
    started = time.monotonic()
    try:
        sys = SystemMessage(content=(
            "Lo bantu nulis email outreach singkat profesional dalam Bahasa Inggris (default expo "
            "international) buat ngajak vendor kolaborasi di produk baru hasil kombinasi. "
            "Tone friendly tapi serius. 3 sampe 4 paragraf. Akhirnya tawarin schedule meeting. "
            "Output Pydantic EmailDraftPayload dengan subject dan body."
        ))
        user = HumanMessage(content=(
            f"Vendor target: {vendor.company_name} ({vendor.domain})\n"
            f"Vendor profile: {(vendor.description or '')[:500]}\n"
            f"Vendor industries: {vendor.industries[:5]}\n\n"
            f"Produk baru: {fusion_name}\n"
            f"Deskripsi produk: {fusion_description[:800]}\n\n"
            f"To email: {to_email}\n\n"
            "Tulis email outreach. Sebut nama produk, jelasin kenapa vendor ini cocok, ajak meeting."
        ))

        result = await chat_structured(
            [sys, user], EmailDraftPayload, local_chat=chat, tier="heavy"
        )
        if result is None:
            raise RuntimeError("fusion.email returned no parseable result")
        _log.info("fusion.email_ok", vendor_id=vendor.vendor_id)
        return result
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="fusion", category="email_failed").inc()
        _log.warning("fusion.email_failed", vendor_id=vendor.vendor_id, error=str(e))
        raise
    finally:
        request_duration_seconds.labels(tool="fusion_email").observe(time.monotonic() - started)
