"""Tests for name-only resolver scoring logic (no network)."""

from __future__ import annotations

from crawler.agents.name_resolver import _name_overlap_score


class TestNameOverlap:
    def test_exact_token_match(self):
        assert _name_overlap_score("XL Defense", "xldefense.com") > 0.5

    def test_no_overlap(self):
        score = _name_overlap_score("Acme Defense", "totallyunrelated.com")
        assert score == 0.0

    def test_partial_match(self):
        score = _name_overlap_score("Hanwha Systems Co Ltd", "hanwha.com")
        assert score > 0.0

    def test_short_tokens_ignored(self):
        # "L", "AB", "Co" should be filtered out (< 3 chars)
        score = _name_overlap_score("L AB Co", "anything.com")
        assert score == 0.0

    def test_empty_inputs(self):
        assert _name_overlap_score("", "anything.com") == 0.0
        assert _name_overlap_score("Acme", "") == 0.0

    def test_hyphen_normalised(self):
        score = _name_overlap_score("agile-defense", "agiledefense.com")
        assert score > 0.0

    def test_case_insensitive(self):
        a = _name_overlap_score("ACME CORP", "acmecorp.com")
        b = _name_overlap_score("acme corp", "ACMECORP.COM")
        # Both should resolve via case folding
        assert a > 0.0
        assert b > 0.0
