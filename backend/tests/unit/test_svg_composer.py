"""Tests for SVG composite renderer (httpx mocked)."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest


@pytest.fixture
def tmp_data_dir(tmp_path, monkeypatch):
    from crawler.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "data_dir", tmp_path)
    return tmp_path


def test_render_creates_svg_file(tmp_data_dir, monkeypatch):
    from crawler.tools.fusion import svg_composer as sc

    async def _fake_fetch(url, timeout=5.0):
        return None

    monkeypatch.setattr(sc, "_fetch_logo_b64", _fake_fetch)

    out = asyncio.run(
        sc.render_composite(
            "abc-123",
            name="Drone CCTV",
            tagline="Surveillance dari udara",
            source_logos=[("Acme Drones", None), ("Beta CCTV", None)],
        )
    )
    assert isinstance(out, Path)
    assert out.exists()
    content = out.read_text(encoding="utf-8")
    assert "Drone CCTV" in content
    assert "Surveillance" in content
    assert "Acme Drones" in content
    assert "Beta CCTV" in content


def test_render_idempotent(tmp_data_dir, monkeypatch):
    from crawler.tools.fusion import svg_composer as sc

    async def _fake_fetch(url, timeout=5.0):
        return None

    monkeypatch.setattr(sc, "_fetch_logo_b64", _fake_fetch)

    out1 = asyncio.run(
        sc.render_composite(
            "abc-123",
            name="X",
            tagline="t",
            source_logos=[("A", None), ("B", None)],
        )
    )
    mtime1 = out1.stat().st_mtime
    out2 = asyncio.run(
        sc.render_composite(
            "abc-123",
            name="DIFFERENT",
            tagline="t2",
            source_logos=[("A", None), ("B", None)],
        )
    )
    assert out1 == out2
    assert out2.stat().st_mtime == mtime1


def test_render_with_logo_data(tmp_data_dir, monkeypatch):
    from crawler.tools.fusion import svg_composer as sc

    async def _fake_fetch(url, timeout=5.0):
        if url and "good" in url:
            return "data:image/png;base64,iVBORw0KGgo="
        return None

    monkeypatch.setattr(sc, "_fetch_logo_b64", _fake_fetch)

    out = asyncio.run(
        sc.render_composite(
            "fusion-with-logo",
            name="P",
            tagline="t",
            source_logos=[("Good", "https://good.example/logo.png"), ("Bad", None)],
        )
    )
    content = out.read_text(encoding="utf-8")
    assert "data:image/png;base64" in content
    assert "G" in content


def test_sanitize_strips_xml_dangerous(tmp_data_dir, monkeypatch):
    from crawler.tools.fusion import svg_composer as sc

    async def _fake_fetch(url, timeout=5.0):
        return None

    monkeypatch.setattr(sc, "_fetch_logo_b64", _fake_fetch)

    out = asyncio.run(
        sc.render_composite(
            "fusion-xss",
            name="<script>alert(1)</script>",
            tagline="<img src=x>",
            source_logos=[("<bad>", None), ("<also>", None)],
        )
    )
    content = out.read_text(encoding="utf-8")
    assert "<script>" not in content
    assert "<img src=x>" not in content
