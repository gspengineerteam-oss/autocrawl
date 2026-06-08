"""Browser-Use Agent factory for the enrichment pool.

Given an `EnrichTask` (vendor name + optional hints), build and run an
Agent whose job is to:

  1. Call `search_vendor(<name + hints>)` (unless `hint_url` is set, in
     which case navigate there first as a strong prior).
  2. Pick the best domain candidate from the search results — the prompt
     gives heuristic priors (single-word match to vendor name, avoid
     directory aggregators).
  3. Visit, dismiss overlays, scroll, read About / Contact / Footer.
  4. Self-judge "complete enough to keep" or "formality — skip" using the
     few-shot exemplars rendered into the system prompt by
     `enrich_lessons.render_few_shot`.
  5. Emit a JSON result that the worker parses into a `Vendor` schema.

Profile setup mirrors `agent.py` for the listing pool: full chromium-1161
binary (so VNC actually shows windows), proxy injection when VPN is on,
notification denials, popup-tool registration. Workspace assignment is
deferred to PR4.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from crawler.observability.logger import get_logger
from crawler.schemas import Vendor
from crawler.tools.llm.queue import acquire_llm_slot

from .config import get_agentic_settings
from .enrich_lessons import render_few_shot
from .enrich_queue import EnrichTask

_log = get_logger(__name__)

# Aggregator domains we deprioritize when picking from search results.
# The agent sees this list in the prompt and is told NOT to pick these
# even when they rank #1 — we want the vendor's own site.
_AGGREGATOR_DEPRIORITIZE = (
    "alibaba.com",
    "made-in-china.com",
    "linkedin.com",
    "indiamart.com",
    "tradeindia.com",
    "globalsources.com",
    "yelp.com",
    "yellowpages.com",
    "wikipedia.org",
    "pinterest.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "youtube.com",
    "crunchbase.com",
    "bloomberg.com",
)


class EnrichResult:
    """Lightweight container for the enrich worker. Mirrors AgentResult
    in `agent.py` but tailored to enrichment outputs."""

    def __init__(
        self,
        *,
        task: EnrichTask,
        vendor: Vendor | None,
        completeness_score: float,
        bail_reason: str | None,
        elapsed_s: float,
        n_steps: int | None,
        raw_steps: list[dict],
        final_url: str | None,
        error: str | None = None,
    ) -> None:
        self.task = task
        self.vendor = vendor
        self.completeness_score = completeness_score
        self.bail_reason = bail_reason
        self.elapsed_s = elapsed_s
        self.n_steps = n_steps
        self.raw_steps = raw_steps
        self.final_url = final_url
        self.error = error
        # Compatibility shims for `lessons.archive_lesson(seed=..., agent_result=...)`:
        self.exhibitors: list = []  # archive_lesson uses len(.exhibitors); we have 0
        self.bail_reason_value = bail_reason
        self.expo_id = task.expo_id
        self.seed_name = task.vendor_name


def _system_prompt_for_task(task: EnrichTask, few_shot_block: str) -> str:
    """Compose the full agent task instruction. Browser-Use's Agent
    accepts a single `task` string (no separate system message)."""
    aggregators = ", ".join(_AGGREGATOR_DEPRIORITIZE[:6])
    first_step = (
        f"open_in_new_tab('{task.hint_url}')"
        if task.hint_url
        else f"search_vendor('{task.vendor_name} {task.country_hint or ''} {task.product_hint or ''}'.strip())"
    )
    return (
        f"Vendor: {task.vendor_name}  | Country: {task.country_hint or '?'}  "
        f"| Product: {task.product_hint or '?'}\n\n"
        f"Steps:\n"
        f"1. {first_step}\n"
        f"2. From search results, pick official vendor domain. "
        f"AVOID aggregators ({aggregators}). Prefer single-word match.\n"
        f"3. open_in_new_tab(<picked-domain>) → dismiss_overlays "
        f"→ scroll_until_loaded → read About + Contact + footer.\n"
        f"4. emit done with JSON.\n\n"
        f"OUTPUT (JSON only, no prose, no fences):\n"
        f'{{"name":"","domain":"","url":"","country":"","address":"",'
        f'"phone":"","email":"","description":"","scope":[],'
        f'"catalog_refs":[],'
        f'"completeness_score":0.0,"bail_reason":null}}\n'
        f"null = unknown (don't invent). bail_reason ∈ "
        f"{{null, formality, 404, captcha, image_only, wrong_domain}}. completeness_score 0-1.\n"
        f"CATALOG: if the site links a downloadable catalog/brochure (PDF) include its URL "
        f"in catalog_refs as {{\"url\":\"https://...\",\"label\":\"<name>\",\"kind\":\"pdf\"}}. "
        f"If /catalog, /products, /produk, or /brochure exists, navigate once and add the "
        f"page URL with kind=\"html\". Limit to ≤6 refs.\n"
        f"ANTI-LOOP RULES (HARD):\n"
        f"  0. The JSON above MUST be the inline text of done(). NEVER use files_to_display "
        f"or any attachment. Parser only reads inline text — attachments are dropped.\n"
        f"  1. If `extract` returns 'no match' or empty 2× in a row → STOP, emit done with what you have.\n"
        f"  2. If you've called the SAME tool with the SAME query 2× → STOP, emit done.\n"
        f"  3. If page is a press-release distributor (einpresswire, prnewswire, businesswire, prweb, newswire, openpr, issuewire) → STOP IMMEDIATELY with bail_reason='wrong_domain'. These are NEVER the vendor.\n"
        f"  4. If page is a directory/aggregator (alibaba, indiamart, kompass, linkedin, etc.) → STOP with bail_reason='wrong_domain'.\n"
        f"  5. If domain has no token from vendor name → STOP with bail_reason='wrong_domain' rather than scrape garbage.\n\n"
        f"{few_shot_block}".strip()
    )


def _extract_keyvalue(raw: str) -> dict[str, Any]:
    """Best-effort `Key: value` line parser for prose responses.

    Triggered when JSON extraction fails. Mistral / Qwen / Gemma sometimes
    emit:
        Name: ACME Corp
        Domain: acme.com
        Address: 123 Main St
        Phone: (123) 456-7890
        Email: info@acme.com
        Description: We make X for Y.
        Scope: [a, b, c]    or    Scope: a, b, c
        Completeness Score: 0.7
        Bail Reason: null

    We map all the keys our schema expects, normalize types, return a
    dict that downstream `_parse_enrich_output` can consume identically
    to a real JSON payload. Missing keys = None / 0 / [] defaults.
    """
    import re

    if not raw or len(raw.strip()) < 5:
        return {}

    # Strip code fences / leading/trailing prose markers if any.
    text = raw.strip()
    text = re.sub(r"^```(?:json|markdown)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    # Normalize keys → canonical schema names.
    key_aliases = {
        "name": "name",
        "company": "name",
        "company name": "name",
        "domain": "domain",
        "url": "url",
        "website": "url",
        "country": "country",
        "address": "address",
        "phone": "phone",
        "telephone": "phone",
        "tel": "phone",
        "email": "email",
        "e-mail": "email",
        "description": "description",
        "about": "description",
        "summary": "description",
        "scope": "scope",
        "products": "scope",
        "services": "scope",
        "completeness score": "completeness_score",
        "completeness": "completeness_score",
        "score": "completeness_score",
        "bail reason": "bail_reason",
        "bail": "bail_reason",
    }

    out: dict[str, Any] = {}
    # Match "Key: value" lines. Value can extend until the next key-line
    # or blank line. Handle multi-line description by greedy lookahead.
    line_pattern = re.compile(
        r"^\s*([A-Za-z][A-Za-z0-9 _\-]{1,40})\s*[:=]\s*(.*?)$",
        re.MULTILINE,
    )

    for m in line_pattern.finditer(text):
        raw_key = (m.group(1) or "").strip().lower()
        val = (m.group(2) or "").strip()
        canonical = key_aliases.get(raw_key)
        if not canonical or canonical in out:
            continue
        if val.lower() in ("null", "n/a", "none", "-", ""):
            continue

        if canonical == "completeness_score":
            try:
                # Strip non-digit-non-dot chars defensively.
                out[canonical] = float(re.sub(r"[^0-9.]", "", val) or "0")
            except ValueError:
                continue
        elif canonical == "scope":
            # "[a, b, c]" or "a, b, c" or "a | b | c"
            v = val.strip("[]() ")
            parts = [
                p.strip(" \"'") for p in re.split(r"[,|;]", v) if p.strip()
            ]
            if parts:
                out[canonical] = parts[:8]
        elif canonical == "bail_reason":
            v = val.strip(" \"'").lower()
            if v in ("formality", "404", "captcha", "image_only", "paywall", "403"):
                out[canonical] = v
        elif canonical == "domain":
            # Strip protocol prefix if present.
            v = re.sub(r"^https?://", "", val.strip()).lower().strip("/").strip(".")
            out[canonical] = v
        else:
            out[canonical] = val.strip(" \"'.")

    return out


def _parse_enrich_output(raw: str, task: EnrichTask) -> tuple[Vendor | None, float, str | None]:
    """Extract the JSON payload from the agent's final answer and convert
    it to a Vendor. Returns (vendor_or_none, completeness_score, bail_reason).
    `vendor_or_none` is None when the payload is unparseable or the agent
    explicitly bailed.

    Mistral (and many open LLMs) often emit prose/markdown key-value
    pairs instead of strict JSON despite the prompt. We fall back to a
    `Key: value` line parser so that data isn't lost when the model
    ignores the JSON-only directive.
    """
    from crawler.tools.llm.openai_client import _extract_json

    payload: dict[str, Any] | None = None
    try:
        payload = _extract_json(raw or "")
    except Exception:  # noqa: BLE001
        payload = None
    if not isinstance(payload, dict):
        payload = _extract_keyvalue(raw or "")

    if not isinstance(payload, dict) or not payload:
        _log.warning(
            "enrich_agent.parse_failed",
            vendor=task.vendor_name[:80],
            preview=(raw or "")[:200],
        )
        return None, 0.0, "parse_failed"

    completeness = 0.0
    try:
        completeness = float(payload.get("completeness_score") or 0.0)
    except (TypeError, ValueError):
        completeness = 0.0
    completeness = max(0.0, min(1.0, completeness))

    bail = payload.get("bail_reason")
    if bail in ("", "null"):
        bail = None

    # Bail with no useful data → no Vendor.
    if bail and completeness < 0.1:
        return None, completeness, str(bail)

    name = (payload.get("name") or task.vendor_name).strip()
    domain = (payload.get("domain") or "").strip().lower().lstrip(".")
    if not domain and not bail:
        # No domain extracted and no explicit bail — treat as formality.
        return None, completeness, "no_domain"

    url = payload.get("url")
    description = payload.get("description")
    scope = payload.get("scope") or []
    if isinstance(scope, str):
        scope = [scope]

    # Snowglobe Phase 2 — vision agent can surface catalog/brochure links
    # the deterministic `catalog_finder` would miss (sites without /catalog
    # routes, JS-rendered nav, locale subpaths, etc.). Sanitize aggressively:
    # require dict shape with non-empty url, drop the rest, cap at 6 refs.
    catalog_refs_raw = payload.get("catalog_refs") or []
    if not isinstance(catalog_refs_raw, list):
        catalog_refs_raw = []
    catalog_refs: list[dict[str, Any]] = []
    for r in catalog_refs_raw[:6]:
        if not isinstance(r, dict):
            continue
        ru = (r.get("url") or "").strip()
        if not ru or not ru.lower().startswith(("http://", "https://")):
            continue
        kind = (r.get("kind") or "").strip().lower()
        if kind not in ("html", "pdf"):
            kind = "pdf" if ru.lower().endswith(".pdf") else "html"
        label = (r.get("label") or "").strip()[:80] or ("pdf" if kind == "pdf" else "katalog")
        catalog_refs.append({"url": ru, "label": label, "kind": kind})

    # Pack soft fields into raw_extracts — that JSONB field is the schema-
    # stable home for "stuff the agent extracted that the deterministic
    # path didn't model." Reporter persists this verbatim.
    raw_extracts: dict[str, Any] = {
        "agentic_completeness_score": completeness,
        "agentic_bail_reason": bail,
        "agentic_address": payload.get("address"),
        "agentic_phone": payload.get("phone"),
        "agentic_email": payload.get("email"),
        "agentic_country_extracted": payload.get("country"),
        "agentic_source_query": task.source_query,
        "agentic_lesson_id_of_listing": task.lesson_id_of_listing,
        "agentic_enriched_at": datetime.now(timezone.utc).isoformat(),
        "agentic_fields_extracted": [
            k for k in ("name", "domain", "address", "phone", "email", "scope", "description")
            if payload.get(k)
        ],
    }

    # Map agent-extracted phone/email into the structured `contacts` list
    # so the frontend's Kontak tab renders them. Without this, contacts
    # stay buried in raw_extracts (jsonb metadata) and the UI shows
    # "Tidak ada akun terdeteksi" even though the data is there.
    from crawler.schemas import Address, ContactPoint

    contacts: list[ContactPoint] = []
    email_val = (payload.get("email") or "").strip()
    if email_val and "@" in email_val and len(email_val) < 200:
        try:
            contacts.append(ContactPoint(type="email", value=email_val))
        except Exception:  # noqa: BLE001
            pass
    phone_val = (payload.get("phone") or "").strip()
    if phone_val and any(ch.isdigit() for ch in phone_val) and len(phone_val) < 60:
        try:
            contacts.append(ContactPoint(type="phone", value=phone_val))
        except Exception:  # noqa: BLE001
            pass

    # Address: agent gives free-text → store in `raw` field; country into
    # `country` so the dashboard's NEGARA column populates.
    addr_val = (payload.get("address") or "").strip()
    country_val = (payload.get("country") or task.country_hint or "").strip()
    address_obj: Address | None = None
    if addr_val or country_val:
        try:
            address_obj = Address(
                raw=(addr_val or None),
                country=(country_val or None),
            )
        except Exception:  # noqa: BLE001
            address_obj = None

    try:
        vendor = Vendor(
            company_name=name[:200],
            domain=domain or None,
            canonical_url=url if url else None,
            description=(description or None),
            products=[str(s)[:80] for s in scope][:8] if scope else [],
            expos_seen=[task.expo_id] if task.expo_id else [],
            confidence_score=completeness,
            source_tags=["agentic_enrich"],
            contacts=contacts,
            address=address_obj,
            catalog_refs=catalog_refs,
            catalog_count=len(catalog_refs),
            raw_extracts=raw_extracts,
        )
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "enrich_agent.vendor_construct_failed",
            vendor=task.vendor_name[:80],
            error=str(e)[:160],
        )
        return None, completeness, "schema_invalid"

    return vendor, completeness, bail


async def build_prewarmed_session(slot_idx: int) -> Any:
    """Spawn a `BrowserSession` for enrich slot `slot_idx`, persistent profile,
    headed Chromium, workspace-2 placement. Caller keeps it alive across
    enrich tasks — every agent.run() reuses this session so a Chromium tab
    stays visible in noVNC even when the queue is idle.

    Returns the started BrowserSession ready to be passed to
    `Agent(browser_session=...)`. Caller MUST `await session.stop()` on
    shutdown.
    """
    s = get_agentic_settings()
    try:
        from browser_use import BrowserProfile, BrowserSession
    except ImportError as e:
        _log.warning("enrich_agent.browser_use_missing", error=str(e))
        return None

    profile_slot_path: Path | None = None
    if s.agentic_persistent_profiles:
        try:
            from .profile_slots import profile_dir_for

            profile_slot_path = profile_dir_for("enrich", slot_idx)
        except Exception as e:  # noqa: BLE001
            _log.debug(
                "enrich_agent.profile_slot_for_prewarm_failed",
                error=str(e)[:120],
            )

    chromium_args: list[str] = [
        "--deny-permission-prompts",
        "--use-fake-ui-for-media-stream",
        "--disable-notifications",
    ]
    try:
        from crawler.config import get_settings as _get_base_settings

        _base = _get_base_settings()
        if _base.vpn_enabled and _base.proxy_url:
            chromium_args.append(f"--proxy-server={_base.proxy_url}")
    except Exception:  # noqa: BLE001
        pass

    profile_kwargs: dict[str, Any] = {
        "headless": s.headless,
        "args": chromium_args,
        "enable_default_extensions": False,  # avoid BrowserStateRequest empty
    }
    if profile_slot_path is not None:
        profile_kwargs["user_data_dir"] = str(profile_slot_path)
    if not s.headless:
        for candidate in (
            "/ms-playwright/chromium-1161/chrome-linux/chrome",
            "/ms-playwright/chromium-1148/chrome-linux/chrome",
        ):
            if Path(candidate).exists():
                profile_kwargs["executable_path"] = candidate
                break
        profile_kwargs["ignore_default_args"] = [
            "--headless=new",
            "--headless",
            "--ozone-platform=headless",
        ]

    profile = BrowserProfile(**profile_kwargs)
    session = BrowserSession(browser_profile=profile)

    try:
        await session.start()
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "enrich_agent.prewarm_start_failed",
            slot=slot_idx, error=str(e)[:160],
        )
        return None

    # Best-effort fluxbox workspace-2 assignment for the warmed window.
    try:
        from .workspace import assign_after_spawn

        asyncio.create_task(
            assign_after_spawn(session, s.enrich_workspace_id)
        )
    except Exception:  # noqa: BLE001
        pass

    _log.info(
        "enrich_agent.prewarmed",
        slot=slot_idx,
        profile=str(profile_slot_path) if profile_slot_path else None,
    )
    return session


async def run_enrich_for_task(
    task: EnrichTask,
    *,
    prewarmed_session: Any | None = None,
) -> EnrichResult:
    """Spawn one Browser-Use Agent for `task`, drive it to done, parse
    the output. Wraps the LLM ainvoke through Phase 2's `acquire_llm_slot`
    so this pool shares the global vision-tier cap with the listing pool.

    When `prewarmed_session` is provided, Agent reuses the existing
    BrowserSession instead of spawning a new Chromium. Tab/cookie state
    accumulates across tasks (this is intentional — same persistent
    profile slot anyway). Caller (worker loop) keeps the session alive
    across calls.
    """
    s = get_agentic_settings()
    started = time.monotonic()

    # Lazy imports — Browser-Use is heavy and only present in agentic image.
    try:
        from browser_use import Agent
        from crawler.tools.llm.queue import QueuedChatOllama as ChatOllama
    except ImportError as e:
        _log.warning("enrich_agent.browser_use_missing", error=str(e))
        return EnrichResult(
            task=task,
            vendor=None,
            completeness_score=0.0,
            bail_reason="browser_use_missing",
            elapsed_s=0.0,
            n_steps=None,
            raw_steps=[],
            final_url=None,
            error=str(e),
        )

    llm = ChatOllama(
        model=s.vision_model,
        host=s.llm_base_url.rstrip("/"),
        timeout=300.0,
        # Snowglobe Phase 2 — the wrapped ChatOllama in this codebase doesn't
        # accept keep_alive=. Warmness is enforced two other ways instead:
        # (a) _prewarm_ollama_vision() pings /api/generate with keep_alive=1h
        # before consumers start, and (b) the daemon-side OLLAMA_KEEP_ALIVE
        # set in ollama-up.sh. As long as enrich calls land within that
        # window the model stays resident — usually true under steady load.
        _llm_queue_tier="vision",
    )

    few_shot = await render_few_shot(
        s.enrich_lessons_dir,
        s.enrich_few_shot_success_n,
        s.enrich_few_shot_failure_n,
    )
    instruction = _system_prompt_for_task(task, few_shot)

    # Recordings dir mirrors the listing-pool layout but under a sibling
    # directory so operator can grep enrich vs listing recordings separately.
    task_slug = "".join(c if c.isalnum() else "_" for c in task.vendor_name)[:60]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rec_dir = (s.recordings_dir.parent / "agentic_enrich_recordings"
               / f"{stamp}-{task_slug}")
    if s.record_screenshots or s.record_conversation:
        rec_dir.mkdir(parents=True, exist_ok=True)

    agent_kwargs: dict[str, Any] = {
        "task": instruction,
        "llm": llm,
        "use_vision": s.use_vision,
        "max_actions_per_step": 3,
        # Match agent.py — slim context so qwen3-vl:8b prefill stays fast.
        "max_history_items": 6,
        "max_clickable_elements_length": 8000,
        "llm_timeout": 600,
        "step_timeout": 720,
    }
    # CRITICAL: explicit initial navigation. Browser-Use's `directly_open_url`
    # auto-extract from task text is unreliable — many runs end up stuck on
    # about:blank. Force navigate as initial action when we have a hint URL.
    if task.hint_url:
        agent_kwargs["initial_actions"] = [
            {"navigate": {"url": task.hint_url, "new_tab": False}}
        ]

    # Same controller the listing pool uses — `dismiss_overlays`,
    # `scroll_until_loaded`, `extract_by_selector`, `search_vendor`.
    from .tools import build_controller

    controller = build_controller()
    if controller is not None:
        agent_kwargs["controller"] = controller

    # Phase 3.2: when a pre-warmed BrowserSession is supplied (worker loop
    # creates it once at startup), skip BrowserProfile / per-task slot
    # acquire and reuse the live session — Chromium tab stays open in VNC
    # across tasks, no cold launch each call.
    profile_slot_path: Path | None = None
    profile_slot_handle = None
    if prewarmed_session is not None:
        agent_kwargs["browser_session"] = prewarmed_session
    else:
        chromium_args: list[str] = [
            "--deny-permission-prompts",
            "--use-fake-ui-for-media-stream",
            "--disable-notifications",
        ]
        try:
            from crawler.config import get_settings as _get_base_settings

            _base = _get_base_settings()
            if _base.vpn_enabled and _base.proxy_url:
                chromium_args.append(f"--proxy-server={_base.proxy_url}")
        except Exception:  # noqa: BLE001
            pass

        if s.agentic_persistent_profiles:
            try:
                from .profile_slots import acquire_enrich_slot

                profile_slot_handle = acquire_enrich_slot()
                slot_idx, profile_slot_path = await profile_slot_handle.__aenter__()
                _log.info(
                    "enrich_agent.persistent_profile",
                    slot=slot_idx, path=str(profile_slot_path),
                )
            except Exception as e:  # noqa: BLE001
                _log.warning(
                    "enrich_agent.profile_slot_acquire_failed",
                    error=str(e)[:160],
                )
                profile_slot_handle = None
                profile_slot_path = None

        try:
            from browser_use.browser.profile import BrowserProfile  # type: ignore[attr-defined]

            profile_kwargs: dict[str, Any] = {
                "headless": s.headless, "args": chromium_args,
                "enable_default_extensions": False,
            }
            if profile_slot_path is not None:
                profile_kwargs["user_data_dir"] = str(profile_slot_path)
            if not s.headless:
                for candidate in (
                    "/ms-playwright/chromium-1161/chrome-linux/chrome",
                    "/ms-playwright/chromium-1148/chrome-linux/chrome",
                ):
                    if Path(candidate).exists():
                        profile_kwargs["executable_path"] = candidate
                        break
                profile_kwargs["ignore_default_args"] = [
                    "--headless=new",
                    "--headless",
                    "--ozone-platform=headless",
                ]
            agent_kwargs["browser_profile"] = BrowserProfile(**profile_kwargs)
        except ImportError:
            pass

    if s.record_conversation:
        agent_kwargs["save_conversation_path"] = str(rec_dir / "conversation")
    if s.record_screenshots:
        agent_kwargs["save_recording_path"] = str(rec_dir)

    raw_steps: list[dict] = []
    capture = _StepCaptureHandler(raw_steps)
    root_logger = logging.getLogger()
    root_logger.addHandler(capture)

    final_text: str = ""
    final_url: str | None = None
    n_steps: int | None = None
    try:
        try:
            agent: Any = Agent(**agent_kwargs)
            # Phase 3 — fire-and-forget fluxbox workspace assignment so
            # enrich-pool chromiums tile on workspace 2 (vs listing on
            # workspace 1). No-ops if wmctrl absent.
            try:
                from .workspace import assign_after_spawn

                browser_session = getattr(agent, "browser_session", None)
                if browser_session is not None:
                    asyncio.create_task(
                        assign_after_spawn(
                            browser_session, s.enrich_workspace_id
                        )
                    )
            except Exception as _e:  # noqa: BLE001
                _log.debug(
                    "enrich_agent.workspace_helper_skip", error=str(_e)[:120]
                )
            history = await asyncio.wait_for(
                agent.run(max_steps=s.enrich_max_steps),
                timeout=s.enrich_task_timeout_seconds,
            )
            try:
                final_text = (history.final_result() or "") if history else ""
            except Exception:  # noqa: BLE001
                final_text = ""
            try:
                n_steps = getattr(history, "n_steps", None)
            except Exception:  # noqa: BLE001
                n_steps = None
            try:
                last_url = history.urls()[-1] if history and history.urls() else None
                final_url = str(last_url) if last_url else None
            except Exception:  # noqa: BLE001
                final_url = None
        except asyncio.TimeoutError:
            elapsed = time.monotonic() - started
            _log.warning(
                "enrich_agent.timeout",
                vendor=task.vendor_name[:80],
                elapsed_s=round(elapsed, 1),
            )
            return EnrichResult(
                task=task, vendor=None, completeness_score=0.0,
                bail_reason="timeout", elapsed_s=elapsed,
                n_steps=None, raw_steps=raw_steps, final_url=None,
                error="task_timeout",
            )
        except Exception as e:  # noqa: BLE001
            elapsed = time.monotonic() - started
            _log.warning(
                "enrich_agent.error",
                vendor=task.vendor_name[:80],
                error=str(e)[:200],
            )
            return EnrichResult(
                task=task, vendor=None, completeness_score=0.0,
                bail_reason=None, elapsed_s=elapsed,
                n_steps=None, raw_steps=raw_steps, final_url=None,
                error=str(e)[:300],
            )
    finally:
        root_logger.removeHandler(capture)
        if profile_slot_handle is not None:
            try:
                await profile_slot_handle.__aexit__(None, None, None)
            except Exception as _e:  # noqa: BLE001
                _log.debug(
                    "enrich_agent.profile_slot_release_failed",
                    error=str(_e)[:120],
                )

    vendor, completeness, bail = _parse_enrich_output(final_text, task)
    elapsed = time.monotonic() - started
    _log.info(
        "enrich_agent.done",
        vendor=task.vendor_name[:80],
        domain=(vendor.domain if vendor else None),
        completeness=completeness,
        bail=bail,
        elapsed_s=round(elapsed, 1),
        n_steps=n_steps,
    )
    return EnrichResult(
        task=task,
        vendor=vendor,
        completeness_score=completeness,
        bail_reason=bail,
        elapsed_s=elapsed,
        n_steps=n_steps,
        raw_steps=raw_steps,
        final_url=final_url,
    )


class _StepCaptureHandler(logging.Handler):
    """Mirrors agent.py's per-step thinking capture. Filters Browser-Use
    Agent log records that contain Eval / Memory / Next goal / actions so
    they make it into the lesson archive for offline review."""

    def __init__(self, sink: list[dict]) -> None:
        super().__init__(level=logging.INFO)
        self._sink = sink

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001
            return
        if not msg:
            return
        name = record.name or ""
        if not name.startswith("browser_use.Agent"):
            return
        if any(t in msg for t in ("Eval", "Memory", "Next goal", "Final Result")):
            self._sink.append(
                {
                    "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
                    "msg": msg[:2000],
                    "logger": name,
                }
            )
