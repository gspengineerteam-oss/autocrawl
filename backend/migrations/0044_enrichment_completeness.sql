-- 0044_enrichment_completeness.sql
-- Snowglobe Phase 2: persisted enrichment_completeness signal so the displayed
-- "scope %" can be gated on real data instead of keyword presence alone.
-- See plan: .claude/plans/we-have-to-set-stateful-snowglobe.md
--
-- Computed deterministically in backend/src/agentic_crawler/scope_gate.py
-- (compute_enrichment_completeness). Range [0.0, 1.0]. Default 0.0 for the
-- pre-Snowglobe rows; backfill via backend/scripts/backfill_enrichment_completeness.py.
--
-- Schema also declared in backend/src/crawler/db/models.py (VendorORM).
--   psql $DATABASE_URL -f backend/migrations/0044_enrichment_completeness.sql

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS enrichment_completeness DOUBLE PRECISION NOT NULL DEFAULT 0.0;

CREATE INDEX IF NOT EXISTS ix_vendors_enrichment_completeness
    ON vendors (enrichment_completeness DESC NULLS LAST);

-- Effective-scope composite index used by VendorRepo.list_paginated default sort.
-- Expression mirrors the @computed_field on Vendor.effective_scope.
CREATE INDEX IF NOT EXISTS ix_vendors_effective_scope
    ON vendors ((scope_match_score * (0.4 + 0.6 * enrichment_completeness)) DESC NULLS LAST);
