"""Extract emails / phones / social handles from raw text or HTML."""

from __future__ import annotations

import re

_EMAIL_RX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RX = re.compile(r"\+?\d[\d\s\-()]{6,}\d")
_LINKEDIN_RX = re.compile(r"https?://(?:[a-z]+\.)?linkedin\.com/(?:company|in|school)/[A-Za-z0-9_\-./%]+", re.IGNORECASE)
_TWITTER_RX = re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/[A-Za-z0-9_]+", re.IGNORECASE)
_FACEBOOK_RX = re.compile(r"https?://(?:www\.|m\.)?facebook\.com/[A-Za-z0-9_.\-]+", re.IGNORECASE)
_YOUTUBE_RX = re.compile(r"https?://(?:www\.)?youtube\.com/(?:c|channel|user|@)/?[A-Za-z0-9_\-]+", re.IGNORECASE)
_INSTAGRAM_RX = re.compile(r"https?://(?:www\.)?instagram\.com/[A-Za-z0-9_.\-]+", re.IGNORECASE)
_GITHUB_RX = re.compile(r"https?://(?:www\.)?github\.com/[A-Za-z0-9_.\-]+", re.IGNORECASE)


_EMAIL_BLACKLIST_PARTS = (
    "wixpress.com",
    "sentry.io",
    "example.com",
    "yourdomain",
    "domain.com",
    "email@",
)


def harvest_emails(text: str) -> list[str]:
    if not text:
        return []
    emails = {m.group(0).lower() for m in _EMAIL_RX.finditer(text)}
    cleaned = sorted(
        {e for e in emails if not any(b in e for b in _EMAIL_BLACKLIST_PARTS) and 5 <= len(e) <= 80}
    )
    return cleaned


def harvest_phones(text: str) -> list[str]:
    if not text:
        return []
    out: set[str] = set()
    for m in _PHONE_RX.finditer(text):
        s = re.sub(r"\s+", " ", m.group(0).strip())
        digits = re.sub(r"\D", "", s)
        if 7 <= len(digits) <= 15:
            out.add(s)
    return sorted(out)


def harvest_socials(text: str) -> dict[str, list[str]]:
    if not text:
        return {}
    return {
        "linkedin": sorted({m.group(0) for m in _LINKEDIN_RX.finditer(text)}),
        "twitter": sorted({m.group(0) for m in _TWITTER_RX.finditer(text)}),
        "facebook": sorted({m.group(0) for m in _FACEBOOK_RX.finditer(text)}),
        "youtube": sorted({m.group(0) for m in _YOUTUBE_RX.finditer(text)}),
        "instagram": sorted({m.group(0) for m in _INSTAGRAM_RX.finditer(text)}),
        "github": sorted({m.group(0) for m in _GITHUB_RX.finditer(text)}),
    }
