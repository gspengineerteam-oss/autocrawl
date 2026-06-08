"""Tests for Katana discovery wrapper (subprocess mocked)."""

from __future__ import annotations

import asyncio
import json

import pytest

from crawler.tools.discovery import katana as kt


class _FakeProc:
    def __init__(
        self,
        stdout: bytes = b"",
        stderr: bytes = b"",
        returncode: int = 0,
        raise_on_communicate: type[BaseException] | None = None,
    ):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode
        self._raise = raise_on_communicate
        self._killed = False

    async def communicate(self):
        if self._raise is asyncio.TimeoutError:
            raise asyncio.TimeoutError()
        return self._stdout, self._stderr

    def kill(self):
        self._killed = True
        self.returncode = -9

    async def wait(self):
        return self.returncode


def _stub_create_subprocess(fake: _FakeProc):
    async def _factory(*_args, **_kwargs):
        return fake

    return _factory


def _jsonl(*urls: str) -> bytes:
    return b"\n".join(
        json.dumps({"request": {"endpoint": u, "method": "GET"}}).encode()
        for u in urls
    )


@pytest.fixture(autouse=True)
def _force_available(monkeypatch):
    monkeypatch.setattr(kt, "_is_available", lambda: True)
    from crawler.config import get_settings

    s = get_settings()
    s.enable_katana = True


class TestKatanaDiscovery:
    def test_parses_jsonl_output(self, monkeypatch):
        fake = _FakeProc(
            stdout=_jsonl(
                "https://acme.example.com/",
                "https://acme.example.com/about",
                "https://acme.example.com/products",
            )
        )
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=5))
        assert out.success is True
        assert "https://acme.example.com/about" in out.urls
        assert "https://acme.example.com/products" in out.urls
        assert len(out.urls) == 3

    def test_filters_same_origin(self, monkeypatch):
        fake = _FakeProc(
            stdout=_jsonl(
                "https://acme.example.com/about",
                "https://cdn.other.com/asset.html",
                "https://twitter.com/acme",
            )
        )
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=5))
        assert out.success is True
        assert out.urls == ["https://acme.example.com/about"]

    def test_filters_asset_extensions(self, monkeypatch):
        fake = _FakeProc(
            stdout=_jsonl(
                "https://acme.example.com/about",
                "https://acme.example.com/static/main.js",
                "https://acme.example.com/static/logo.png",
                "https://acme.example.com/styles.css",
            )
        )
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=5))
        assert out.success is True
        assert out.urls == ["https://acme.example.com/about"]

    def test_handles_timeout(self, monkeypatch):
        fake = _FakeProc(raise_on_communicate=asyncio.TimeoutError)
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=1))
        assert out.success is False
        assert out.error == "timeout"
        assert out.urls == []
        assert fake._killed is True

    def test_handles_missing_binary(self, monkeypatch):
        monkeypatch.setattr(kt, "_is_available", lambda: False)
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=5))
        assert out.success is False
        assert out.error == "binary_missing"
        assert out.used_fallback is True

    def test_skips_malformed_jsonl_lines(self, monkeypatch):
        bad = b"this is not json\n" + _jsonl("https://acme.example.com/ok") + b"\n{also not json"
        fake = _FakeProc(stdout=bad)
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=5))
        assert out.success is True
        assert out.urls == ["https://acme.example.com/ok"]

    def test_dedups_case_insensitive(self, monkeypatch):
        fake = _FakeProc(
            stdout=_jsonl(
                "https://acme.example.com/About",
                "https://acme.example.com/about",
                "https://acme.example.com/ABOUT",
            )
        )
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=5))
        assert len(out.urls) == 1

    def test_caps_at_max_urls(self, monkeypatch):
        fake = _FakeProc(
            stdout=_jsonl(*[f"https://acme.example.com/p{i}" for i in range(20)])
        )
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=5, timeout=5))
        assert len(out.urls) == 5

    def test_disabled_returns_fallback(self, monkeypatch):
        from crawler.config import get_settings

        s = get_settings()
        s.enable_katana = False
        try:
            out = asyncio.run(kt.discover_urls("https://acme.example.com/", max_urls=10, timeout=5))
            assert out.success is False
            assert out.error == "disabled"
            assert out.used_fallback is True
        finally:
            s.enable_katana = True

    def test_invalid_seed_returns_error(self, monkeypatch):
        fake = _FakeProc(stdout=b"")
        monkeypatch.setattr(asyncio, "create_subprocess_exec", _stub_create_subprocess(fake))
        out = asyncio.run(kt.discover_urls("not-a-url", max_urls=10, timeout=5))
        assert out.success is False
        assert out.error == "invalid_seed"
