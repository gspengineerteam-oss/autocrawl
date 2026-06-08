"""Composite SVG renderer buat fusion image. Server-side, free, deterministic.

Tujuan: dari list source vendor (nama plus logo URL) plus produk baru (nama,
tagline), generate satu SVG yang dipake jadi cover image fusion. Pure Python
templating, ga butuh Cairo/Pillow.
"""

from __future__ import annotations

import asyncio
import base64
import re
from pathlib import Path

import httpx

from ...config import get_settings
from ...observability.logger import get_logger

_log = get_logger(__name__)

_SVG_TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0b0d"/>
      <stop offset="100%" stop-color="#1a1a1f"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#bg)"/>
  <text x="40" y="60" font-family="IBM Plex Mono, monospace" font-size="14" fill="#FFB800" letter-spacing="2">LABS // EXPERIMENTAL</text>
  <text x="40" y="220" font-family="IBM Plex Mono, monospace" font-size="42" fill="#f4f4f6" font-weight="700">{name}</text>
  <text x="40" y="260" font-family="IBM Plex Mono, monospace" font-size="16" fill="#a1a1aa">{tagline}</text>
  {logos}
  <text x="40" y="430" font-family="IBM Plex Mono, monospace" font-size="11" fill="#52525b">FUSION OF: {sources}</text>
</svg>"""


_CT_ALLOWED = ("image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif")


async def _fetch_logo_b64(url: str | None, timeout: float = 5.0) -> str | None:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return None
            ct = r.headers.get("content-type", "image/png").split(";")[0].strip()
            if ct not in _CT_ALLOWED:
                return None
            return f"data:{ct};base64,{base64.b64encode(r.content).decode()}"
    except Exception:  # noqa: BLE001
        return None


def _sanitize(s: str, max_len: int) -> str:
    cleaned = re.sub(r"[<>&\"']", "", s or "")
    return cleaned[:max_len]


def _placeholder_block(x: int, y: int, label: str) -> str:
    initial = (label[:1] or "?").upper()
    safe_initial = _sanitize(initial, 1)
    return (
        f'<g transform="translate({x},{y})">'
        f'<rect width="80" height="80" fill="#27272a" stroke="#3f3f46"/>'
        f'<text x="40" y="52" font-family="IBM Plex Mono, monospace" font-size="36" '
        f'fill="#FFB800" text-anchor="middle">{safe_initial}</text>'
        f"</g>"
    )


def _logo_block(x: int, y: int, b64: str) -> str:
    return (
        f'<g transform="translate({x},{y})">'
        f'<rect width="80" height="80" fill="#0f0f12" stroke="#3f3f46"/>'
        f'<image href="{b64}" x="8" y="8" width="64" height="64" preserveAspectRatio="xMidYMid meet"/>'
        f"</g>"
    )


async def render_composite(
    fusion_id: str,
    *,
    name: str,
    tagline: str,
    source_logos: list[tuple[str, str | None]],
) -> Path:
    """Render fusion composite SVG.

    source_logos: list of (vendor_name, logo_url_or_none).
    Returns Path to written SVG. Idempotent (skip kalo file udah ada).
    """
    settings = get_settings()
    out_dir = settings.data_dir / "fusions"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{fusion_id}.svg"
    if out.exists():
        return out

    base_x = 500
    base_y = 100
    fetched = await asyncio.gather(
        *(_fetch_logo_b64(u) for _, u in source_logos[:4])
    )
    logos_xml: list[str] = []
    for i, ((vname, _), b64) in enumerate(zip(source_logos[:4], fetched[:4])):
        x = base_x + (i % 2) * 100
        y = base_y + (i // 2) * 100
        logos_xml.append(_logo_block(x, y, b64) if b64 else _placeholder_block(x, y, vname))

    sources_text = " + ".join(_sanitize(n, 40) for n, _ in source_logos[:4])
    safe_name = _sanitize(name, 60)
    safe_tagline = _sanitize(tagline or "", 80)
    safe_sources = _sanitize(sources_text, 120)

    svg = _SVG_TEMPLATE.format(
        name=safe_name,
        tagline=safe_tagline,
        sources=safe_sources,
        logos="\n  ".join(logos_xml),
    )

    out.write_text(svg, encoding="utf-8")
    _log.info("fusion.svg_rendered", fusion_id=fusion_id, path=str(out))
    return out
