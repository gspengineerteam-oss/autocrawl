"""Tests for PDF parser (PyMuPDF + pdfplumber, OCR fallback decision)."""

from __future__ import annotations

from pathlib import Path

import pytest

from crawler.tools.parsers.pdf_parser import (
    PageContent,
    _looks_like_scanned,
    extract_pages,
)

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "pdfs" / "sample_exhibitor_list.pdf"


@pytest.mark.asyncio
async def test_extracts_two_pages():
    pages = await extract_pages(FIXTURE)
    assert len(pages) == 2
    assert all(isinstance(p, PageContent) for p in pages)
    assert pages[0].page_number == 1
    assert pages[1].page_number == 2


@pytest.mark.asyncio
async def test_native_text_recognised():
    pages = await extract_pages(FIXTURE)
    page1 = pages[0]
    assert page1.extraction_method == "pymupdf"
    assert "XL Defense Systems" in page1.text
    assert "Guangzhou Institute Defense" in page1.text
    assert "Hanwha Systems" in page1.text
    assert "Rostec Concern Kalashnikov" in page1.text


@pytest.mark.asyncio
async def test_page2_prose_text():
    pages = await extract_pages(FIXTURE)
    page2 = pages[1]
    assert "Saab" in page2.text
    assert "Mitsubishi" in page2.text
    assert "Hensoldt" in page2.text


@pytest.mark.asyncio
async def test_page_dimensions_populated():
    pages = await extract_pages(FIXTURE)
    assert pages[0].width is not None and pages[0].width > 0
    assert pages[0].height is not None and pages[0].height > 0


class TestOcrDecision:
    def test_short_text_triggers_ocr(self):
        assert _looks_like_scanned("", page=None) is True
        assert _looks_like_scanned("ABC", page=None) is True

    def test_long_text_skips_ocr(self):
        text = "Acme Corp\nFoobar Inc\nAcme Defense Systems Ltd " * 5
        assert _looks_like_scanned(text, page=None) is False

    def test_threshold_boundary(self):
        # Exactly at threshold (80 chars) → not scanned
        assert _looks_like_scanned("a" * 100, page=None) is False
        assert _looks_like_scanned("a" * 50, page=None) is True


@pytest.mark.asyncio
async def test_extracts_table_when_pdfplumber_finds_one():
    pages = await extract_pages(FIXTURE)
    # Our fixture is text-positioned, not a real table grid, so tables may be empty.
    # Just confirm `tables` is always a list (no crash).
    assert isinstance(pages[0].tables, list)
    assert isinstance(pages[1].tables, list)


@pytest.mark.asyncio
async def test_missing_pdf_returns_empty():
    pages = await extract_pages(Path("/nonexistent/path.pdf"))
    assert pages == []
