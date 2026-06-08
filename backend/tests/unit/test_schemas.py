"""Tests for Pydantic schemas."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from crawler.schemas import (
    Expo,
    ExhibitorRef,
    ExpoSource,
    SourceProvenance,
    Vendor,
    VendorURL,
)


class TestExpo:
    def test_expo_id_normalized_lowercase(self):
        e = Expo(expo_id="ISC-WEST-2026", name="ISC West 2026", source=ExpoSource.UNKNOWN)
        assert e.expo_id == "isc-west-2026"

    def test_expo_minimal(self):
        e = Expo(expo_id="x", name="Some Expo")
        assert e.name == "Some Expo"
        assert e.discovered_at.tzinfo is not None


class TestExhibitorRef:
    def test_aggregator_ref_with_url(self):
        ref = ExhibitorRef(
            expo_id="x",
            name="Acme",
            raw_url="https://10times.com/company/acme",
            aggregator_domain="10times.com",
        )
        assert ref.raw_url is not None

    def test_pdf_ref_no_url_required(self):
        # PDF-sourced refs don't have a URL; they carry provenance instead.
        ref = ExhibitorRef(expo_id="x", name="Y")
        assert ref.raw_url is None
        assert ref.aggregator_domain is None


class TestVendorURL:
    def test_resolution_method_constrained(self):
        with pytest.raises(ValidationError):
            VendorURL(
                domain="xldefense.com",
                canonical_url="https://xldefense.com",
                resolved_from="https://10times.com/company/xldefense",
                expo_id="security-defense-2026",
                exhibitor_name="XL Defense",
                resolution_method="bogus",  # type: ignore[arg-type]
            )

    def test_confidence_bounded(self):
        with pytest.raises(ValidationError):
            VendorURL(
                domain="xldefense.com",
                canonical_url="https://xldefense.com",
                resolved_from="https://10times.com/company/xldefense",
                expo_id="x",
                exhibitor_name="X",
                resolution_method="schema_org",
                confidence=1.5,
            )


class TestVendor:
    def test_vendor_default_timestamps(self):
        v = Vendor(domain="xldefense.com", company_name="XL Defense", canonical_url="https://xldefense.com")
        assert v.first_enriched_at <= datetime.now(timezone.utc)
        assert v.confidence_score == 0.0
        assert v.enrichment_gap == []
        assert v.source_trail == []
        assert v.source_tags == []


class TestSourceProvenance:
    def test_aggregator_provenance(self):
        p = SourceProvenance(type="aggregator", url="https://10times.com/company/acme")
        assert p.type == "aggregator"
        assert p.page is None

    def test_pdf_provenance_with_full_metadata(self):
        p = SourceProvenance(
            type="pdf",
            url="https://malaysiadefence.com/2026/list.pdf",
            pdf_filename="MDE2026_Exhibitor_List.pdf",
            pdf_sha256="abc123def",
            page=7,
            position=3,
            extraction_method="vlm_ocr",
            confidence=0.92,
            context_snippet="...AS#312 Guangzhou Institute Defense Hall B...",
        )
        assert p.type == "pdf"
        assert p.page == 7
        assert p.position == 3
        assert p.extraction_method == "vlm_ocr"

    def test_invalid_type_rejected(self):
        with pytest.raises(ValidationError):
            SourceProvenance(type="bogus_type")  # type: ignore[arg-type]
