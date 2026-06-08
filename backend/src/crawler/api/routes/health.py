from __future__ import annotations

import asyncio
import shutil
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...observability.logger import get_logger
from ..deps import get_db

router = APIRouter(tags=["meta"])
_STARTUP_TS = time.time()
_log = get_logger(__name__)
_log.debug("health.module_loaded")


async def _check_db(session: AsyncSession) -> dict[str, Any]:
    try:
        await asyncio.wait_for(session.execute(text("SELECT 1")), timeout=3.0)
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "down", "error": str(exc)[:200]}


async def _check_redis() -> dict[str, Any]:
    settings = get_settings()
    try:
        from redis.asyncio import from_url

        client = from_url(settings.redis_url, decode_responses=True)
        try:
            pong = await asyncio.wait_for(client.ping(), timeout=2.0)
            return {"status": "ok" if pong else "down"}
        finally:
            await client.aclose()
    except Exception as exc:  # noqa: BLE001
        return {"status": "down", "error": str(exc)[:200]}


async def _check_chroma() -> dict[str, Any]:
    settings = get_settings()
    url = f"http://{settings.chroma_host}:{settings.chroma_port}/api/v1/heartbeat"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(url)
            if resp.status_code in (200, 204):
                return {"status": "ok"}
            return {"status": "down", "error": f"HTTP {resp.status_code}"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "down", "error": str(exc)[:200]}


async def _check_llm() -> dict[str, Any]:
    settings = get_settings()
    if settings.llm_provider == "ollama":
        base = settings.llm_base_url or "http://host.docker.internal:11434"
        url = f"{base.rstrip('/')}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(url)
                return {
                    "status": "ok" if resp.status_code == 200 else "down",
                    "provider": "ollama",
                }
        except Exception as exc:  # noqa: BLE001
            return {"status": "down", "provider": "ollama", "error": str(exc)[:200]}
    return {
        "status": "ok" if settings.openai_api_key else "down",
        "provider": "openai",
        "model_heavy": settings.openai_model_heavy,
        "model_light": settings.openai_model_light,
    }


def _check_disk() -> dict[str, Any]:
    settings = get_settings()
    try:
        usage = shutil.disk_usage(str(settings.data_dir))
        free_pct = round(100.0 * usage.free / usage.total, 2)
        status = "ok"
        if free_pct < 5:
            status = "down"
        elif free_pct < 15:
            status = "degraded"
        return {
            "status": status,
            "free_pct": free_pct,
            "free_gb": round(usage.free / 1024**3, 2),
            "total_gb": round(usage.total / 1024**3, 2),
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "down", "error": str(exc)[:200]}


@router.get("/health")
async def health(session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    uptime = int(time.time() - _STARTUP_TS)

    db_task = asyncio.create_task(_check_db(session))
    redis_task = asyncio.create_task(_check_redis())
    chroma_task = asyncio.create_task(_check_chroma())
    llm_task = asyncio.create_task(_check_llm())

    db_res, redis_res, chroma_res, llm_res = await asyncio.gather(
        db_task, redis_task, chroma_task, llm_task
    )
    disk_res = _check_disk()

    components = {
        "db": db_res,
        "redis": redis_res,
        "chroma": chroma_res,
        "llm": llm_res,
        "disk": disk_res,
    }
    statuses = [c.get("status") for c in components.values()]
    if all(s == "ok" for s in statuses):
        overall = "ok"
    elif any(s == "down" for s in statuses):
        overall = "degraded"
    else:
        overall = "degraded"

    return {
        "status": overall,
        "db": db_res.get("status"),
        "version": "0.2.0",
        "uptime_seconds": uptime,
        "components": components,
    }
