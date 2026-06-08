from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from ..config import get_settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        kwargs: dict = {"echo": settings.sqlalchemy_echo, "pool_pre_ping": True}
        if not settings.database_url.startswith("sqlite"):
            kwargs["pool_size"] = 10
            kwargs["max_overflow"] = 20
        _engine = create_async_engine(settings.database_url, **kwargs)
    return _engine


def get_sessionmaker() -> async_sessionmaker:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
            autoflush=False,
        )
    return _sessionmaker


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None


_VENDOR_COLUMN_PATCHES: list[tuple[str, str]] = [
    ("language_code", "VARCHAR(2) NOT NULL DEFAULT 'en'"),
    ("description_original", "TEXT"),
    ("tagline_original", "TEXT"),
    ("products_original", "JSONB DEFAULT '[]'::jsonb"),
    ("industries_original", "JSONB DEFAULT '[]'::jsonb"),
    ("translation_method", "VARCHAR(60)"),
    ("translated_at", "TIMESTAMP WITH TIME ZONE"),
    # Phase 5 — Product catalog + DOI scoring. Additive; legacy `products`
    # column stays as input to product_enricher.
    ("products_detailed", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("overall_scope_score", "DOUBLE PRECISION NOT NULL DEFAULT 0.0"),
    ("focus_summary", "TEXT"),
    ("domain_of_interest", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    # Snowglobe reset 2026-05-25 — military scope + truthful signals.
    # Mirror of backend/migrations/0043_military_scope.sql so
    # `docker compose up -d --build` Just Works without manual psql apply.
    ("hidden", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("hidden_reason", "VARCHAR(80)"),
    ("is_military_scope", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("military_categories", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("scope_match_score", "DOUBLE PRECISION NOT NULL DEFAULT 0.0"),
    ("contact_count", "INTEGER NOT NULL DEFAULT 0"),
    ("has_email", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("has_phone", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("has_website", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("catalog_refs", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("catalog_count", "INTEGER NOT NULL DEFAULT 0"),
    ("classified_at", "TIMESTAMP WITH TIME ZONE"),
]


# Snowglobe reset 2026-05-25 — supporting indexes + has_website backfill that
# don't fit the (column, ddl) shape above. Idempotent (IF NOT EXISTS / WHERE
# guards) so they re-run safely on every container boot.
_SNOWGLOBE_AUX_DDL: list[str] = [
    "CREATE INDEX IF NOT EXISTS ix_vendors_hidden               ON vendors (hidden)",
    "CREATE INDEX IF NOT EXISTS ix_vendors_is_military_scope    ON vendors (is_military_scope)",
    "CREATE INDEX IF NOT EXISTS ix_vendors_scope_match_desc     ON vendors (scope_match_score DESC NULLS LAST)",
    "CREATE INDEX IF NOT EXISTS ix_vendors_visible_scope        ON vendors (hidden, scope_match_score DESC)",
    # One-shot backfill — only flips rows whose canonical_url is real and
    # flag still false. After the classifier runs, has_website is set on
    # every fresh enrich anyway.
    "UPDATE vendors SET has_website = TRUE "
    "WHERE has_website = FALSE "
    "  AND canonical_url IS NOT NULL "
    "  AND length(trim(canonical_url)) > 0",
]

_RUN_COLUMN_PATCHES: list[tuple[str, str]] = [
    ("exhibitors_resolve_failed", "INTEGER NOT NULL DEFAULT 0"),
    ("exhibitors_enrich_failed", "INTEGER NOT NULL DEFAULT 0"),
    ("exhibitors_validation_rejected", "INTEGER NOT NULL DEFAULT 0"),
    ("exhibitors_scope_rejected", "INTEGER NOT NULL DEFAULT 0"),
]


# asyncpg's prepared-statement protocol rejects multi-statement strings, so we
# keep the DO-block and the trailing DDLs as separate statements that the
# driver can dispatch one at a time. The DO block is still self-contained.

_VENDORS_PK_MIGRATION_DO = """
DO $$
DECLARE
    has_pk_on_domain boolean;
    has_vendor_id    boolean;
BEGIN
    -- pgcrypto powers gen_random_uuid()
    PERFORM 1 FROM pg_extension WHERE extname='pgcrypto';
    IF NOT FOUND THEN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
    END IF;

    -- 1. Add vendor_id if missing, populate, NOT NULL
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='vendors' AND column_name='vendor_id'
    ) INTO has_vendor_id;
    IF NOT has_vendor_id THEN
        ALTER TABLE vendors ADD COLUMN vendor_id VARCHAR(36);
        UPDATE vendors SET vendor_id = gen_random_uuid()::text WHERE vendor_id IS NULL;
        ALTER TABLE vendors ALTER COLUMN vendor_id SET NOT NULL;
    END IF;

    -- 2. Swap PK from domain to vendor_id (only if domain is still PK)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.key_column_usage
        WHERE table_name='vendors' AND constraint_name='vendors_pkey' AND column_name='domain'
    ) INTO has_pk_on_domain;
    IF has_pk_on_domain THEN
        BEGIN
            EXECUTE 'ALTER TABLE expo_vendors DROP CONSTRAINT IF EXISTS expo_vendors_vendor_domain_fkey';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        ALTER TABLE vendors DROP CONSTRAINT vendors_pkey;
        ALTER TABLE vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (vendor_id);
        ALTER TABLE vendors ALTER COLUMN domain DROP NOT NULL;
        ALTER TABLE vendors ALTER COLUMN canonical_url DROP NOT NULL;
        BEGIN
            EXECUTE 'ALTER TABLE vendors ADD CONSTRAINT uq_vendors_domain UNIQUE (domain)';
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
        BEGIN
            EXECUTE 'ALTER TABLE expo_vendors ADD CONSTRAINT expo_vendors_vendor_domain_fkey '
                    'FOREIGN KEY (vendor_domain) REFERENCES vendors(domain) ON DELETE CASCADE';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;
"""

_VENDORS_PK_MIGRATION_TRAILING: list[str] = [
    "ALTER TABLE vendors ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'enriched'",
    "CREATE INDEX IF NOT EXISTS ix_vendors_status ON vendors(status)",
    "CREATE INDEX IF NOT EXISTS ix_vendors_domain ON vendors(domain)",
]


async def init_db() -> None:
    from .base import Base
    from . import models  # noqa: F401

    engine = get_engine()
    is_postgres = engine.url.get_backend_name().startswith("postgres")

    # Stage 4 PK swap runs in its own transaction so a failure here cannot
    # poison the create_all transaction below. Idempotent (checks before mutating).
    # DO block + trailing DDL must be dispatched as separate statements because
    # asyncpg's prepared-statement protocol rejects multi-statement strings.
    if is_postgres:
        try:
            async with engine.begin() as mig_conn:
                await mig_conn.execute(text(_VENDORS_PK_MIGRATION_DO))
                for ddl in _VENDORS_PK_MIGRATION_TRAILING:
                    await mig_conn.execute(text(ddl))
        except Exception as exc:
            # Fresh DB without vendors table → migration block hits NotFound;
            # create_all below builds the new schema directly. Other errors
            # are recoverable on next startup once data is consistent.
            from ..observability.logger import get_logger as _gl
            _gl(__name__).warning("init_db.pk_migration_skipped", error=str(exc)[:300])

    # create_all in its own transaction.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if is_postgres:
        async with engine.begin() as patch_conn:
            for column, ddl in _VENDOR_COLUMN_PATCHES:
                await patch_conn.execute(
                    text(f"ALTER TABLE vendors ADD COLUMN IF NOT EXISTS {column} {ddl}")
                )
            for column, ddl in _RUN_COLUMN_PATCHES:
                await patch_conn.execute(
                    text(f"ALTER TABLE runs ADD COLUMN IF NOT EXISTS {column} {ddl}")
                )
            # Snowglobe aux DDL — indexes + has_website backfill. Best-effort:
            # logged-then-swallowed so a transient error (e.g., concurrent
            # CREATE INDEX) doesn't kill the boot path.
            for stmt in _SNOWGLOBE_AUX_DDL:
                try:
                    await patch_conn.execute(text(stmt))
                except Exception as exc:  # noqa: BLE001
                    from ..observability.logger import get_logger as _gl
                    _gl(__name__).warning(
                        "init_db.snowglobe_aux_skipped",
                        stmt=stmt[:80],
                        error=str(exc)[:200],
                    )

    # Seed scope_rules with YAML defaults (idempotent — skips existing rows).
    try:
        from .scope_seed import seed_yaml_defaults

        await seed_yaml_defaults()
    except Exception as exc:
        from ..observability.logger import get_logger as _gl
        _gl(__name__).warning("init_db.scope_seed_failed", error=str(exc)[:300])
