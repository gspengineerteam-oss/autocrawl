"""Wikipedia scraper unit tests.

Validates the link-extraction and category-classification logic without
hitting the live Wikipedia API. The fetch + httpx layers are monkey-patched.
"""

from __future__ import annotations

import pytest

from crawler.tools.scrapers import wikipedia as wiki_mod


_BILDERBERG_HTML = """
<html><body><div id="mw-content-text">
  <p>Participants included representatives from
    <a href="/wiki/AXA">AXA</a>,
    <a href="/wiki/TotalEnergies">TotalEnergies</a>,
    <a href="/wiki/Eric_Schmidt">Eric Schmidt</a>,
    <a href="/wiki/Henry_Kissinger">Henry Kissinger</a>,
    and <a href="/wiki/Schmidt_Sciences">Schmidt Sciences</a>.
  </p>
  <p>The conference was held in <a href="/wiki/Switzerland">Switzerland</a>.</p>
  <ul>
    <li><a href="/wiki/Category:Bilderberg">Category page</a></li>
    <li><a href="/wiki/File:Logo.png">File link</a></li>
    <li><a href="/wiki/Talk:Bilderberg">Talk page</a></li>
    <li><a href="https://example.com">External link</a></li>
  </ul>
</div></body></html>
"""


def test_extract_titles_skips_namespaces():
    titles = wiki_mod._extract_wiki_titles(_BILDERBERG_HTML)
    assert "AXA" in titles
    assert "TotalEnergies" in titles
    assert "Eric Schmidt" in titles
    assert "Henry Kissinger" in titles
    assert "Schmidt Sciences" in titles
    assert "Switzerland" in titles
    # Skipped namespaces:
    assert not any(t.startswith("Category:") for t in titles)
    assert not any(t.startswith("File:") for t in titles)
    assert not any(t.startswith("Talk:") for t in titles)


def test_classify_company_vs_person_vs_place():
    assert wiki_mod._classify_by_categories(
        "Category:French insurance companies | Category:Multinational corporations"
    ) == "company"
    assert wiki_mod._classify_by_categories(
        "Category:1955 births | Category:American businesspeople"
    ) == "person"
    assert wiki_mod._classify_by_categories(
        "Category:Countries in Europe | Category:Federal republics"
    ) == "place"
    assert wiki_mod._classify_by_categories(
        "Category:Charitable foundations | Category:Research institutes"
    ) == "organisation"
    assert wiki_mod._classify_by_categories("") == "other"


def test_is_content_page_filters_namespaces():
    assert wiki_mod._is_content_page("AXA")
    assert wiki_mod._is_content_page("Eric Schmidt")
    assert not wiki_mod._is_content_page("File:Logo.png")
    assert not wiki_mod._is_content_page("Category:X")
    assert not wiki_mod._is_content_page("Special:Random")
    assert not wiki_mod._is_content_page("")


@pytest.mark.asyncio
async def test_list_exhibitors_emits_only_orgs(monkeypatch):
    async def fake_fetch(url, force_render=False):  # noqa: ARG001
        return {"html": _BILDERBERG_HTML, "url": url}

    async def fake_acquire(_url):
        return None

    fake_classifications = {
        "AXA": "company",
        "TotalEnergies": "company",
        "Eric Schmidt": "person",
        "Henry Kissinger": "person",
        "Schmidt Sciences": "organisation",
        "Switzerland": "place",
    }

    async def fake_classify(titles):  # noqa: ARG001
        return fake_classifications

    monkeypatch.setattr(wiki_mod, "fetch", fake_fetch)
    monkeypatch.setattr(wiki_mod, "rl_acquire", fake_acquire)
    monkeypatch.setattr(wiki_mod, "_classify_via_api", fake_classify)

    refs = await wiki_mod.list_exhibitors(
        "https://en.wikipedia.org/wiki/2026_Bilderberg_Conference",
        "bilderberg-2026",
    )
    names = {r.name for r in refs}
    assert names == {"AXA", "TotalEnergies", "Schmidt Sciences"}
    for r in refs:
        assert r.aggregator_domain == "wikipedia.org"
        assert r.provenance
        assert r.provenance[0].extraction_method.startswith("wikipedia_link_")
