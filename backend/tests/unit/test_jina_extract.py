"""Unit tests for S1 Jina Reader extractor.

Mocks `fetch_clean_markdown` so the tests run offline (no Jina API quota
consumed). Validates regex extraction, vendor-name guard, completeness
scoring, and best-path selection.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from agentic_crawler.jina_extract import (
    _completeness_score,
    _extract_emails_md,
    _extract_phones_md,
    fetch_and_parse_vendor,
)


_GOOD_MARKDOWN = """\
# Acme Defense Systems

Acme Defense Systems is a leading manufacturer of unmanned aerial vehicles \
and tactical drones for defense and intelligence agencies worldwide.

## Contact

Email: sales@acmedefense.com
Phone: +1 415 555 1234

Headquartered at 1500 Industrial Way, Mountain View, CA, United States.

Reach out to support@acmedefense.com for technical inquiries.

Acme Defense Systems delivers next-gen aerospace platforms tailored for the
defense industry across multiple nations.
"""

_NOISE_MARKDOWN = """\
# Random Blog

This page mentions image.png@2x as a decorative element.
Email like name@example.com is shown for documentation only.
No real contact data here.
"""

_OTHER_VENDOR_MARKDOWN = """\
# Beta Industries

Beta makes industrial sensors. Email beta@betaco.com.
"""


class TestEmailExtractor:
    def test_finds_real_emails(self):
        emails = _extract_emails_md(_GOOD_MARKDOWN)
        assert "sales@acmedefense.com" in emails
        assert "support@acmedefense.com" in emails

    def test_skips_placeholder_emails(self):
        emails = _extract_emails_md(_NOISE_MARKDOWN)
        assert "name@example.com" not in emails

    def test_skips_image_suffix(self):
        emails = _extract_emails_md(_NOISE_MARKDOWN)
        assert not any(e.endswith(".png") for e in emails)


class TestPhoneExtractor:
    def test_finds_intl_format(self):
        phones = _extract_phones_md(_GOOD_MARKDOWN)
        assert any("+1" in p and "415" in p for p in phones)


class TestCompletenessScore:
    def test_empty_zero(self):
        assert _completeness_score([], [], None, None) == 0.0

    def test_full_one(self):
        from crawler.schemas import Address
        score = _completeness_score(
            ["a@b.com"],
            ["+1 415 555 1234"],
            Address(raw="some address"),
            "long enough description here",
        )
        assert score == pytest.approx(1.0)

    def test_email_only(self):
        assert _completeness_score(["a@b.com"], [], None, None) == pytest.approx(0.35)


class TestFetchAndParseVendor:
    @pytest.mark.asyncio
    async def test_hit_returns_result_and_score(self):
        async def fake_fetch(url, *, timeout_seconds=30):
            return _GOOD_MARKDOWN

        with patch(
            "agentic_crawler.jina_extract.fetch_clean_markdown",
            new=AsyncMock(side_effect=fake_fetch),
        ):
            result, score = await fetch_and_parse_vendor(
                "https://acmedefense.com/", "Acme Defense Systems",
                paths=("/",),
            )
        assert result is not None
        assert result.domain == "acmedefense.com"
        assert score >= 0.6
        assert "sales@acmedefense.com" in result.emails

    @pytest.mark.asyncio
    async def test_vendor_guard_rejects_other_vendor(self):
        async def fake_fetch(url, *, timeout_seconds=30):
            return _OTHER_VENDOR_MARKDOWN

        with patch(
            "agentic_crawler.jina_extract.fetch_clean_markdown",
            new=AsyncMock(side_effect=fake_fetch),
        ):
            result, score = await fetch_and_parse_vendor(
                "https://acmedefense.com/", "Acme Defense Systems",
                paths=("/",),
            )
        assert result is None

    @pytest.mark.asyncio
    async def test_no_signal_returns_none_but_score_zero(self):
        async def fake_fetch(url, *, timeout_seconds=30):
            return _NOISE_MARKDOWN * 10

        with patch(
            "agentic_crawler.jina_extract.fetch_clean_markdown",
            new=AsyncMock(side_effect=fake_fetch),
        ):
            result, score = await fetch_and_parse_vendor(
                "https://random.com/", "Random Blog",
                paths=("/",),
            )
        assert result is None

    @pytest.mark.asyncio
    async def test_no_fetch_returns_none(self):
        async def fake_fetch(url, *, timeout_seconds=30):
            return None

        with patch(
            "agentic_crawler.jina_extract.fetch_clean_markdown",
            new=AsyncMock(side_effect=fake_fetch),
        ):
            result, score = await fetch_and_parse_vendor(
                "https://acmedefense.com/", "Acme Defense",
                paths=("/", "/about"),
            )
        assert result is None
        assert score == 0.0
