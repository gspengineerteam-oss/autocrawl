/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
const EXCLUDE_KIND = new Set(['step_header', 'action']);
// Tiga pass sanitization
//  (1) hapus SELURUH pictograph Unicode di string
//  (2) hapus leading karakter non-alfanumerik di awal string
//  (3) hapus redundant kind prefix
const PICTOGRAPHIC_GLOBAL = /\p{Extended_Pictographic}/gu;
const LEADING_NON_WORD = /^[^\p{L}\p{N}"'(\[]+/u;
const REDUNDANT_PREFIX = /^(eval|memory|goal|next\s+goal|judge|result)\s*:\s*/i;
function sanitize(text) {
    let cleaned = (text || '').replace(PICTOGRAPHIC_GLOBAL, '');
    cleaned = cleaned.replace(LEADING_NON_WORD, '').trim();
    cleaned = cleaned.replace(REDUNDANT_PREFIX, '').trim();
    return cleaned;
}
const items = ref([]);
const nowMs = ref(Date.now());
const animationDuration = ref('80s');
let clockTimer = null;
const tracesQuery = useQuery({
    queryKey: ['orchestrator', 'agent-traces-ticker'],
    queryFn: () => api.orchestrator.agentTraces(60),
    refetchInterval: 5_000,
});
function makeId(t) {
    return `${t.ts}|${t.kind}|${t.agent}|${t.text.slice(0, 40)}`;
}
function ingest(traces) {
    if (!traces.length)
        return;
    const filtered = traces.filter((t) => !EXCLUDE_KIND.has(t.kind));
    if (!filtered.length)
        return;
    const mapped = filtered.map((t) => ({
        id: makeId(t),
        verdict: t.verdict,
        kind: t.kind,
        agent: sanitize(t.agent || ''),
        text: sanitize(t.text || ''),
        tsMs: new Date(t.ts).getTime() || Date.now(),
    })).filter((m) => m.text.length > 0);
    // Newest first; replace seluruh items supaya konsisten dengan backend snapshot.
    mapped.sort((a, b) => b.tsMs - a.tsMs);
    items.value = mapped.slice(0, 40);
}
watch(tracesQuery.data, (resp) => {
    if (!resp)
        return;
    ingest(resp.items);
}, { immediate: true });
// Hitung total karakter untuk durasi loop yang konsisten "rasanya":
// ~ 60 piksel/detik linear, ~ 8px per glyph average.
watch(items, () => {
    const totalChars = items.value.reduce((a, b) => a + b.kind.length + b.agent.length + b.text.length + 6, 0);
    const estPx = totalChars * 8 + items.value.length * 24;
    const seconds = Math.max(40, Math.round(estPx / 60));
    animationDuration.value = `${seconds}s`;
}, { immediate: true });
function timeAgo(ms) {
    const diff = Math.max(0, nowMs.value - ms);
    const s = Math.floor(diff / 1000);
    if (s < 60)
        return `${s}d`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `${h}j`;
    return `${Math.floor(h / 24)}h`;
}
const empty = computed(() => items.value.length === 0);
const trackItems = computed(() => items.value);
onMounted(() => {
    clockTimer = setInterval(() => { nowMs.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => {
    if (clockTimer)
        clearInterval(clockTimer);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__track']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__item']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__item']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__item']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__item']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__item']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__track']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ticker" },
    role: "log",
    'aria-live': "polite",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "ticker__eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "ticker__pulse" },
    'aria-hidden': "true",
});
if (!__VLS_ctx.empty) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ticker__marquee" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ticker__track" },
        ...{ style: ({ animationDuration: __VLS_ctx.animationDuration }) },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.trackItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            key: (item.id),
            ...{ class: "ticker__item" },
            'data-verdict': (item.verdict ?? 'neutral'),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "ticker__dot" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ticker__kind" },
        });
        (item.kind);
        if (item.agent) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ticker__agent" },
            });
            (item.agent);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ticker__text" },
        });
        (item.text);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ticker__ts" },
        });
        (__VLS_ctx.timeAgo(item.tsMs));
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.trackItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            key: (item.id + '|dup'),
            ...{ class: "ticker__item" },
            'data-verdict': (item.verdict ?? 'neutral'),
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "ticker__dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ticker__kind" },
        });
        (item.kind);
        if (item.agent) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ticker__agent" },
            });
            (item.agent);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ticker__text" },
        });
        (item.text);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ticker__ts" },
        });
        (__VLS_ctx.timeAgo(item.tsMs));
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ticker__idle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
/** @type {__VLS_StyleScopedClasses['ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__marquee']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__track']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__item']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__agent']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__text']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__ts']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__item']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__kind']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__agent']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__text']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__ts']} */ ;
/** @type {__VLS_StyleScopedClasses['ticker__idle']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            animationDuration: animationDuration,
            timeAgo: timeAgo,
            empty: empty,
            trackItems: trackItems,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
