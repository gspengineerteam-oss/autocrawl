"""Extract a vendor's logo URL from their site.

Tries in priority order:
  1. schema.org Organization.logo
  2. Open Graph image
  3. Twitter Card image
  4. <link rel="apple-touch-icon"> (high-res)
  5. <link rel="icon"> (favicon, last resort)
"""

from __future__ import annotations

from urllib.parse import urljoin

from selectolax.parser import HTMLParser


def extract_logo(html: str, base_url: str, schema_org: list[dict] | None = None) -> str | None:
    if not html:
        return None

    if schema_org:
        for it in schema_org:
            if not isinstance(it, dict):
                continue
            t = it.get("@type")
            t_norm = (t if isinstance(t, list) else [t]) if t else []
            if any(str(x).lower() in {"organization", "corporation", "company", "localbusiness"} for x in t_norm):
                logo = it.get("logo")
                if isinstance(logo, dict):
                    url = logo.get("url") or logo.get("contentUrl")
                    if url:
                        return _abs(url, base_url)
                if isinstance(logo, str):
                    return _abs(logo, base_url)

    tree = HTMLParser(html)

    og_img = tree.css_first("meta[property='og:image'], meta[name='og:image']")
    if og_img:
        url = og_img.attributes.get("content")
        if url:
            return _abs(url, base_url)

    tw_img = tree.css_first("meta[name='twitter:image'], meta[name='twitter:image:src']")
    if tw_img:
        url = tw_img.attributes.get("content")
        if url:
            return _abs(url, base_url)

    apple_icon = tree.css_first("link[rel*='apple-touch-icon']")
    if apple_icon:
        url = apple_icon.attributes.get("href")
        if url:
            return _abs(url, base_url)

    icon = tree.css_first("link[rel='icon'], link[rel='shortcut icon']")
    if icon:
        url = icon.attributes.get("href")
        if url:
            return _abs(url, base_url)

    return None


def _abs(url: str, base_url: str) -> str:
    if url.startswith(("http://", "https://", "//")):
        if url.startswith("//"):
            return "https:" + url
        return url
    return urljoin(base_url, url)
