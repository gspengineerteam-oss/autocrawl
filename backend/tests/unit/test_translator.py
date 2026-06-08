"""Translator behaviour tests.

These tests do not require the actual NLLB model on disk. We monkey-patch
the loader to return a fake CTranslate2-style translator so we can verify
field swapping, batching, and the fallback flow.
"""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("TRANSLATION_ENABLED", "true")
os.environ.setdefault("TRANSLATION_PROVIDER", "nllb")
os.environ.setdefault("TARGET_LANGUAGE", "id")

from crawler.config import get_settings  # noqa: E402
from crawler.schemas import Vendor  # noqa: E402
from crawler.tools.llm import translator as tr_mod  # noqa: E402


class _FakeTranslator:
    def __init__(self) -> None:
        self.calls = 0

    def translate_batch(self, tokenized, target_prefix, beam_size, max_decoding_length):  # noqa: ARG002
        self.calls += 1
        # echo translated tokens unchanged; decoder will turn them back into text
        return [type("R", (), {"hypotheses": [["ind_Latn"] + toks]}) for toks in tokenized]


class _FakeTokenizer:
    def encode(self, text):
        return [hash(text) & 0xFFFF]

    def convert_ids_to_tokens(self, ids):
        return [f"tok_{i}" for i in ids]

    def convert_tokens_to_ids(self, toks):
        return [1 for _ in toks]

    def decode(self, ids, skip_special_tokens=True):  # noqa: ARG002
        # Indonesian-flavoured marker proves the path was taken.
        return f"[ID:{len(ids)}]"


@pytest.fixture(autouse=True)
def _reset_singleton():
    tr_mod.NLLBTranslator.reset()
    get_settings.cache_clear()
    yield
    tr_mod.NLLBTranslator.reset()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_translator_skips_when_disabled(monkeypatch):
    monkeypatch.setenv("TRANSLATION_ENABLED", "false")
    get_settings.cache_clear()
    v = Vendor(
        domain="x.com",
        company_name="X",
        canonical_url="https://x.com",
        description="Hello world",
    )
    out = await tr_mod.translate_vendor_fields(v)
    assert out.description == "Hello world"
    assert out.language_code == "en"


@pytest.mark.asyncio
async def test_translator_idempotent_when_already_target(monkeypatch):
    monkeypatch.setattr(tr_mod.NLLBTranslator, "_load", _async_noop_load)
    v = Vendor(
        domain="x.com",
        company_name="X",
        canonical_url="https://x.com",
        description="Halo dunia",
        language_code="id",
    )
    out = await tr_mod.translate_vendor_fields(v)
    assert out.description == "Halo dunia"
    assert out.description_original is None


@pytest.mark.asyncio
async def test_translator_swaps_fields_and_keeps_original(monkeypatch):
    async def _fake_load(self):  # noqa: ARG001
        self._translator = _FakeTranslator()
        self._tokenizer = _FakeTokenizer()
        self._available = True
        self._provider = "nllb"

    monkeypatch.setattr(tr_mod.NLLBTranslator, "_load", _fake_load)
    v = Vendor(
        domain="axa.com",
        company_name="AXA",
        canonical_url="https://axa.com",
        description="AXA is a French multinational insurance company",
        tagline="Know You Can",
        products=["Life Insurance", "Pension"],
        industries=["Insurance", "Finance"],
    )
    out = await tr_mod.translate_vendor_fields(v)
    assert out.language_code == "id"
    assert out.translation_method.startswith("nllb-200")
    assert out.translated_at is not None
    assert out.description != "AXA is a French multinational insurance company"
    assert out.description_original == "AXA is a French multinational insurance company"
    assert out.tagline_original == "Know You Can"
    assert out.products_original == ["Life Insurance", "Pension"]
    assert out.industries_original == ["Insurance", "Finance"]
    assert len(out.products) == 2
    assert len(out.industries) == 2


@pytest.mark.asyncio
async def test_translator_handles_empty_vendor(monkeypatch):
    async def _fake_load(self):  # noqa: ARG001
        self._translator = _FakeTranslator()
        self._tokenizer = _FakeTokenizer()
        self._available = True
        self._provider = "nllb"

    monkeypatch.setattr(tr_mod.NLLBTranslator, "_load", _fake_load)
    v = Vendor(domain="empty.com", company_name="Empty", canonical_url="https://empty.com")
    out = await tr_mod.translate_vendor_fields(v)
    assert out.language_code == "id"
    assert out.translation_method.startswith("nllb-200")


async def _async_noop_load(self):  # noqa: ARG001
    self._translator = None
    self._tokenizer = None
    self._available = True
    self._provider = "nllb"
