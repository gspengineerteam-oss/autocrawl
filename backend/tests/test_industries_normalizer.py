"""Snowglobe 2026-05-25 — industries whitelist normalizer."""

import sys
from pathlib import Path

# Make `tools` importable + the agentic_crawler module
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend" / "src"))

from agentic_crawler.industries_normalizer import (  # noqa: E402
    normalize_industries,
    reload_whitelist,
)


def setup_function(_):
    reload_whitelist()


def test_empty_input():
    assert normalize_industries([]) == []
    assert normalize_industries(None) == []


def test_canonical_passthrough():
    out = normalize_industries(["defense_industrial", "weapons_manufacturing"])
    assert "defense_industrial" in out
    assert "weapons_manufacturing" in out


def test_synonym_mapping_defense():
    out = normalize_industries(["defense", "defence"])
    assert "defense_industrial" in out


def test_synonym_mapping_weapons():
    out = normalize_industries(["firearms", "small arms"])
    assert "weapons_manufacturing" in out


def test_synonym_mapping_naval():
    out = normalize_industries(["naval", "warship"])
    assert "naval_systems" in out


def test_deny_list_drops_civilian_aerospace():
    # 'aerospace' alone is deny-listed as ambiguous (civilian airlines etc).
    out = normalize_industries(["aerospace", "aviation", "transportation"])
    assert out == []


def test_deny_list_drops_generic_tags():
    out = normalize_industries(["manufacturing", "technology", "consulting", "various"])
    assert out == []


def test_deny_list_substring_match():
    # 'commercial aviation services' contains 'aviation' (deny-listed).
    out = normalize_industries(["commercial aviation services", "passenger aviation"])
    assert out == []


def test_military_aerospace_synonym():
    out = normalize_industries(["military aerospace", "combat aircraft"])
    assert "military_aerospace" in out


def test_multi_word_synonym_inside_phrase():
    out = normalize_industries(["leading european defense industry player"])
    assert "defense_industrial" in out


def test_dedup_preserves_order():
    out = normalize_industries(["defense", "weapons", "defense", "weapons"])
    assert out == ["defense_industrial", "weapons_manufacturing"]


def test_non_string_skipped():
    out = normalize_industries(["defense", None, 123, ""])  # type: ignore[list-item]
    assert out == ["defense_industrial"]


def test_unknown_tag_dropped():
    out = normalize_industries(["random_made_up_tag_xyz"])
    assert out == []
