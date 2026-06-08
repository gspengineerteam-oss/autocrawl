from __future__ import annotations

from fastapi import APIRouter

from ...config import get_settings

router = APIRouter(tags=["meta"])


@router.get("/settings")
async def settings() -> dict:
    s = get_settings()
    return {
        "llm_provider": s.llm_provider,
        "llm_base_url": s.llm_base_url or None,
        "openai_model_heavy": s.openai_model_heavy,
        "openai_model_light": s.openai_model_light,
        "translation_enabled": s.translation_enabled,
        "translation_provider": s.translation_provider,
        "target_language": s.target_language,
        "phase_2_vendor_threshold": s.phase_2_vendor_threshold,
        "max_vendors_per_run": s.max_vendors_per_run,
        "max_expos_per_run": s.max_expos_per_run,
        "run_interval_minutes": s.run_interval_minutes,
        "pdf_discovery_enabled": s.pdf_discovery_enabled,
        "ocr_enabled": s.ocr_enabled,
        "mode": s.mode.value if hasattr(s.mode, "value") else str(s.mode),
        "log_level": s.log_level,
    }
