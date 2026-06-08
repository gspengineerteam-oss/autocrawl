from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


JsonType = JSONB().with_variant(JSON(), "sqlite")


class VendorORM(Base):
    __tablename__ = "vendors"

    vendor_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    domain: Mapped[str | None] = mapped_column(String(253), nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="enriched", server_default="enriched", index=True
    )
    company_name: Mapped[str] = mapped_column(String(500), nullable=False)
    canonical_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text)
    tagline: Mapped[str | None] = mapped_column(Text)

    industries: Mapped[list[str]] = mapped_column(JsonType, default=list)
    products: Mapped[list[str]] = mapped_column(JsonType, default=list)
    expos_seen: Mapped[list[str]] = mapped_column(JsonType, default=list)
    tech_stack: Mapped[list[str]] = mapped_column(JsonType, default=list)
    enrichment_gap: Mapped[list[str]] = mapped_column(JsonType, default=list)
    source_tags: Mapped[list[str]] = mapped_column(JsonType, default=list)

    address: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    socials: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    funding: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    contacts: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    source_trail: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    raw_extracts: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)

    employee_count: Mapped[int | None] = mapped_column(Integer)
    founded_year: Mapped[int | None] = mapped_column(Integer)
    domain_age_days: Mapped[int | None] = mapped_column(Integer)
    registrar: Mapped[str | None] = mapped_column(String(200))
    registrar_country: Mapped[str | None] = mapped_column(String(10))
    first_seen_wayback: Mapped[date | None] = mapped_column(Date)
    logo_url: Mapped[str | None] = mapped_column(Text)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)

    language_code: Mapped[str] = mapped_column(String(2), default="en", server_default="en", nullable=False)
    description_original: Mapped[str | None] = mapped_column(Text)
    tagline_original: Mapped[str | None] = mapped_column(Text)
    products_original: Mapped[list[str]] = mapped_column(JsonType, default=list)
    industries_original: Mapped[list[str]] = mapped_column(JsonType, default=list)
    translation_method: Mapped[str | None] = mapped_column(String(60))
    translated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Phase 5 — Product catalog + DOI scoring. See `Product` schema in
    # crawler.schemas. Legacy `products` JSONB column stays as input.
    products_detailed: Mapped[list[dict]] = mapped_column(
        JsonType, default=list, nullable=False, server_default="[]"
    )
    overall_scope_score: Mapped[float] = mapped_column(
        Float, default=0.0, server_default="0.0", nullable=False, index=True
    )
    focus_summary: Mapped[str | None] = mapped_column(Text)
    domain_of_interest: Mapped[list[str]] = mapped_column(
        JsonType, default=list, nullable=False, server_default="[]"
    )

    # Snowglobe reset (rule set 2026-05-25). See migrations/0043_military_scope.sql.
    hidden: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False, index=True
    )
    hidden_reason: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_military_scope: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False, index=True
    )
    military_categories: Mapped[list[str]] = mapped_column(
        JsonType, default=list, server_default="[]", nullable=False
    )
    scope_match_score: Mapped[float] = mapped_column(
        Float, default=0.0, server_default="0.0", nullable=False, index=True
    )
    # Snowglobe Phase 2 (0044): deterministic post-scrape completeness 0..1.
    # Gates trust in scope_match_score — see scope_gate.compute_enrichment_completeness.
    enrichment_completeness: Mapped[float] = mapped_column(
        Float, default=0.0, server_default="0.0", nullable=False, index=True
    )
    contact_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    has_email: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    has_phone: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    has_website: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    catalog_refs: Mapped[list[dict[str, Any]]] = mapped_column(
        JsonType, default=list, server_default="[]", nullable=False
    )
    catalog_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    classified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    first_enriched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now_utc, nullable=False
    )
    last_enriched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now_utc, onupdate=_now_utc, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("domain", name="uq_vendors_domain"),
        Index("ix_vendors_country", "registrar_country"),
        Index("ix_vendors_confidence_desc", "confidence_score"),
        Index("ix_vendors_scope_match_desc", "scope_match_score"),
        Index("ix_vendors_visible_scope", "hidden", "scope_match_score"),
    )


class ExpoORM(Base):
    __tablename__ = "expos"

    expo_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="unknown")
    aggregator_url: Mapped[str | None] = mapped_column(Text)
    official_url: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(500))
    country: Mapped[str | None] = mapped_column(String(120), index=True)
    start_date: Mapped[date | None] = mapped_column(Date, index=True)
    end_date: Mapped[date | None] = mapped_column(Date)
    topics: Mapped[list[str]] = mapped_column(JsonType, default=list)
    discovery_query: Mapped[str | None] = mapped_column(Text)
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now_utc, nullable=False, index=True
    )
    pdf_brochure_urls: Mapped[list[str]] = mapped_column(JsonType, default=list)
    raw_metadata: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vendor_links: Mapped[list[ExpoVendorORM]] = relationship(
        back_populates="expo", cascade="all, delete-orphan"
    )


class ExpoVendorORM(Base):
    __tablename__ = "expo_vendors"

    expo_id: Mapped[str] = mapped_column(
        String(200), ForeignKey("expos.expo_id", ondelete="CASCADE"), primary_key=True
    )
    vendor_domain: Mapped[str] = mapped_column(
        String(253), ForeignKey("vendors.domain", ondelete="CASCADE"), primary_key=True
    )
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now_utc, nullable=False
    )

    expo: Mapped[ExpoORM] = relationship(back_populates="vendor_links")


class PdfORM(Base):
    __tablename__ = "pdfs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    expo_id: Mapped[str | None] = mapped_column(
        String(200), ForeignKey("expos.expo_id", ondelete="SET NULL"), index=True
    )
    sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    vendors_found: Mapped[int] = mapped_column(Integer, default=0)
    downloaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now_utc, nullable=False, index=True
    )
    meta: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)


class RunORM(Base):
    __tablename__ = "runs"

    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mode: Mapped[str] = mapped_column(String(20), default="normal")
    expos_discovered: Mapped[int] = mapped_column(Integer, default=0)
    exhibitors_extracted: Mapped[int] = mapped_column(Integer, default=0)
    vendors_resolved: Mapped[int] = mapped_column(Integer, default=0)
    vendors_enriched: Mapped[int] = mapped_column(Integer, default=0)
    vendors_dedup_skipped: Mapped[int] = mapped_column(Integer, default=0)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    firecrawl_credits_used: Mapped[int] = mapped_column(Integer, default=0)
    openai_tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    exhibitors_resolve_failed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    exhibitors_enrich_failed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    exhibitors_validation_rejected: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    exhibitors_scope_rejected: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class ExhibitorRefORM(Base):
    """Audit table for every ExhibitorRef extracted from PDF or HTML.

    Lifecycle status tracks where each ref ends up: extracted → resolved/resolve_failed,
    then enriched/dedup_skipped/enrich_failed/validation_rejected/scope_rejected.
    Failure category buckets the reason so we can diagnose pipeline drop-off.
    """

    __tablename__ = "exhibitor_refs"

    ref_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    expo_id: Mapped[str | None] = mapped_column(
        String(200),
        ForeignKey("expos.expo_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    raw_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    short_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    booth: Mapped[str | None] = mapped_column(String(60), nullable=True)
    provenance: Mapped[list] = mapped_column(JsonType, nullable=False, default=list)

    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="extracted", server_default="extracted", index=True
    )
    failure_category: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_domain: Mapped[str | None] = mapped_column(String(253), nullable=True, index=True)
    resolve_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("expo_id", "name", "raw_url", name="uq_exhref_expo_name_url"),
        Index("ix_exhref_status_category", "status", "failure_category"),
    )


class ScopeRuleORM(Base):
    """User-editable overlay over the YAML scope/blacklist defaults.

    Effective rule set = rows where enabled=true. YAML defaults are
    auto-imported on startup with source='yaml_default' so the UI can show
    them transparently and let the user toggle them off without losing
    visibility (hard-delete is blocked for yaml_default rows).
    """

    __tablename__ = "scope_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    value: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="user", server_default="user"
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("kind", "value", name="uq_scope_rule_kind_value"),
        Index("ix_scope_rule_kind_enabled", "kind", "enabled"),
    )


class AppPromptORM(Base):
    """Single-row-per-key store for user-editable LLM system prompts."""

    __tablename__ = "app_prompts"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class FusionORM(Base):
    """Labs fusion record. Hasil kombinasi 2 atau lebih vendor jadi produk baru."""

    __tablename__ = "fusions"

    fusion_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    tagline: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    source_vendor_ids: Mapped[list[str]] = mapped_column(JsonType, default=list)
    industries: Mapped[list[str]] = mapped_column(JsonType, default=list)
    tags: Mapped[list[str]] = mapped_column(JsonType, default=list)
    rationale: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft", server_default="draft", index=True
    )
    llm_provider: Mapped[str | None] = mapped_column(String(30))

    drafts: Mapped[list[FusionEmailDraftORM]] = relationship(
        back_populates="fusion", cascade="all, delete-orphan", lazy="selectin"
    )


class FusionEmailDraftORM(Base):
    """Email draft outreach per source vendor di sebuah fusion."""

    __tablename__ = "fusion_email_drafts"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    fusion_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("fusions.fusion_id", ondelete="CASCADE"), index=True
    )
    vendor_id: Mapped[str] = mapped_column(String(36), index=True)
    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    copied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    fusion: Mapped[FusionORM] = relationship(back_populates="drafts")


class VendorEmailDraftORM(Base):
    """Per-vendor outreach email draft, persisted across sessions.

    Stored as one row per (vendor_id, language). Regenerating overwrites
    the row in-place so the operator always sees the latest AI draft;
    manual edits via PUT also overwrite. Soft-delete not required - the
    table is small and drafts have low half-life.
    """

    __tablename__ = "vendor_email_drafts"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    vendor_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    language: Mapped[str] = mapped_column(String(8), default="en", nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str | None] = mapped_column(String(120))
    edited_manually: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class JinaRawStagingORM(Base):
    """S3 Jina raw markdown staging buffer. Fetcher pool drops rows here
    fast (parsed=False); parser pool consumes them out of band.

    Decouples fetch latency from parse latency so a slow Ollama-bound
    parser does not stall fetch throughput. Parser scans
    `(parsed=False, fetched_at ASC)` and uses `FOR UPDATE SKIP LOCKED`
    for safe multi-worker consumption.
    """

    __tablename__ = "jina_raw_staging"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    seed_id: Mapped[str | None] = mapped_column(String(120), index=True)
    source_kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    url: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    vendor_hint: Mapped[str | None] = mapped_column(String(500))
    markdown: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    parsed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False, index=True
    )
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    parse_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    parse_error: Mapped[str | None] = mapped_column(Text)
    vendor_id: Mapped[str | None] = mapped_column(String(36), index=True)

    __table_args__ = (
        Index("ix_jina_staging_unparsed", "parsed", "fetched_at"),
    )
