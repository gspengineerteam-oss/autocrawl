"""Tests for PDF extractor's pure logic (table parsing, noise filter)."""

from __future__ import annotations

from crawler.tools.scrapers.pdf_extractor import (
    _is_noise,
    _vendors_from_table,
)


class TestNoiseFilter:
    def test_too_short(self):
        assert _is_noise("ab") is True
        assert _is_noise("") is True

    def test_too_long(self):
        assert _is_noise("a" * 500) is True

    def test_page_number(self):
        assert _is_noise("page 5") is True
        assert _is_noise("Page 12") is True

    def test_section_titles(self):
        assert _is_noise("exhibitor list") is True
        assert _is_noise("Table of Contents") is True
        assert _is_noise("Index") is True

    def test_pure_digits(self):
        assert _is_noise("123 456") is True
        assert _is_noise("999") is True

    def test_real_company_name_passes(self):
        assert _is_noise("XL Defense Systems") is False
        assert _is_noise("Hanwha Systems Co Ltd") is False
        assert _is_noise("Mitsubishi Heavy Industries") is False


class TestVendorsFromTable:
    def test_empty_table(self):
        assert _vendors_from_table([]) == []

    def test_single_row_no_data(self):
        assert _vendors_from_table([["Header Only"]]) == []

    def test_finds_vendors_with_company_header(self):
        table = [
            ["Booth", "Company", "Country"],
            ["A101", "XL Defense Systems", "USA"],
            ["A102", "Guangzhou Institute Defense", "China"],
            ["A103", "Hanwha Systems Co Ltd", "Korea"],
        ]
        vendors = _vendors_from_table(table)
        assert len(vendors) == 3
        names = [v.name for v in vendors]
        assert "XL Defense Systems" in names
        assert "Guangzhou Institute Defense" in names
        assert "Hanwha Systems Co Ltd" in names

    def test_position_is_row_index(self):
        table = [
            ["Booth", "Company"],
            ["A1", "Acme Corp"],
            ["A2", "Foobar Inc"],
        ]
        vendors = _vendors_from_table(table)
        assert vendors[0].position == 1
        assert vendors[1].position == 2

    def test_table_row_recorded(self):
        table = [
            ["Booth", "Exhibitor"],
            ["A1", "Acme"],
        ]
        vendors = _vendors_from_table(table)
        assert vendors[0].table_row == 1
        assert vendors[0].confidence == 0.85

    def test_skips_noise_rows(self):
        table = [
            ["Booth", "Company"],
            ["A1", "Acme Corp"],
            ["", "Page 5"],  # noise
            ["A2", "Real Corp"],
        ]
        vendors = _vendors_from_table(table)
        names = [v.name for v in vendors]
        assert "Acme Corp" in names
        assert "Real Corp" in names
        assert "Page 5" not in names

    def test_fallback_picks_longest_alpha_cell(self):
        # No header column for company/exhibitor: use heuristic
        table = [
            ["Col1", "Col2", "Col3"],
            ["A1", "Saab Defence and Security AB", "Stockholm"],
        ]
        vendors = _vendors_from_table(table)
        assert vendors[0].name == "Saab Defence and Security AB"

    def test_unicode_company_names(self):
        table = [
            ["Booth", "Company"],
            ["B1", "中国北方工业公司"],
            ["B2", "Концерн Калашников"],
        ]
        vendors = _vendors_from_table(table)
        names = [v.name for v in vendors]
        assert any("北方" in n for n in names)
        assert any("Калашников" in n for n in names)
