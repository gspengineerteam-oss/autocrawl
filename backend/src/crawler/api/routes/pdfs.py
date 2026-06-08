from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.repositories import pdf_repo
from ..deps import get_db

router = APIRouter(prefix="/pdfs", tags=["pdfs"])


@router.get("")
async def list_pdfs(
    expo_id: str | None = Query(None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    items = await pdf_repo.list_for_expo(session, expo_id=expo_id)
    payload = [pdf_repo.orm_to_dict(p) for p in items]
    return {"items": payload, "total": len(payload), "limit": len(payload), "offset": 0}
