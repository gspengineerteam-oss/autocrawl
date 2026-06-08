from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ..config import get_settings
from ..db.engine import dispose_engine, init_db
from ..observability.logger import configure_logging, get_logger
from .routes import (
    config_scope,
    exhibitor_refs,
    expos,
    health,
    labs,
    orchestrator,
    overview,
    pdfs,
    runs,
    settings as settings_routes,
    system,
    vendors,
)

_log = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    configure_logging()

    # Tail the Redis stream populated by agentic_crawler containers
    # (agentic-a, agentic-b) — captures browser_use.Agent reasoning
    # logs from those separate processes and mirrors them locally for
    # the frontend Live Monitor → Agent Trace panel.
    try:
        from ..tools.agent_trace_buffer import install as install_agent_trace
        install_agent_trace()
    except Exception as e:  # noqa: BLE001
        _log.warning("api.agent_trace_install_failed", error=str(e))

    settings = get_settings()
    if settings.persist_to_db:
        last_err: str | None = None
        for attempt in range(1, 11):
            try:
                await init_db()
                _log.info("api.db_init_ok", attempt=attempt)
                last_err = None
                break
            except Exception as e:
                last_err = str(e)
                _log.warning("api.db_init_retry", attempt=attempt, error=last_err)
                await asyncio.sleep(min(2 ** attempt, 15))
        if last_err is not None:
            _log.error("api.db_init_failed_giving_up", error=last_err)
    else:
        _log.info("api.db_init_skipped", reason="persist_to_db=false; JSON-only mode")

    # Boot the scope-cache realtime poller (cross-process invalidation).
    try:
        from ..tools.scope_cache import ensure_background_task, refresh_now

        await refresh_now()
        ensure_background_task()
    except Exception as e:  # noqa: BLE001
        _log.warning("api.scope_cache_boot_failed", error=str(e))

    yield

    try:
        from ..tools.agent_trace_buffer import shutdown as shutdown_agent_trace
        shutdown_agent_trace()
    except Exception as e:  # noqa: BLE001
        _log.warning("api.agent_trace_shutdown_failed", error=str(e))

    try:
        from ..tools.scope_cache import stop_background_task

        await stop_background_task()
    except Exception as e:  # noqa: BLE001
        _log.warning("api.scope_cache_stop_failed", error=str(e))
    try:
        from ..tools.crawl4ai_client import c4ai_close

        await c4ai_close()
    except Exception as e:  # noqa: BLE001
        _log.warning("api.crawl4ai_close_failed", error=str(e))
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="AutoCrawl API",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    application.include_router(health.router, prefix="/api")
    application.include_router(settings_routes.router, prefix="/api")
    application.include_router(overview.router, prefix="/api")
    application.include_router(vendors.router, prefix="/api")
    application.include_router(expos.router, prefix="/api")
    application.include_router(pdfs.router, prefix="/api")
    application.include_router(runs.router, prefix="/api")
    application.include_router(orchestrator.router, prefix="/api")
    application.include_router(exhibitor_refs.router, prefix="/api")
    application.include_router(config_scope.router, prefix="/api")
    application.include_router(labs.router, prefix="/api")
    application.include_router(system.router, prefix="/api")

    fusions_dir = settings.data_dir / "fusions"
    fusions_dir.mkdir(parents=True, exist_ok=True)
    application.mount(
        "/static/fusions",
        StaticFiles(directory=str(fusions_dir)),
        name="fusion_static",
    )

    return application


app = create_app()
