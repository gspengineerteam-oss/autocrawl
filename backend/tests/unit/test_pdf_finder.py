"""Tests for PDF finder URL detection (offline, no network)."""

from __future__ import annotations

from crawler.agents.pdf_finder import _is_pdf_url


class TestIsPdfUrl:
    def test_simple_pdf_url(self):
        assert _is_pdf_url("https://expo.com/file.pdf") is True

    def test_pdf_with_query(self):
        assert _is_pdf_url("https://expo.com/file.pdf?v=2&token=xyz") is True

    def test_pdf_with_fragment(self):
        assert _is_pdf_url("https://expo.com/file.pdf#page=3") is True

    def test_uppercase_extension(self):
        assert _is_pdf_url("https://expo.com/FILE.PDF") is True

    def test_html_url_rejected(self):
        assert _is_pdf_url("https://expo.com/index.html") is False

    def test_just_path_no_extension(self):
        assert _is_pdf_url("https://expo.com/download") is False

    def test_empty_string(self):
        assert _is_pdf_url("") is False

    def test_pdf_in_path_but_not_extension(self):
        # "pdf-viewer" path should NOT match
        assert _is_pdf_url("https://expo.com/pdf-viewer/index.html") is False
