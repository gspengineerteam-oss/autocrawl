"""Lightweight tech stack fingerprinting from HTML and headers.

Detects common frameworks, analytics, e-commerce platforms, and CMS systems
from telltale meta tags, script paths, and HTTP headers. No external API
required, runs offline.
"""

from __future__ import annotations

import re

# Regex patterns mapped to a stack tag. Tested against HTML body + headers
# concatenated as one string.
_FINGERPRINTS: list[tuple[str, re.Pattern]] = [
    ("wordpress", re.compile(r"/wp-(content|includes|json)|wordpress", re.I)),
    ("drupal", re.compile(r"sites/all/(modules|themes)|drupal\.js|Drupal\.behaviors", re.I)),
    ("joomla", re.compile(r"/components/com_|joomla", re.I)),
    ("shopify", re.compile(r"cdn\.shopify\.com|shopify\.com/s/files", re.I)),
    ("squarespace", re.compile(r"squarespace\.com|static1\.squarespace", re.I)),
    ("wix", re.compile(r"wixstatic\.com|wix\.com/_partials", re.I)),
    ("webflow", re.compile(r"assets\.website-files\.com|webflow\.js", re.I)),
    ("react", re.compile(r"__REACT_DEVTOOLS|react(-dom)?\.production", re.I)),
    ("vue", re.compile(r"__VUE_DEVTOOLS|vue(\.runtime)?\.min\.js|vue@[0-9]", re.I)),
    ("angular", re.compile(r"ng-version|angular\.min\.js|@angular/", re.I)),
    ("nextjs", re.compile(r"_next/static|__NEXT_DATA__", re.I)),
    ("nuxtjs", re.compile(r"_nuxt/|window\.__NUXT__", re.I)),
    ("svelte", re.compile(r"svelte-[a-z0-9]{6}|window\.__SVELTE__", re.I)),
    ("gatsby", re.compile(r"___gatsby|gatsby-(image|link)", re.I)),
    ("hubspot", re.compile(r"js\.hs-scripts\.com|hubspot", re.I)),
    ("salesforce", re.compile(r"salesforce\.com|force\.com|/apex/", re.I)),
    ("google_analytics", re.compile(r"google-analytics\.com/analytics\.js|gtag/js", re.I)),
    ("google_tag_manager", re.compile(r"googletagmanager\.com/gtm\.js", re.I)),
    ("facebook_pixel", re.compile(r"connect\.facebook\.net.*fbevents\.js", re.I)),
    ("hotjar", re.compile(r"static\.hotjar\.com", re.I)),
    ("intercom", re.compile(r"widget\.intercom\.io", re.I)),
    ("zendesk", re.compile(r"zopim\.com|zendesk\.com", re.I)),
    ("cloudflare", re.compile(r"cloudflare", re.I)),
    ("aws", re.compile(r"\.amazonaws\.com|aws-amplify", re.I)),
    ("azure", re.compile(r"\.azurewebsites\.net|\.azureedge\.net", re.I)),
    ("nginx_header", re.compile(r"server.*nginx", re.I)),
    ("apache_header", re.compile(r"server.*apache", re.I)),
    ("cloudflare_header", re.compile(r"cf-ray:|cf-cache-status:", re.I)),
    ("varnish_header", re.compile(r"x-varnish|via.*varnish", re.I)),
    ("php", re.compile(r"x-powered-by.*php|\.php(\?|$|\")", re.I)),
    ("aspnet", re.compile(r"x-powered-by.*asp\.net|x-aspnet-version", re.I)),
    ("nodejs", re.compile(r"x-powered-by.*express|x-powered-by.*next", re.I)),
    ("laravel", re.compile(r"laravel_session|x-laravel-version", re.I)),
    ("django", re.compile(r"csrfmiddlewaretoken|django", re.I)),
    ("rails", re.compile(r"x-runtime|csrf-token.*rails", re.I)),
    ("magento", re.compile(r"magento|/skin/frontend/|mage/cookies", re.I)),
    ("woocommerce", re.compile(r"woocommerce|/wp-content/plugins/woocommerce", re.I)),
    ("stripe", re.compile(r"js\.stripe\.com|api\.stripe\.com", re.I)),
    ("paypal", re.compile(r"paypal\.com/sdk|paypalobjects", re.I)),
]


def detect(html: str, headers: dict | None = None) -> list[str]:
    if not html and not headers:
        return []
    body = (html or "")[:200000]
    headers_str = ""
    if headers:
        headers_str = "\n".join(f"{k.lower()}: {v}" for k, v in headers.items())
    blob = body + "\n" + headers_str

    found: list[str] = []
    for tag, rx in _FINGERPRINTS:
        if rx.search(blob):
            found.append(tag)

    seen: set[str] = set()
    out: list[str] = []
    for t in found:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out
