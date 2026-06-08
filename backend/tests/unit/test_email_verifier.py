from __future__ import annotations

import pytest

from crawler.tools.enrichment.email_verifier import (
    _disposable_set,
    _domain_similarity,
    verify_email,
)


@pytest.mark.asyncio
async def test_valid_email_with_matching_domain():
    result = await verify_email(
        "info@xldefense.com",
        vendor_domain="xldefense.com",
        mx_records=["10 mail.xldefense.com."],
    )
    assert result.valid_syntax is True
    assert result.domain_matches_vendor is True
    assert result.mx_present is True
    assert result.role_based is True
    assert result.score >= 0.7


@pytest.mark.asyncio
async def test_invalid_syntax():
    result = await verify_email("not-an-email", mx_records=[])
    assert result.valid_syntax is False
    assert result.score == 0.0
    assert result.signals.get("reason") == "invalid_syntax"


@pytest.mark.asyncio
async def test_disposable_detected():
    result = await verify_email(
        "throwaway@mailinator.com",
        mx_records=["10 mail.mailinator.com."],
    )
    assert result.disposable is True
    assert result.score < 0.7


@pytest.mark.asyncio
async def test_role_based_lowers_score():
    role_result = await verify_email(
        "admin@xldefense.com",
        vendor_domain="xldefense.com",
        mx_records=["10 mx.xldefense.com."],
    )
    person_result = await verify_email(
        "john.smith@xldefense.com",
        vendor_domain="xldefense.com",
        mx_records=["10 mx.xldefense.com."],
    )
    assert role_result.role_based is True
    assert person_result.role_based is False
    assert person_result.score > role_result.score


@pytest.mark.asyncio
async def test_no_mx_lowers_score():
    no_mx = await verify_email("ceo@example.com", mx_records=[])
    with_mx = await verify_email("ceo@example.com", mx_records=["10 mx.example.com."])
    assert no_mx.mx_present is False
    assert with_mx.mx_present is True
    assert with_mx.score > no_mx.score


@pytest.mark.asyncio
async def test_domain_mismatch_penalty():
    matched = await verify_email(
        "person@xldefense.com",
        vendor_domain="xldefense.com",
        mx_records=["10 mx.xldefense.com."],
    )
    mismatched = await verify_email(
        "person@randomprovider.com",
        vendor_domain="xldefense.com",
        mx_records=["10 mx.randomprovider.com."],
    )
    assert matched.domain_matches_vendor is True
    assert mismatched.domain_matches_vendor is False
    assert matched.score > mismatched.score


@pytest.mark.asyncio
async def test_signals_populated():
    result = await verify_email(
        "sales@hanwha.com",
        vendor_domain="hanwha.com",
        mx_records=["10 hanwha-asp.mail.protection.outlook.com."],
    )
    assert result.signals["domain"] == "hanwha.com"
    assert result.signals["local"] == "sales"


class TestDisposableSet:
    def test_loaded(self):
        s = _disposable_set()
        assert "mailinator.com" in s
        assert "10minutemail.com" in s
        assert "guerrillamail.com" in s

    def test_legitimate_not_in_list(self):
        s = _disposable_set()
        assert "xldefense.com" not in s
        assert "google.com" not in s


class TestDomainSimilarity:
    def test_exact_match(self):
        assert _domain_similarity("xldefense.com", "xldefense.com") is True

    def test_root_match(self):
        assert _domain_similarity("xldefense.com", "xldefense.co.uk") is True

    def test_no_match(self):
        assert _domain_similarity("xldefense.com", "totallyunrelated.org") is False

    def test_empty(self):
        assert _domain_similarity("", "x.com") is False
        assert _domain_similarity("x.com", "") is False


@pytest.mark.asyncio
async def test_to_dict_serialisable():
    result = await verify_email(
        "info@example.com",
        vendor_domain="example.com",
        mx_records=["10 mail.example.com."],
    )
    d = result.to_dict()
    assert "email" in d
    assert "score" in d
    assert "signals" in d
    assert isinstance(d["signals"], dict)
