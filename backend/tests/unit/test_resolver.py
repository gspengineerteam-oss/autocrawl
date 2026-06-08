"""Tests for the vendor URL resolver — the most critical component.

These tests verify the PURE logic of candidate filtering and link parsing
without any network calls.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from crawler.agents.resolver import pure_filter_candidates
from crawler.tools.parsers.html_parser import find_visit_website_links
from crawler.tools.parsers.schema_org import find_organization_url
from crawler.tools.url_utils import canonical_domain, is_aggregator_or_excluded


FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "html"


def load_fixture(name: str) -> str:
    return (FIXTURE_DIR / name).read_text(encoding="utf-8")


class TestVendorResolutionFromTenTimes:
    """The whole point of the project: turn a 10times exhibitor page into the real vendor URL."""

    @pytest.fixture
    def html(self) -> str:
        return load_fixture("10times_xldefense.html")

    @pytest.fixture
    def base_url(self) -> str:
        return "https://10times.com/company/xldefense"

    def test_aggregator_domain_recognized(self):
        assert is_aggregator_or_excluded("https://10times.com/company/xldefense")

    def test_real_vendor_domain_not_blacklisted(self):
        assert not is_aggregator_or_excluded("https://www.xldefense.com")

    def test_schema_org_extracts_real_vendor_url(self, html: str, base_url: str):
        url = find_organization_url(html, base_url)
        assert url is not None
        assert canonical_domain(url) == "xldefense.com"
        assert canonical_domain(url) != "10times.com"

    def test_visit_website_button_finds_real_vendor(self, html: str, base_url: str):
        links = find_visit_website_links(html, base_url=base_url)
        assert any(canonical_domain(l) == "xldefense.com" for l in links)

    def test_outbound_candidates_exclude_aggregator(self, html: str, base_url: str):
        candidates = pure_filter_candidates(html, base_url=base_url, aggregator_domain="10times.com")
        domains = {c["domain"] for c in candidates}
        assert "10times.com" not in domains

    def test_outbound_candidates_exclude_social_and_utility(self, html: str, base_url: str):
        candidates = pure_filter_candidates(html, base_url=base_url, aggregator_domain="10times.com")
        domains = {c["domain"] for c in candidates}
        # social platforms and search engines must be filtered
        assert "linkedin.com" not in domains
        assert "x.com" not in domains
        assert "twitter.com" not in domains
        assert "google.com" not in domains
        assert "wikipedia.org" not in domains

    def test_real_vendor_appears_in_candidates(self, html: str, base_url: str):
        candidates = pure_filter_candidates(html, base_url=base_url, aggregator_domain="10times.com")
        domains = {c["domain"] for c in candidates}
        assert "xldefense.com" in domains
