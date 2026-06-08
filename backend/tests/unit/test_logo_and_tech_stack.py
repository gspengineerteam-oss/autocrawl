"""Tests for logo extraction and tech-stack fingerprinting."""

from __future__ import annotations

import pytest

from crawler.tools.enrichment.logo_extractor import extract_logo
from crawler.tools.enrichment.tech_stack import detect


class TestLogoExtraction:
    def test_schema_org_logo_wins(self):
        html = '''<html><head>
        <script type="application/ld+json">
        {"@type": "Organization", "name": "Acme", "logo": "https://acme.com/logo.png"}
        </script>
        <meta property="og:image" content="https://acme.com/og.png">
        </head><body></body></html>'''
        schema = [{"@type": "Organization", "name": "Acme", "logo": "https://acme.com/logo.png"}]
        assert extract_logo(html, "https://acme.com", schema) == "https://acme.com/logo.png"

    def test_og_image_when_no_schema(self):
        html = '<html><head><meta property="og:image" content="https://acme.com/og.png"></head></html>'
        assert extract_logo(html, "https://acme.com", []) == "https://acme.com/og.png"

    def test_apple_touch_icon_fallback(self):
        html = '<html><head><link rel="apple-touch-icon" href="/icon.png"></head></html>'
        assert extract_logo(html, "https://acme.com", []) == "https://acme.com/icon.png"

    def test_protocol_relative_url_resolved(self):
        html = '<html><head><meta property="og:image" content="//cdn.acme.com/logo.png"></head></html>'
        assert extract_logo(html, "https://acme.com", []) == "https://cdn.acme.com/logo.png"

    def test_empty_html_returns_none(self):
        assert extract_logo("", "https://acme.com", []) is None

    def test_no_match_returns_none(self):
        html = "<html><body><h1>Hello</h1></body></html>"
        assert extract_logo(html, "https://acme.com", []) is None


class TestTechStackDetection:
    @pytest.mark.parametrize(
        "snippet,expected",
        [
            ('<script src="/wp-content/themes/foo.js"></script>', "wordpress"),
            ('<script src="https://cdn.shopify.com/s/files/1/x.js"></script>', "shopify"),
            ('<script id="__NEXT_DATA__" type="application/json">{}</script>', "nextjs"),
            ('<script>window.__NUXT__ = {}</script>', "nuxtjs"),
            ('<script src="//www.googletagmanager.com/gtm.js"></script>', "google_tag_manager"),
            ('<script src="https://js.stripe.com/v3/"></script>', "stripe"),
            ('<script src="https://js.hs-scripts.com/12345.js"></script>', "hubspot"),
            ('<script src="//cdn.jsdelivr.net/npm/vue@3"></script>', "vue"),
        ],
    )
    def test_recognises_common_stacks(self, snippet, expected):
        tags = detect(snippet)
        assert expected in tags

    def test_headers_contribute_signal(self):
        tags = detect("<html></html>", headers={"server": "nginx/1.18"})
        assert "nginx_header" in tags

    def test_empty_inputs_returns_empty(self):
        assert detect("") == []

    def test_dedupes_repeats(self):
        snippet = '<script src="/wp-content/x.js"></script><div class="wp-content">'
        tags = detect(snippet)
        assert tags.count("wordpress") == 1
