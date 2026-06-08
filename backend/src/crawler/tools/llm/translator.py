"""NLLB-200 translation wrapper.

Translates English vendor fields (description, tagline, products, industries)
into Bahasa Indonesia using Meta's NLLB-200 distilled 600M model running via
CTranslate2 with int8 quantization (~1.2GB on disk, CPU-friendly).

Singleton: model is loaded lazily on first call, then reused. If the local
model directory is missing or load fails, falls back to OpenAI gpt-4o-mini.

Public API:
  - get_translator() -> NLLBTranslator
  - translate_vendor_fields(vendor) -> Vendor (mutates in place, returns same)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from ...config import get_settings
from ...observability.logger import get_logger

if TYPE_CHECKING:
    from ...schemas import Vendor

_log = get_logger(__name__)

_NLLB_LANG_MAP = {
    "id": "ind_Latn",
    "en": "eng_Latn",
    "ms": "zsm_Latn",
    "th": "tha_Thai",
    "vi": "vie_Latn",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "es": "spa_Latn",
    "ja": "jpn_Jpan",
    "zh": "zho_Hans",
}


def _to_nllb_lang(code: str) -> str:
    return _NLLB_LANG_MAP.get(code.lower(), "ind_Latn")


class NLLBTranslator:
    """Lazy-loaded NLLB-200 CTranslate2 wrapper.

    Use :meth:`get` (classmethod) to obtain the singleton, never construct directly.
    """

    _instance: "NLLBTranslator | None" = None
    _init_lock = asyncio.Lock()

    def __init__(self) -> None:
        self._translator = None
        self._tokenizer = None
        self._available = False
        self._provider = "nllb"
        s = get_settings()
        self._src_lang = _to_nllb_lang("en")
        self._tgt_lang = _to_nllb_lang(s.target_language)
        self._max_chars = s.translation_max_chars
        self._batch_size = s.translation_batch_size

    @classmethod
    async def get(cls) -> "NLLBTranslator":
        if cls._instance is not None:
            return cls._instance
        async with cls._init_lock:
            if cls._instance is None:
                inst = cls()
                await inst._load()
                cls._instance = inst
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Test helper: clear cached singleton."""
        cls._instance = None

    async def _load(self) -> None:
        s = get_settings()
        provider = s.translation_provider.lower()
        if provider == "none":
            self._available = False
            self._provider = "none"
            return
        if provider == "openai":
            self._available = True
            self._provider = "openai"
            return
        try:
            await asyncio.to_thread(self._load_blocking, s.nllb_model_path, s.nllb_tokenizer_path)
            self._available = True
            self._provider = "nllb"
            _log.info("nllb.loaded", model_path=s.nllb_model_path)
        except Exception as exc:  # noqa: BLE001
            _log.warning(
                "nllb.load_failed_fallback_openai",
                error=str(exc),
                model_path=s.nllb_model_path,
            )
            self._provider = "openai"
            self._available = True

    def _load_blocking(self, model_path: str, tokenizer_path: str) -> None:
        if not Path(model_path).exists():
            raise FileNotFoundError(f"NLLB CTranslate2 model not found at {model_path}")
        import ctranslate2
        from transformers import AutoTokenizer

        self._translator = ctranslate2.Translator(model_path, device="cpu", compute_type="int8")
        tok_dir = tokenizer_path if Path(tokenizer_path).exists() else "facebook/nllb-200-distilled-600M"
        self._tokenizer = AutoTokenizer.from_pretrained(tok_dir, src_lang=self._src_lang)

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def method_label(self) -> str:
        if self._provider == "nllb":
            return "nllb-200-distilled-600m-int8"
        if self._provider == "openai":
            return "openai-gpt-4o-mini"
        return "none"

    async def translate(self, text: str) -> str:
        if not text or not text.strip():
            return text
        out = await self.translate_batch([text])
        return out[0] if out else text

    async def translate_batch(self, texts: list[str]) -> list[str]:
        if not self._available or not texts:
            return list(texts)
        clean = [t if t and t.strip() else "" for t in texts]
        nonempty_idx = [i for i, t in enumerate(clean) if t]
        if not nonempty_idx:
            return list(clean)

        nonempty = [clean[i][: self._max_chars] for i in nonempty_idx]
        try:
            if self._provider == "nllb":
                translated = await asyncio.to_thread(self._translate_nllb_blocking, nonempty)
            elif self._provider == "openai":
                translated = await self._translate_openai(nonempty)
            else:
                translated = nonempty
        except Exception as exc:  # noqa: BLE001
            _log.warning("translation.batch_failed", provider=self._provider, error=str(exc))
            return list(clean)

        result = list(clean)
        for idx, txt in zip(nonempty_idx, translated):
            result[idx] = txt
        return result

    def _translate_nllb_blocking(self, texts: list[str]) -> list[str]:
        if self._translator is None or self._tokenizer is None:
            return texts
        out: list[str] = []
        target_token = self._tgt_lang
        for i in range(0, len(texts), self._batch_size):
            chunk = texts[i : i + self._batch_size]
            tokenized = [self._tokenizer.convert_ids_to_tokens(self._tokenizer.encode(t)) for t in chunk]
            results = self._translator.translate_batch(
                tokenized,
                target_prefix=[[target_token]] * len(chunk),
                beam_size=2,
                max_decoding_length=512,
            )
            for r in results:
                tokens = r.hypotheses[0]
                if tokens and tokens[0] == target_token:
                    tokens = tokens[1:]
                ids = self._tokenizer.convert_tokens_to_ids(tokens)
                out.append(self._tokenizer.decode(ids, skip_special_tokens=True))
        return out

    async def _translate_openai(self, texts: list[str]) -> list[str]:
        from langchain_core.messages import HumanMessage, SystemMessage

        from .openai_client import chat

        sys_prompt = (
            "You are a professional translator. Translate each input line "
            "from English to natural, formal Bahasa Indonesia. Preserve "
            "company names, product names, technical terms, and acronyms in "
            "their original form. Return ONLY the translations, one per line, "
            "in the same order. No numbering, no commentary."
        )
        user = "\n".join(f"- {t}" for t in texts)
        msg = await chat(
            [SystemMessage(content=sys_prompt), HumanMessage(content=user)],
            use_heavy=False,
        )
        if not isinstance(msg, str):
            return texts
        lines = [ln.lstrip("- ").strip() for ln in msg.splitlines() if ln.strip()]
        if len(lines) != len(texts):
            return texts
        return lines


async def get_translator() -> NLLBTranslator:
    return await NLLBTranslator.get()


async def translate_vendor_fields(vendor: "Vendor") -> "Vendor":
    """Translate description, tagline, products, industries on a Vendor in place.

    Original English values are backed up to the *_original fields. Sets
    language_code, translation_method, translated_at. Idempotent: skips work
    if vendor.language_code already matches the target language.
    """
    s = get_settings()
    if not s.translation_enabled:
        return vendor
    target = s.target_language.lower()
    if (vendor.language_code or "en").lower() == target:
        return vendor
    if (vendor.language_code or "en").lower() != "en":
        # Only translate FROM English for now.
        return vendor

    translator = await get_translator()
    if not translator._available:
        return vendor

    pieces: list[str] = []
    slots: list[tuple[str, int | None]] = []  # (kind, idx)

    if vendor.description:
        pieces.append(vendor.description)
        slots.append(("description", None))
    if vendor.tagline:
        pieces.append(vendor.tagline)
        slots.append(("tagline", None))
    for i, p in enumerate(vendor.products):
        if p:
            pieces.append(p)
            slots.append(("product", i))
    for i, ind in enumerate(vendor.industries):
        if ind:
            pieces.append(ind)
            slots.append(("industry", i))

    if not pieces:
        vendor.language_code = target  # type: ignore[assignment]
        vendor.translation_method = translator.method_label
        vendor.translated_at = datetime.now(timezone.utc)
        return vendor

    translated = await translator.translate_batch(pieces)

    description_orig = vendor.description
    tagline_orig = vendor.tagline
    products_orig = list(vendor.products)
    industries_orig = list(vendor.industries)

    for slot, txt in zip(slots, translated):
        kind, idx = slot
        if kind == "description":
            vendor.description = txt
        elif kind == "tagline":
            vendor.tagline = txt
        elif kind == "product" and idx is not None:
            vendor.products[idx] = txt
        elif kind == "industry" and idx is not None:
            vendor.industries[idx] = txt

    if description_orig:
        vendor.description_original = description_orig
    if tagline_orig:
        vendor.tagline_original = tagline_orig
    if products_orig:
        vendor.products_original = products_orig
    if industries_orig:
        vendor.industries_original = industries_orig
    vendor.language_code = target  # type: ignore[assignment]
    vendor.translation_method = translator.method_label
    vendor.translated_at = datetime.now(timezone.utc)
    return vendor
