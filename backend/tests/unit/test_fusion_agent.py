"""Tests for the fusion LLM agent (chat() mocked)."""

from __future__ import annotations

import asyncio

import pytest

from crawler.agents import fusion as fa
from crawler.schemas import (
    EmailDraftPayload,
    FusionArtifacts,
    FusionSuggestion,
    Vendor,
)


def _make_vendor(vendor_id: str, name: str, industries: list[str]) -> Vendor:
    return Vendor(
        vendor_id=vendor_id,
        company_name=name,
        domain=f"{vendor_id}.example.com",
        industries=industries,
        products=["product1"],
        description=f"{name} is a vendor that does stuff.",
    )


class TestSuggestFusions:
    def test_returns_empty_for_under_two(self, monkeypatch):
        v = [_make_vendor("v1", "Solo", ["X"])]
        out = asyncio.run(fa.suggest_fusions(v))
        assert out == []

    def test_filters_invalid_vendor_ids(self, monkeypatch):
        v1 = _make_vendor("v1", "Acme", ["drone"])
        v2 = _make_vendor("v2", "Beta", ["cctv"])

        async def fake_chat(messages, *, use_heavy=False, response_format=None):
            return fa._SuggestionsWrap(suggestions=[
                FusionSuggestion(
                    source_vendor_ids=["v1", "v2"],
                    product_name="Drone CCTV",
                    rationale="combo",
                    confidence=0.8,
                ),
                FusionSuggestion(
                    source_vendor_ids=["v1", "ghost"],
                    product_name="Bad",
                    rationale="x",
                    confidence=0.1,
                ),
            ])

        monkeypatch.setattr(fa, "chat", fake_chat)
        out = asyncio.run(fa.suggest_fusions([v1, v2]))
        assert len(out) == 1
        assert out[0].product_name == "Drone CCTV"

    def test_returns_empty_on_chat_failure(self, monkeypatch):
        v1 = _make_vendor("v1", "Acme", ["drone"])
        v2 = _make_vendor("v2", "Beta", ["cctv"])

        async def fake_chat(messages, *, use_heavy=False, response_format=None):
            raise RuntimeError("LLM down")

        monkeypatch.setattr(fa, "chat", fake_chat)
        out = asyncio.run(fa.suggest_fusions([v1, v2]))
        assert out == []


class TestGenerateArtifacts:
    def test_returns_artifacts(self, monkeypatch):
        v1 = _make_vendor("v1", "Acme", ["drone"])
        v2 = _make_vendor("v2", "Beta", ["cctv"])

        async def fake_chat(messages, *, use_heavy=False, response_format=None):
            return FusionArtifacts(
                name="DroneCam",
                tagline="Aerial surveillance",
                description="Two paragraph desc here.",
                industries=["drone", "cctv"],
                tags=["surveillance"],
            )

        monkeypatch.setattr(fa, "chat", fake_chat)
        out = asyncio.run(fa.generate_artifacts([v1, v2], hint="aerial"))
        assert out.name == "DroneCam"
        assert "drone" in out.industries

    def test_raises_on_chat_failure(self, monkeypatch):
        v1 = _make_vendor("v1", "Acme", ["drone"])
        v2 = _make_vendor("v2", "Beta", ["cctv"])

        async def fake_chat(messages, *, use_heavy=False, response_format=None):
            raise RuntimeError("nope")

        monkeypatch.setattr(fa, "chat", fake_chat)
        with pytest.raises(RuntimeError):
            asyncio.run(fa.generate_artifacts([v1, v2]))


class TestDraftEmail:
    def test_returns_email_draft(self, monkeypatch):
        v = _make_vendor("v1", "Acme", ["drone"])

        async def fake_chat(messages, *, use_heavy=False, response_format=None):
            return EmailDraftPayload(
                subject="Collaboration on DroneCam",
                body="Hi team,\n\nLet's chat about DroneCam.",
            )

        monkeypatch.setattr(fa, "chat", fake_chat)
        out = asyncio.run(fa.draft_email(
            fusion_name="DroneCam",
            fusion_description="An aerial surveillance product.",
            vendor=v,
            to_email="contact@acme.example.com",
        ))
        assert "DroneCam" in out.subject

    def test_raises_on_chat_failure(self, monkeypatch):
        v = _make_vendor("v1", "Acme", ["drone"])

        async def fake_chat(messages, *, use_heavy=False, response_format=None):
            raise RuntimeError("LLM crashed")

        monkeypatch.setattr(fa, "chat", fake_chat)
        with pytest.raises(RuntimeError):
            asyncio.run(fa.draft_email(
                fusion_name="X",
                fusion_description="Y",
                vendor=v,
                to_email="x@y.com",
            ))
