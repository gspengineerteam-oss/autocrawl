-- 0043_military_scope.sql
-- Snowglobe reset: add military-scope + hidden + truthful-contact + catalog columns
-- on the vendors table. Drops nothing — old `confidence_score` and `source_trail`
-- stay in place for safety but stop being written by the new code path.
--
-- Schema is also declared in backend/src/crawler/db/models.py (VendorORM) and
-- auto-created by Base.metadata.create_all on startup. This file mirrors it for
-- manual apply / audit:
--   psql $DATABASE_URL -f backend/migrations/0043_military_scope.sql

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS hidden               BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_reason        VARCHAR(80),
    ADD COLUMN IF NOT EXISTS is_military_scope    BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS military_categories  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS scope_match_score    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS contact_count        INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS has_email            BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_phone            BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_website          BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS catalog_refs         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS catalog_count        INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS classified_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_vendors_hidden               ON vendors (hidden);
CREATE INDEX IF NOT EXISTS ix_vendors_is_military_scope    ON vendors (is_military_scope);
CREATE INDEX IF NOT EXISTS ix_vendors_scope_match_desc     ON vendors (scope_match_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_vendors_visible_scope        ON vendors (hidden, scope_match_score DESC);

-- Backfill has_website from existing canonical_url so the new flag is
-- consistent with old data before the classifier ever runs.
UPDATE vendors
   SET has_website = TRUE
 WHERE canonical_url IS NOT NULL
   AND length(trim(canonical_url)) > 0
   AND has_website = FALSE;
