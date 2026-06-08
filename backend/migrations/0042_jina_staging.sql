-- 0042_jina_staging.sql
-- S3: Collect-first staging buffer for Jina raw markdown.
--
-- Decouples fetcher pool from parser pool so slow Ollama-bound parsing
-- never stalls fetch throughput. Schema is also defined declaratively in
-- backend/src/crawler/db/models.py (JinaRawStagingORM) and auto-created
-- by Base.metadata.create_all on application startup. This file mirrors
-- the schema for manual apply or audit purposes.
--
-- Apply manually (idempotent):
--   psql $DATABASE_URL -f backend/migrations/0042_jina_staging.sql

CREATE TABLE IF NOT EXISTS jina_raw_staging (
    id              BIGSERIAL PRIMARY KEY,
    seed_id         VARCHAR(120),
    source_kind     VARCHAR(40)       NOT NULL,
    url             TEXT              NOT NULL,
    vendor_hint     VARCHAR(500),
    markdown        TEXT              NOT NULL,
    fetched_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    parsed          BOOLEAN           NOT NULL DEFAULT FALSE,
    parsed_at       TIMESTAMPTZ,
    parse_attempts  INTEGER           NOT NULL DEFAULT 0,
    parse_error     TEXT,
    vendor_id       VARCHAR(36)
);

CREATE INDEX IF NOT EXISTS ix_jina_staging_seed_id    ON jina_raw_staging (seed_id);
CREATE INDEX IF NOT EXISTS ix_jina_staging_source     ON jina_raw_staging (source_kind);
CREATE INDEX IF NOT EXISTS ix_jina_staging_url        ON jina_raw_staging (url);
CREATE INDEX IF NOT EXISTS ix_jina_staging_fetched_at ON jina_raw_staging (fetched_at);
CREATE INDEX IF NOT EXISTS ix_jina_staging_parsed     ON jina_raw_staging (parsed);
CREATE INDEX IF NOT EXISTS ix_jina_staging_vendor_id  ON jina_raw_staging (vendor_id);
CREATE INDEX IF NOT EXISTS ix_jina_staging_unparsed   ON jina_raw_staging (parsed, fetched_at);

-- Partial index for hot-path drainage by parser pool:
--   SELECT ... FROM jina_raw_staging
--    WHERE parsed = FALSE ORDER BY fetched_at LIMIT N FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS ix_jina_staging_unparsed_hot
    ON jina_raw_staging (fetched_at)
    WHERE parsed = FALSE;
