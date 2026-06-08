"""VNC fluxbox workspace placement helper.

Phase 3 splits the agent into two visually-segregated pools — listing on
fluxbox workspace 1, enrich on workspace 2 — so the operator can swipe
through right-click → workspaces in noVNC to inspect either pool.

This module shells out to `wmctrl` to assign Chromium windows after they
spawn. Best-effort: if `wmctrl` isn't installed (image-build skipped) the
helper returns False and logs at debug level. The agent still runs; the
operator just sees all chromium tiles on workspace 1 (fluxbox default).

Why not use Playwright's window-positioning API: Playwright doesn't know
about fluxbox workspaces — its `--window-position` flag is X/Y pixels on
the active workspace. Switching workspaces requires an X11 EWMH client
message (`_NET_WM_DESKTOP`), which is exactly what `wmctrl` does.
"""

from __future__ import annotations

import asyncio
import shutil

from crawler.observability.logger import get_logger

from .config import get_agentic_settings

_log = get_logger(__name__)

# Cache the wmctrl-availability check so we don't shell out for `which` on
# every assignment call.
_WMCTRL_AVAILABLE: bool | None = None


def _wmctrl_available() -> bool:
    global _WMCTRL_AVAILABLE
    if _WMCTRL_AVAILABLE is None:
        _WMCTRL_AVAILABLE = shutil.which("wmctrl") is not None
        if not _WMCTRL_AVAILABLE:
            _log.debug("agentic.wmctrl_missing")
    return _WMCTRL_AVAILABLE


async def _list_windows_for_pid(pid: int) -> list[str]:
    """Return window IDs (e.g. "0x04200006") whose process ID matches `pid`.

    `wmctrl -lp` columns: WID DESKTOP PID HOSTNAME TITLE.
    """
    proc = await asyncio.create_subprocess_exec(
        "wmctrl", "-lp",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        return []
    out: list[str] = []
    for line in stdout.decode("utf-8", "replace").splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue
        wid, _desktop, wpid, *_ = parts
        try:
            if int(wpid) == pid:
                out.append(wid)
        except ValueError:
            continue
    return out


async def assign_window_to_workspace(pid: int, workspace_one_indexed: int) -> bool:
    """Move all windows owned by `pid` to fluxbox workspace
    `workspace_one_indexed` (1..4). Returns True if at least one window
    was moved, False otherwise.

    Retries 3× with 0.7s back-off because Chromium typically maps its
    window 1-2s after process spawn — calling immediately races the
    window-mapping. After 3 retries we give up silently; operator can
    still navigate workspaces manually via fluxbox right-click menu.
    """
    s = get_agentic_settings()
    if not s.vnc_workspace_assignment_enabled:
        return False
    if s.headless:
        # No display, no point.
        return False
    if not _wmctrl_available():
        return False
    if pid <= 0 or workspace_one_indexed < 1:
        return False

    target = workspace_one_indexed - 1  # wmctrl uses 0-indexed desktops
    attempts = 3
    for attempt in range(attempts):
        wids = await _list_windows_for_pid(pid)
        if wids:
            moved = 0
            for wid in wids:
                proc = await asyncio.create_subprocess_exec(
                    "wmctrl", "-i", "-r", wid, "-t", str(target),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                rc = await proc.wait()
                if rc == 0:
                    moved += 1
            if moved > 0:
                _log.info(
                    "agentic.workspace_assigned",
                    pid=pid,
                    workspace=workspace_one_indexed,
                    windows=moved,
                    attempt=attempt + 1,
                )
                return True
        await asyncio.sleep(0.7)
    _log.debug(
        "agentic.workspace_assignment_skipped",
        pid=pid,
        workspace=workspace_one_indexed,
        reason="no_window_mapped_after_retries",
    )
    return False


def extract_pid_from_browser_session(browser_session: object) -> int | None:
    """Best-effort extraction of the Chromium PID from a Browser-Use
    BrowserSession. Internal attribute path is fragile across Playwright /
    Browser-Use versions — wrap any AttributeError as a no-op.
    """
    try:
        ctx = getattr(browser_session, "browser_context", None)
        if ctx is None:
            return None
        impl = getattr(ctx, "_impl_obj", None)
        if impl is None:
            return None
        browser = getattr(impl, "_browser", None)
        if browser is None:
            return None
        conn = getattr(browser, "_connection", None)
        if conn is None:
            return None
        transport = getattr(conn, "_transport", None)
        if transport is None:
            return None
        proc = getattr(transport, "_proc", None)
        if proc is None:
            return None
        pid = getattr(proc, "pid", None)
        return int(pid) if pid else None
    except Exception:  # noqa: BLE001
        return None


async def assign_after_spawn(
    browser_session: object,
    workspace_one_indexed: int,
    *,
    initial_delay_s: float = 1.5,
) -> None:
    """Fire-and-forget helper: wait briefly for Chromium to map its
    window, then assign to the requested workspace. Run as
    `asyncio.create_task(assign_after_spawn(...))` so it doesn't block
    the agent loop."""
    try:
        await asyncio.sleep(initial_delay_s)
        pid = extract_pid_from_browser_session(browser_session)
        if pid is None:
            _log.debug("agentic.workspace_assignment_skipped", reason="no_pid")
            return
        await assign_window_to_workspace(pid, workspace_one_indexed)
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.workspace_assignment_error", error=str(e)[:160])
