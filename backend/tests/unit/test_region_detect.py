"""Tests for regional search engine routing — critical for catching
non-Western vendors (China, Japan, Korea, Russia)."""

from __future__ import annotations

import pytest

from crawler.tools.search.region import detect_regions


class TestEnglishKeywords:
    @pytest.mark.parametrize(
        "query,expected",
        [
            ("Tokyo defense expo 2026", ["jp"]),
            ("Beijing security expo", ["cn"]),
            ("Seoul ADEX 2026", ["kr"]),
            ("Moscow MAKS", ["ru"]),
            ("Zhuhai Airshow", ["cn"]),
            ("Shenzhen security tech", ["cn"]),
            ("Russian defense industry", ["ru"]),
            ("Korean police equipment", ["kr"]),
            ("Japanese aerospace expo", ["jp"]),
        ],
    )
    def test_keyword_routing(self, query, expected):
        assert sorted(detect_regions(query)) == sorted(expected)


class TestBroadAsia:
    def test_asia_fans_out_to_three(self):
        assert sorted(detect_regions("defense expo Asia 2026")) == ["cn", "jp", "kr"]

    def test_apac_alias(self):
        assert sorted(detect_regions("APAC defense conference")) == ["cn", "jp", "kr"]


class TestUnicodeDetection:
    def test_chinese_simplified(self):
        # Chinese International Police Equipment Expo
        assert "cn" in detect_regions("中国国际警用装备博览会")

    def test_japanese_kana(self):
        # Japanese: 防衛装備品展示会 (defense equipment exhibition) — has kanji + hiragana
        # Use full Japanese phrase mixing kanji and katakana
        q = "ディフェンス展示会"  # ディフェンス展示会
        assert "jp" in detect_regions(q)

    def test_korean_hangul(self):
        # 서울 ADEX 2026
        assert "kr" in detect_regions("서울 ADEX 2026")

    def test_cyrillic_russian(self):
        # Армия 2026 (Army Expo)
        assert "ru" in detect_regions("Армия 2026")


class TestNoFalseMatch:
    def test_global_query_no_region(self):
        assert detect_regions("ISC West 2026") == []

    def test_milipol_no_region(self):
        assert detect_regions("Milipol Paris 2026") == []

    def test_eurosatory_no_region(self):
        assert detect_regions("Eurosatory 2026") == []

    def test_empty_string(self):
        assert detect_regions("") == []
