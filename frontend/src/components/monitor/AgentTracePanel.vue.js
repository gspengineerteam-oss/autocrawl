/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
/**
 * Agent reasoning trace — refined-cinematic register.
 *
 * Each trace entry is rendered as an iconic, animated row:
 *   - 36px tinted-gold circle with kind-specific inline SVG glyph
 *   - Apple-style ultra-light stroke (1.5 stroke-width)
 *   - Fresh entries ripple gold for 4s after first sight
 *   - Hover-lift with action affordance reveal
 *   - Verdict chips animate (success sweeps in, fail shakes)
 *   - JSON payload renders as a clean key/value grid
 *
 * Polls /orchestrator/agent-traces every 2s. Auto-scrolls to bottom
 * unless operator has scrolled up. Real data only.
 */
const tracesQ = useQuery({
    queryKey: ['orchestrator', 'agent-traces'],
    queryFn: () => api.orchestrator.agentTraces(120),
    refetchInterval: 2000,
});
const items = computed(() => tracesQ.data.value?.items ?? []);
const scrollEl = ref(null);
const stickToBottom = ref(true);
const showJump = ref(false);
const hoverPaused = ref(false);
/* Fresh-entry tracking — mark traces seen within the last 4s with the
 * gold ripple. Stored as Map<ts, expiry-ms>. Cleaned on each poll. */
const seenTs = new Set();
const freshTs = ref(new Set());
const FRESH_WINDOW_MS = 4000;
let primed = false;
function reapFresh() {
    const now = Date.now();
    const next = new Set();
    for (const ts of freshTs.value) {
        if (parseInt(ts.replace(/\D/g, '').slice(-13)) > now - FRESH_WINDOW_MS)
            next.add(ts);
    }
    freshTs.value = next;
}
watch(items, async (next) => {
    if (!primed) {
        // First poll: mark all as seen but NOT fresh (otherwise every trace
        // on the initial load would ripple, which is meaningless noise).
        for (const t of next)
            seenTs.add(t.ts);
        primed = true;
        return;
    }
    const fresh = new Set(freshTs.value);
    for (const t of next) {
        if (!seenTs.has(t.ts)) {
            seenTs.add(t.ts);
            fresh.add(t.ts);
            // Schedule reap after fresh window
            setTimeout(() => {
                const f = new Set(freshTs.value);
                f.delete(t.ts);
                freshTs.value = f;
            }, FRESH_WINDOW_MS);
        }
    }
    freshTs.value = fresh;
    if (stickToBottom.value && !hoverPaused.value)
        await scrollToBottom(true);
}, { deep: false });
function isAtBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 32;
}
function onScroll() {
    if (!scrollEl.value)
        return;
    const atBottom = isAtBottom(scrollEl.value);
    stickToBottom.value = atBottom;
    showJump.value = !atBottom;
}
async function scrollToBottom(smooth = true) {
    await nextTick();
    if (!scrollEl.value)
        return;
    scrollEl.value.scrollTo({
        top: scrollEl.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
    });
    stickToBottom.value = true;
    showJump.value = false;
}
onMounted(() => { void scrollToBottom(false); });
onBeforeUnmount(() => { });
function trimText(t) {
    let s = t.text;
    s = s.replace(/^[👍🧠🎯⚖️📍▶️⚠️📢✅❌👎\s]+/u, '');
    s = s.replace(/^(Eval|Memory|Next goal|Judge Verdict|Final Result|Step \d+):\s*/i, '');
    return s.trim();
}
function parseTraceText(raw) {
    const start = raw.indexOf('{');
    if (start === -1)
        return { prose: raw, json: null, leftover: '' };
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let end = -1;
    for (let i = start; i < raw.length; i++) {
        const c = raw[i];
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (c === '\\') {
            escapeNext = true;
            continue;
        }
        if (c === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (c === '{')
            depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end === -1)
        return { prose: raw, json: null, leftover: '' };
    const jsonStr = raw.substring(start, end + 1);
    const before = raw.substring(0, start).replace(/[\s:·,]+$/, '').trim();
    const after = raw.substring(end + 1).replace(/^[\s:·,]+/, '').trim();
    try {
        const parsed = JSON.parse(jsonStr);
        return { prose: before, json: parsed, leftover: after };
    }
    catch {
        return { prose: raw, json: null, leftover: '' };
    }
}
function formatJsonValue(v) {
    if (v === null)
        return 'null';
    if (v === undefined)
        return '—';
    if (typeof v === 'boolean')
        return v ? 'true' : 'false';
    if (typeof v === 'number')
        return String(v);
    if (typeof v === 'string')
        return v.length === 0 ? '—' : v;
    if (Array.isArray(v)) {
        if (v.length === 0)
            return '[]';
        if (v.every((x) => typeof x === 'string' || typeof x === 'number'))
            return v.map((x) => String(x)).join(', ');
        return `[${v.length} item${v.length === 1 ? '' : 's'}]`;
    }
    if (typeof v === 'object') {
        const keys = Object.keys(v);
        if (keys.length === 0)
            return '{}';
        return `{${keys.length} key${keys.length === 1 ? '' : 's'}}`;
    }
    return String(v);
}
function valueClass(v) {
    if (v === null)
        return 'jv-null';
    if (typeof v === 'boolean')
        return v ? 'jv-true' : 'jv-false';
    if (typeof v === 'number')
        return 'jv-num';
    if (typeof v === 'string' && v.length === 0)
        return 'jv-empty';
    if (Array.isArray(v) && v.length === 0)
        return 'jv-empty';
    return 'jv-str';
}
function jsonEntries(j) {
    if (j === null || typeof j !== 'object' || Array.isArray(j))
        return [];
    return Object.entries(j);
}
function kindLabel(k) {
    switch (k) {
        case 'eval': return 'EVAL';
        case 'memory': return 'MEMORY';
        case 'goal': return 'GOAL';
        case 'judge': return 'JUDGE';
        case 'result': return 'RESULT';
        case 'action': return 'ACTION';
        case 'step_header': return 'STEP';
        case 'grounding': return 'GROUNDING';
        case 'resolve_hit': return 'RESOLVE';
        case 'jina_hit': return 'JINA';
        case 'grounded_extract': return 'CATALOG';
        default: return 'LOG';
    }
}
function kindTone(k) {
    switch (k) {
        case 'eval': return 'ok';
        case 'memory': return 'cyan';
        case 'goal': return 'amber';
        case 'judge': return 'crit';
        case 'result': return 'amber';
        case 'action': return 'mute';
        case 'step_header': return 'mute';
        case 'grounding': return 'cyan';
        case 'resolve_hit': return 'ok';
        case 'jina_hit': return 'ok';
        case 'grounded_extract': return 'amber';
        default: return 'mute';
    }
}
function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t))
        return '';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60)
        return `${s}d`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m`;
    return `${Math.floor(m / 60)}j`;
}
function copyTrace(t) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(t.text).catch(() => { });
    }
}
void reapFresh;
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['trace-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__core']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__core']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__core']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__core']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__core']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__core']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict--ok']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict--crit']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['json-val']} */ ;
/** @type {__VLS_StyleScopedClasses['json-val']} */ ;
/** @type {__VLS_StyleScopedClasses['json-val']} */ ;
/** @type {__VLS_StyleScopedClasses['json-val']} */ ;
/** @type {__VLS_StyleScopedClasses['json-val']} */ ;
/** @type {__VLS_StyleScopedClasses['json-val']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-jump']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-jump']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ onMouseenter: (...[$event]) => {
            __VLS_ctx.hoverPaused = true;
        } },
    ...{ onMouseleave: (...[$event]) => {
            __VLS_ctx.hoverPaused = false;
        } },
    ...{ class: "trace-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "trace-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "trace-head__left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "live-dot" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "trace-head__tag num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "trace-head__count num" },
});
(__VLS_ctx.items.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onScroll: (__VLS_ctx.onScroll) },
    ref: "scrollEl",
    ...{ class: "trace-scroll" },
});
/** @type {typeof __VLS_ctx.scrollEl} */ ;
if (__VLS_ctx.items.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "trace-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "trace-empty__glyph" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "28",
        height: "28",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.5",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "12",
        cy: "12",
        r: "9",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M8 12a4 4 0 0 1 8 0M8 12a4 4 0 0 0 8 0",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 8v.01M12 16v.01",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "trace-empty__sub" },
    });
}
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.items))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (t.ts + '-' + t.kind),
        ...{ class: "trace-row" },
        'data-tone': (__VLS_ctx.kindTone(t.kind)),
        'data-fresh': (__VLS_ctx.freshTs.has(t.ts) ? 'true' : 'false'),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "trace-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "trace-icon__ring" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "trace-icon__core" },
    });
    if (t.kind === 'eval') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "9",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m8 12 3 3 5-6",
        });
    }
    else if (t.kind === 'memory') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M4 6h16v4H4zM4 12h16v4H4zM4 18h16",
        });
    }
    else if (t.kind === 'goal') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "9",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "1.5",
            fill: "currentColor",
        });
    }
    else if (t.kind === 'judge') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M4 19h16M7 19V8m10 11V8M5 6h14M9 6V4h6v2",
        });
    }
    else if (t.kind === 'result') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 21V4l8 3-2 4 2 4-8-3z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 4v17",
        });
    }
    else if (t.kind === 'action') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M8 5v14l11-7z",
        });
    }
    else if (t.kind === 'step_header') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 12h14M13 6l6 6-6 6",
        });
    }
    else if (t.kind === 'grounding') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "9",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
        });
    }
    else if (t.kind === 'resolve_hit') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "9",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "1.5",
            fill: "currentColor",
        });
    }
    else if (t.kind === 'jina_hit') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M13 2 4 14h7l-1 8 9-12h-7z",
        });
    }
    else if (t.kind === 'grounded_extract') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M7 8h9M7 12h9M7 16h6",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "4",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "trace-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "trace-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "trace-meta__kind num" },
    });
    (__VLS_ctx.kindLabel(t.kind));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "trace-meta__sep" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "trace-meta__agent" },
    });
    (t.agent);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "trace-meta__sep" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "trace-meta__time num" },
    });
    (__VLS_ctx.timeAgo(t.ts));
    if (t.verdict === 'success') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "trace-verdict trace-verdict--ok" },
            'data-fresh': (__VLS_ctx.freshTs.has(t.ts) ? 'true' : 'false'),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "9",
            height: "9",
            viewBox: "0 0 12 12",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m2 6 3 3 5-7",
        });
    }
    else if (t.verdict === 'fail') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "trace-verdict trace-verdict--crit" },
            'data-fresh': (__VLS_ctx.freshTs.has(t.ts) ? 'true' : 'false'),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "9",
            height: "9",
            viewBox: "0 0 12 12",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "2",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m3 3 6 6M9 3l-6 6",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.copyTrace(t);
            } },
        ...{ class: "trace-copy" },
        type: "button",
        'aria-label': "Copy",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "11",
        height: "11",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.5",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "3",
        y: "3",
        width: "8",
        height: "8",
        rx: "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v6",
    });
    for (const [parsed] of __VLS_getVForSourceType(([__VLS_ctx.parseTraceText(__VLS_ctx.trimText(t))]))) {
        (t.ts + '-p');
        if (parsed.json !== null) {
            if (parsed.prose) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "trace-text" },
                    ...{ class: ({ 'text-crit': t.kind === 'judge' && t.verdict === 'fail' }) },
                });
                (parsed.prose);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "json-grid" },
            });
            for (const [[k, v]] of __VLS_getVForSourceType((__VLS_ctx.jsonEntries(parsed.json)))) {
                (k);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "json-key" },
                });
                (k);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "json-val" },
                    ...{ class: (__VLS_ctx.valueClass(v)) },
                });
                (__VLS_ctx.formatJsonValue(v));
            }
            if (parsed.leftover) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "trace-text trace-text--mute" },
                });
                (parsed.leftover);
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "trace-text" },
                ...{ class: ({ 'text-crit': t.kind === 'judge' && t.verdict === 'fail' }) },
            });
            (__VLS_ctx.trimText(t));
        }
    }
}
const __VLS_0 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    enterActiveClass: "transition duration-200 ease-out",
    enterFromClass: "opacity-0 translate-y-2",
    leaveActiveClass: "transition duration-150 ease-in",
    leaveToClass: "opacity-0 translate-y-2",
}));
const __VLS_2 = __VLS_1({
    enterActiveClass: "transition duration-200 ease-out",
    enterFromClass: "opacity-0 translate-y-2",
    leaveActiveClass: "transition duration-150 ease-in",
    leaveToClass: "opacity-0 translate-y-2",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.showJump) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showJump))
                    return;
                __VLS_ctx.scrollToBottom(true);
            } },
        type: "button",
        ...{ class: "trace-jump" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "btn-icon-nest" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "11",
        height: "11",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.8",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M7 2v9m0 0-4-4m4 4 4-4",
    });
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['trace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-head']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-head__left']} */ ;
/** @type {__VLS_StyleScopedClasses['live-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-head__tag']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-head__count']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-empty__glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-empty__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__ring']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-icon__core']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-body']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__sep']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__agent']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__sep']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-meta__time']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict--ok']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict--crit']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-text']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['json-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['json-key']} */ ;
/** @type {__VLS_StyleScopedClasses['json-val']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-text']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-text--mute']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-text']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-jump']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            items: items,
            scrollEl: scrollEl,
            showJump: showJump,
            hoverPaused: hoverPaused,
            freshTs: freshTs,
            onScroll: onScroll,
            scrollToBottom: scrollToBottom,
            trimText: trimText,
            parseTraceText: parseTraceText,
            formatJsonValue: formatJsonValue,
            valueClass: valueClass,
            jsonEntries: jsonEntries,
            kindLabel: kindLabel,
            kindTone: kindTone,
            timeAgo: timeAgo,
            copyTrace: copyTrace,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
