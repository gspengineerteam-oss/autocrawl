from __future__ import annotations

import re
from dataclasses import dataclass, field

EMAIL_RE = re.compile(
    r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
)

PHONE_PATTERNS = [
    re.compile(r"\+62[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,5}"),
    re.compile(r"\b0\d{2,3}[\s\-]?\d{3,4}[\s\-]?\d{3,5}\b"),
    re.compile(r"\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{2,4}[\s\-]?\d{2,4}(?:[\s\-]?\d{1,4})?"),
    re.compile(r"\b\d{3,4}[\s\-]\d{3,4}[\s\-]\d{3,5}\b"),
]

_BAD_PHONE_PREFIXES = ("00000", "11111", "12345", "99999")
_HTML_TAG = re.compile(r"<[^>]+>")
_OBFUSCATION = [
    (re.compile(r"\s*\[at\]\s*", re.IGNORECASE), "@"),
    (re.compile(r"\s*\(at\)\s*", re.IGNORECASE), "@"),
    (re.compile(r"\s+at\s+", re.IGNORECASE), "@"),
    (re.compile(r"\s*\[dot\]\s*", re.IGNORECASE), "."),
    (re.compile(r"\s*\(dot\)\s*", re.IGNORECASE), "."),
]


@dataclass(frozen=True)
class ContactExtractResult:
    emails: tuple[str, ...] = field(default_factory=tuple)
    phones: tuple[str, ...] = field(default_factory=tuple)

    @property
    def has_email(self) -> bool:
        return bool(self.emails)

    @property
    def has_phone(self) -> bool:
        return bool(self.phones)

    @property
    def contact_count(self) -> int:
        return len(self.emails) + len(self.phones)

    def to_dict(self) -> dict:
        return {
            "emails": list(self.emails),
            "phones": list(self.phones),
            "has_email": self.has_email,
            "has_phone": self.has_phone,
            "contact_count": self.contact_count,
        }


def _strip_html(text: str) -> str:
    return _HTML_TAG.sub(" ", text or "")


def _deobfuscate(text: str) -> str:
    out = text
    for pattern, repl in _OBFUSCATION:
        out = pattern.sub(repl, out)
    return out


def _norm_phone(raw: str) -> str:
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    return digits


def _is_plausible_phone(p: str) -> bool:
    digits = re.sub(r"\D", "", p)
    if len(digits) < 8 or len(digits) > 16:
        return False
    if any(digits.startswith(bad) for bad in _BAD_PHONE_PREFIXES):
        return False
    if len(set(digits)) < 3:
        return False
    return True


def extract(text: str) -> ContactExtractResult:
    if not text:
        return ContactExtractResult()
    cleaned = _deobfuscate(_strip_html(text))

    emails: list[str] = []
    seen_emails: set[str] = set()
    for match in EMAIL_RE.finditer(cleaned):
        email = match.group(0).strip().lower()
        if email not in seen_emails and "@" in email:
            seen_emails.add(email)
            emails.append(email)

    phones: list[str] = []
    seen_phones: set[str] = set()
    for pattern in PHONE_PATTERNS:
        for match in pattern.finditer(cleaned):
            raw = match.group(0)
            norm = _norm_phone(raw)
            if not _is_plausible_phone(norm):
                continue
            if norm in seen_phones:
                continue
            seen_phones.add(norm)
            phones.append(norm)

    return ContactExtractResult(emails=tuple(emails), phones=tuple(phones))
