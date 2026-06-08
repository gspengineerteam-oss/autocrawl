"""Tests for PDF store: filename safety, SHA256 dedup, atomic writes."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from crawler.store.pdf_store import _safe_filename


class TestSafeFilename:
    def test_basic_pdf_url(self):
        out = _safe_filename("https://expo.com/2026/exhibitor-list.pdf")
        assert out == "exhibitor-list.pdf"

    def test_strips_unsafe_chars(self):
        out = _safe_filename("https://expo.com/some path with spaces.pdf")
        assert " " not in out
        assert out.endswith(".pdf")

    def test_query_string_ignored(self):
        out = _safe_filename("https://expo.com/file.pdf?token=abc&v=2")
        assert out == "file.pdf"

    def test_url_without_pdf_extension_gets_one(self):
        out = _safe_filename("https://expo.com/download")
        assert out.endswith(".pdf")

    def test_long_filename_truncated(self):
        long_url = "https://expo.com/" + ("a" * 500) + ".pdf"
        out = _safe_filename(long_url)
        assert len(out) <= 100
        assert out.endswith(".pdf")

    def test_empty_path_fallback(self):
        out = _safe_filename("https://expo.com/")
        assert out == "brochure.pdf"

    def test_unicode_safe(self):
        out = _safe_filename("https://expo.com/中国国际防务展.pdf")
        assert out.endswith(".pdf")


class TestSha256Stability:
    def test_same_content_same_hash(self):
        a = b"hello world"
        b = b"hello world"
        assert hashlib.sha256(a).hexdigest() == hashlib.sha256(b).hexdigest()

    def test_different_content_different_hash(self):
        a = b"hello world"
        b = b"hello world!"
        assert hashlib.sha256(a).hexdigest() != hashlib.sha256(b).hexdigest()


@pytest.mark.asyncio
async def test_index_load_missing_returns_empty(monkeypatch, tmp_path: Path):
    from crawler.store import pdf_store

    monkeypatch.setattr(pdf_store, "_index_path", lambda: tmp_path / "_index.json")
    index = await pdf_store._load_index()
    assert index == {}


@pytest.mark.asyncio
async def test_index_save_then_load_roundtrip(monkeypatch, tmp_path: Path):
    from crawler.store import pdf_store

    target = tmp_path / "_index.json"
    monkeypatch.setattr(pdf_store, "_index_path", lambda: target)

    payload = {
        "https://x.com/a.pdf": {"sha256": "abc", "path": "/data/a.pdf", "expo_id": "e1"},
    }
    await pdf_store._save_index(payload)
    loaded = await pdf_store._load_index()
    assert loaded == payload
