"""Unit tests for URL canonicalization & aggregator detection."""

from __future__ import annotations

from crawler.tools.url_utils import (
    canonical_domain,
    canonical_url,
    is_aggregator_or_excluded,
    looks_like_parking_page,
    strip_tracking,
)


class TestCanonicalDomain:
    def test_strips_scheme_and_www(self):
        assert canonical_domain("https://www.xldefense.com/about") == "xldefense.com"

    def test_handles_uppercase(self):
        assert canonical_domain("HTTPS://XLDefense.COM") == "xldefense.com"

    def test_subdomain_collapses_to_etld_plus_one(self):
        assert canonical_domain("https://blog.xldefense.com/post") == "xldefense.com"

    def test_handles_co_uk(self):
        assert canonical_domain("https://example.co.uk") == "example.co.uk"

    def test_bare_domain(self):
        assert canonical_domain("xldefense.com") == "xldefense.com"

    def test_empty_returns_empty(self):
        assert canonical_domain("") == ""


class TestCanonicalUrl:
    def test_strips_utm_params(self):
        u = "https://xldefense.com/?utm_source=10times&utm_medium=cpc&keep=this"
        assert "utm_" not in canonical_url(u)
        assert "keep=this" in canonical_url(u)

    def test_strips_fbclid(self):
        u = "https://xldefense.com/?fbclid=abc123"
        assert "fbclid" not in canonical_url(u)

    def test_drops_default_port(self):
        assert ":443" not in canonical_url("https://xldefense.com:443/")

    def test_lowercase_host(self):
        assert "xldefense.com" in canonical_url("https://XLDefense.COM/About")

    def test_drops_fragment(self):
        assert "#section" not in canonical_url("https://xldefense.com/page#section")


class TestStripTracking:
    def test_drops_only_tracking(self):
        u = "https://x.com/?utm_source=a&id=42&gclid=g"
        out = strip_tracking(u)
        assert "id=42" in out
        assert "utm_source" not in out
        assert "gclid" not in out


class TestAggregatorBlacklist:
    def test_10times_is_blacklisted(self):
        assert is_aggregator_or_excluded("https://10times.com/expo/security-defense-2026")

    def test_eventbrite_is_blacklisted(self):
        assert is_aggregator_or_excluded("https://www.eventbrite.com/e/expo-12345")

    def test_linkedin_is_blacklisted(self):
        assert is_aggregator_or_excluded("https://linkedin.com/company/xldefense")

    def test_google_is_blacklisted(self):
        assert is_aggregator_or_excluded("https://google.com/search?q=xldefense")

    def test_real_vendor_is_not_blacklisted(self):
        assert not is_aggregator_or_excluded("https://www.xldefense.com")

    def test_subdomain_of_blacklisted_still_blocked(self):
        assert is_aggregator_or_excluded("https://blog.10times.com/article")


class TestParkingDetection:
    def test_known_parking_phrase_detected(self):
        assert looks_like_parking_page("<html><body>This domain is for sale.</body></html>")

    def test_normal_page_not_parking(self):
        assert not looks_like_parking_page("<html><body><h1>XL Defense</h1></body></html>")
