"""Extract schema.org / JSON-LD / OpenGraph / microdata via `extruct`."""

from __future__ import annotations

from typing import Any


def extract_all(html: str, base_url: str) -> dict[str, Any]:
    """Returns {json_ld: [...], microdata: [...], opengraph: [...], rdfa: [...]}.

    Empty lists when nothing found. Never raises.
    """
    if not html:
        return {"json_ld": [], "microdata": [], "opengraph": [], "rdfa": []}
    try:
        import extruct  # type: ignore

        data = extruct.extract(html, base_url=base_url, syntaxes=["json-ld", "microdata", "opengraph", "rdfa"])
    except Exception:  # noqa: BLE001
        return {"json_ld": [], "microdata": [], "opengraph": [], "rdfa": []}
    return {
        "json_ld": data.get("json-ld") or [],
        "microdata": data.get("microdata") or [],
        "opengraph": data.get("opengraph") or [],
        "rdfa": data.get("rdfa") or [],
    }


def find_organization_url(html: str, base_url: str) -> str | None:
    """Find the canonical Organization URL from JSON-LD if present."""
    bundle = extract_all(html, base_url)
    for item in bundle["json_ld"]:
        if isinstance(item, dict):
            t = item.get("@type")
            if isinstance(t, list):
                t_set = {str(x).lower() for x in t}
            else:
                t_set = {str(t).lower()} if t else set()
            if t_set & {"organization", "corporation", "company", "localbusiness"}:
                url = item.get("url") or item.get("sameAs")
                if isinstance(url, list) and url:
                    return str(url[0])
                if isinstance(url, str):
                    return url
    return None


def find_open_graph(html: str, base_url: str) -> dict[str, str]:
    bundle = extract_all(html, base_url)
    flat: dict[str, str] = {}
    for og in bundle["opengraph"]:
        if isinstance(og, dict):
            for k, v in og.items():
                if isinstance(v, str):
                    flat[k] = v
                elif isinstance(v, list) and v and isinstance(v[0], str):
                    flat[k] = v[0]
    return flat
