"""Unit tests for S2 Jina-first listing tier.

Mocks `fetch_clean_markdown` so the tests run offline (no Jina API quota
consumed). Validates link-list parse, heading parse, booth attach,
aggregator filter, and dedup across buckets.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from agentic_crawler.jina_listing import (
    _candidates_from_headings,
    _candidates_from_link_list,
    _is_aggregator_host,
    _looks_like_org,
    jina_list_exhibitors,
)


_LISTING_MARKDOWN = """\
# RSAC 2025 Exhibitor List

Browse the 600+ companies showcasing the latest in cybersecurity:

- [Acme Defense Systems](https://acmedefense.com/)
- [Beta Security Inc](https://betasec.io/) Booth: A101
- [Gamma Threat Labs](https://gammathreat.com)
- [Delta Networks](https://delta.net/)
- [Epsilon Cyber](https://epsiloncyber.com/)
- [Zeta Quantum](https://zetaquantum.ai)
- [Eta Forensics](https://etaforensics.com)
- [Theta Resilience](https://thetares.com/)
- [Iota Surveillance](https://iotasurveillance.com)
- [Kappa Cloud](https://kappa.cloud)
- [Login](https://rsaconference.com/login)
- [Register](https://rsaconference.com/register)
- [Follow us on Twitter](https://twitter.com/rsac)

## Featured Exhibitors

Acme Defense Systems brings tactical drones to the show floor.
Booth: A101 for live demos.

Beta Security Inc showcases zero-trust architectures.
"""

_AGGREGATOR_HEAVY = """\
# Conference Page

- [Sign up](https://example.com/signup)
- [Twitter](https://twitter.com/conf)
- [Facebook](https://facebook.com/conf)
- [LinkedIn](https://linkedin.com/company/conf)
- [Google](https://google.com)
"""

_HEADINGS_MARKDOWN = """\
# Sponsors

## Acme Defense Systems
Leading drone manufacturer.

## Beta Security Inc
Zero-trust platform.

## Gamma Threat Labs
Threat intelligence feeds.
"""


class TestLooksLikeOrg:
    def test_accepts_company_name(self):
        assert _looks_like_org("Acme Defense Systems")

    def test_rejects_menu_words(self):
        assert not _looks_like_org("Login")
        assert not _looks_like_org("register now")
        assert not _looks_like_org("Read More")

    def test_rejects_empty(self):
        assert not _looks_like_org("")
        assert not _looks_like_org("a")

    def test_rejects_url_like(self):
        assert not _looks_like_org("https://example.com")
        assert not _looks_like_org("www.example.com")


class TestAggregatorFilter:
    def test_blocks_social_hosts(self):
        assert _is_aggregator_host("twitter.com")
        assert _is_aggregator_host("www.linkedin.com".replace("www.", ""))
        assert _is_aggregator_host("sub.facebook.com")

    def test_allows_legit_vendor(self):
        assert not _is_aggregator_host("acmedefense.com")
        assert not _is_aggregator_host("betasec.io")

    def test_handles_none(self):
        assert not _is_aggregator_host(None)
        assert not _is_aggregator_host("")


class TestLinkListExtraction:
    def test_extracts_vendor_links(self):
        cands = _candidates_from_link_list(_LISTING_MARKDOWN)
        names = {c["name"] for c in cands}
        assert "Acme Defense Systems" in names
        assert "Beta Security Inc" in names
        assert "Kappa Cloud" in names

    def test_skips_menu_items(self):
        cands = _candidates_from_link_list(_LISTING_MARKDOWN)
        names_lower = {c["name"].lower() for c in cands}
        assert "login" not in names_lower
        assert "register" not in names_lower

    def test_skips_social_aggregators(self):
        cands = _candidates_from_link_list(_AGGREGATOR_HEAVY)
        assert cands == []

    def test_populates_domain(self):
        cands = _candidates_from_link_list(_LISTING_MARKDOWN)
        acme = next((c for c in cands if c["name"] == "Acme Defense Systems"), None)
        assert acme is not None
        assert acme["domain"] == "acmedefense.com"


class TestHeadingExtraction:
    def test_extracts_h2_company_names(self):
        cands = _candidates_from_headings(_HEADINGS_MARKDOWN)
        names = {c["name"] for c in cands}
        assert "Acme Defense Systems" in names
        assert "Beta Security Inc" in names
        assert "Gamma Threat Labs" in names

    def test_no_urls_from_headings(self):
        cands = _candidates_from_headings(_HEADINGS_MARKDOWN)
        for c in cands:
            assert c["url"] is None
            assert c["domain"] is None


class TestJinaListExhibitors:
    @pytest.mark.asyncio
    async def test_hit_returns_candidates(self):
        async def fake_fetch(url, *, timeout_seconds=25):
            if "/exhibitors" in url or url.endswith("/"):
                return _LISTING_MARKDOWN
            return None

        with patch(
            "agentic_crawler.jina_listing.fetch_clean_markdown",
            new=AsyncMock(side_effect=fake_fetch),
        ):
            cands = await jina_list_exhibitors(
                "https://rsaconference.com/exhibitors",
                "RSAC 2025",
                paths=("/exhibitors",),
            )
        names = {c["name"] for c in cands}
        assert "Acme Defense Systems" in names
        assert "Kappa Cloud" in names
        assert len(cands) >= 8

    @pytest.mark.asyncio
    async def test_no_fetch_returns_empty(self):
        async def fake_fetch(url, *, timeout_seconds=25):
            return None

        with patch(
            "agentic_crawler.jina_listing.fetch_clean_markdown",
            new=AsyncMock(side_effect=fake_fetch),
        ):
            cands = await jina_list_exhibitors(
                "https://example.com/",
                "Some Expo",
                paths=("/exhibitors",),
            )
        assert cands == []

    @pytest.mark.asyncio
    async def test_dedup_across_paths(self):
        async def fake_fetch(url, *, timeout_seconds=25):
            return _LISTING_MARKDOWN

        with patch(
            "agentic_crawler.jina_listing.fetch_clean_markdown",
            new=AsyncMock(side_effect=fake_fetch),
        ):
            cands = await jina_list_exhibitors(
                "https://rsaconference.com/exhibitors",
                "RSAC 2025",
                paths=("/exhibitors", "/sponsors", "/partners"),
            )
        names = [c["name"].lower() for c in cands]
        assert len(names) == len(set(names))

    @pytest.mark.asyncio
    async def test_invalid_seed_url_returns_empty(self):
        cands = await jina_list_exhibitors(
            "not-a-valid-url-without-host",
            "Bogus",
            paths=("/",),
        )
        assert cands == []
