"""Tests for email/phone/social harvesting."""

from __future__ import annotations

from crawler.tools.parsers.email_harvester import (
    harvest_emails,
    harvest_phones,
    harvest_socials,
)


class TestEmailHarvester:
    def test_extracts_basic_email(self):
        text = "Contact us at info@xldefense.com or sales@xldefense.com"
        out = harvest_emails(text)
        assert "info@xldefense.com" in out
        assert "sales@xldefense.com" in out

    def test_skips_blacklisted(self):
        text = "Try email@example.com or your-real@xldefense.com"
        out = harvest_emails(text)
        assert "email@example.com" not in out
        assert "your-real@xldefense.com" in out

    def test_lowercase(self):
        out = harvest_emails("write to INFO@XLDefense.COM")
        assert "info@xldefense.com" in out


class TestPhoneHarvester:
    def test_basic_phone(self):
        out = harvest_phones("Call +1 (212) 555-1234 today")
        assert any("212" in p for p in out)

    def test_short_strings_rejected(self):
        out = harvest_phones("123")
        assert not out


class TestSocialHarvester:
    def test_linkedin(self):
        text = "Follow us at https://www.linkedin.com/company/xldefense"
        socials = harvest_socials(text)
        assert any("linkedin.com/company/xldefense" in u for u in socials.get("linkedin", []))

    def test_twitter_and_x(self):
        text = "https://twitter.com/xldefense and https://x.com/xldefense"
        socials = harvest_socials(text)
        assert len(socials.get("twitter", [])) >= 1
