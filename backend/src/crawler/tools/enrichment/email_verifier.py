from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from ...observability.logger import get_logger

_log = get_logger(__name__)

_SYNTAX_RX = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
_ROLE_LOCAL_PARTS = frozenset({
    "info", "sales", "admin", "support", "contact", "hello", "hi",
    "office", "marketing", "press", "media", "pr", "legal", "hr",
    "billing", "accounts", "accounting", "finance", "noreply",
    "no-reply", "donotreply", "do-not-reply", "team", "service",
    "services", "help", "feedback", "enquiries", "inquiry", "inquiries",
    "general", "mail", "email", "webmaster", "postmaster", "root",
})


@dataclass
class EmailVerification:
    email: str
    valid_syntax: bool = False
    mx_present: bool | None = None
    disposable: bool = False
    role_based: bool = False
    domain_matches_vendor: bool = False
    score: float = 0.0
    signals: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "email": self.email,
            "valid_syntax": self.valid_syntax,
            "mx_present": self.mx_present,
            "disposable": self.disposable,
            "role_based": self.role_based,
            "domain_matches_vendor": self.domain_matches_vendor,
            "score": self.score,
            "signals": self.signals,
        }


@lru_cache(maxsize=1)
def _disposable_set() -> frozenset[str]:
    path = Path(__file__).parent / "_disposable_domains.txt"
    if not path.exists():
        return frozenset()
    lines = path.read_text(encoding="utf-8").splitlines()
    return frozenset(line.strip().lower() for line in lines if line.strip() and not line.startswith("#"))


def _local_and_domain(email: str) -> tuple[str, str]:
    if "@" not in email:
        return email, ""
    local, _, domain = email.rpartition("@")
    return local.strip(), domain.strip().lower()


def _domain_similarity(a: str, b: str) -> bool:
    if not a or not b:
        return False
    a, b = a.lower(), b.lower()
    if a == b:
        return True
    a_root = a.split(".")[0]
    b_root = b.split(".")[0]
    if a_root == b_root and len(a_root) >= 4:
        return True
    return False


async def verify_email(
    email: str,
    *,
    vendor_domain: str | None = None,
    mx_records: list[str] | None = None,
) -> EmailVerification:
    email = (email or "").strip().lower()
    result = EmailVerification(email=email)

    result.valid_syntax = bool(_SYNTAX_RX.match(email))
    if not result.valid_syntax:
        result.signals["reason"] = "invalid_syntax"
        return result

    local, domain = _local_and_domain(email)
    result.signals["local"] = local
    result.signals["domain"] = domain

    result.disposable = domain in _disposable_set()
    result.role_based = local.lower() in _ROLE_LOCAL_PARTS

    if vendor_domain:
        result.domain_matches_vendor = _domain_similarity(domain, vendor_domain)

    if mx_records is not None:
        result.mx_present = len(mx_records) > 0
    else:
        result.mx_present = await _check_mx(domain)

    score = 0.0
    if result.valid_syntax:
        score += 0.30
    if result.mx_present:
        score += 0.30
    if not result.disposable:
        score += 0.15
    if result.domain_matches_vendor:
        score += 0.20
    elif vendor_domain:
        score -= 0.05
    if result.role_based:
        score -= 0.05
    result.score = max(0.0, min(1.0, round(score, 3)))
    return result


async def _check_mx(domain: str) -> bool:
    if not domain:
        return False

    def _resolve() -> bool:
        try:
            import dns.resolver
        except ImportError:
            return False
        try:
            resolver = dns.resolver.Resolver()
            resolver.lifetime = 4.0
            answer = resolver.resolve(domain, "MX")
            return len(list(answer)) > 0
        except Exception:
            return False

    try:
        return await asyncio.to_thread(_resolve)
    except Exception:
        return False


async def verify_many(
    emails: list[str],
    *,
    vendor_domain: str | None = None,
    mx_records: list[str] | None = None,
    concurrency: int = 8,
) -> list[EmailVerification]:
    sem = asyncio.Semaphore(concurrency)

    async def _one(e: str) -> EmailVerification:
        async with sem:
            return await verify_email(e, vendor_domain=vendor_domain, mx_records=mx_records)

    return await asyncio.gather(*(_one(e) for e in emails))
