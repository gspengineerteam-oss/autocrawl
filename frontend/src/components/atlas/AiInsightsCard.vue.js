/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import { useNumberTicker } from '@/composables/useNumberTicker';
/**
 * Tren · 30 Hari — vendor-enrichment trend snapshot.
 *
 * REAL DATA ONLY. No client-side prose synthesis. Every number on this
 * card comes from a backend endpoint, labeled honestly with what it is
 * and where it came from. Earlier iterations of this component included
 * hand-written commentary that combined real numbers with invented
 * narrative ("klaster industri Asia Tenggara…") — that has been removed.
 *
 * Sources:
 *   - delta % + early/late sums      ← /stats/timeline?days=30
 *   - active error count + categories ← /orchestrator/error-summary
 *   - latest run mode + timestamp     ← /runs?limit=5
 */
const timeline = useQuery({
    queryKey: ['stats', 'timeline', 30],
    queryFn: () => api.stats.timeline(30),
    refetchInterval: 60_000,
});
const errSummary = useQuery({
    queryKey: ['orchestrator', 'error-summary'],
    queryFn: () => api.orchestrator.errorSummary(2),
    refetchInterval: 30_000,
});
const recentRuns = useQuery({
    queryKey: ['runs', 'recent', 5],
    queryFn: () => api.runs(5),
    refetchInterval: 30_000,
});
const stats = computed(() => {
    const points = timeline.data.value ?? [];
    const half = Math.floor(points.length / 2);
    const earlySum = points.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const lateSum = points.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const total = earlySum + lateSum;
    const delta = earlySum === 0
        ? (lateSum > 0 ? 100 : 0)
        : ((lateSum - earlySum) / earlySum) * 100;
    return { earlySum, lateSum, total, delta, points: points.length };
});
const errCount = computed(() => (errSummary.data.value?.groups ?? []).reduce((s, g) => s + (g.count ?? 0), 0));
const errCategories = computed(() => (errSummary.data.value?.groups ?? []).length);
const latestRun = computed(() => {
    const items = recentRuns.data.value?.items ?? [];
    return items[0] ?? null;
});
function timeAgo(iso) {
    if (!iso)
        return '—';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t))
        return '—';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60)
        return `${s}d`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `${h}j`;
    const d = Math.floor(h / 24);
    return `${d}h`;
}
const tickedDelta = useNumberTicker(computed(() => Math.round(stats.value.delta * 10)), { round: false });
const tickedTotal = useNumberTicker(computed(() => stats.value.total));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "card p-5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "flex items-baseline justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label-mono text-[0.625rem]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-3 flex items-baseline gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[3.5rem] leading-none" },
    ...{ class: (__VLS_ctx.stats.delta >= 0 ? 'text-accent-ink' : 'text-vermilion') },
});
(__VLS_ctx.stats.delta >= 0 ? '+' : '');
((__VLS_ctx.tickedDelta / 10).toFixed(1));
const __VLS_0 = {}.Icon;
/** @type {[typeof __VLS_components.Icon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    name: (__VLS_ctx.stats.delta >= 0 ? 'trending-up' : 'trending-down'),
    size: (22),
    ...{ class: (__VLS_ctx.stats.delta >= 0 ? 'text-accent-ink' : 'text-vermilion') },
}));
const __VLS_2 = __VLS_1({
    name: (__VLS_ctx.stats.delta >= 0 ? 'trending-up' : 'trending-down'),
    size: (22),
    ...{ class: (__VLS_ctx.stats.delta >= 0 ? 'text-accent-ink' : 'text-vermilion') },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({
    ...{ class: "mt-4 grid grid-cols-[1fr_auto] gap-y-2.5 gap-x-4 items-baseline" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[1rem]" },
});
(__VLS_ctx.stats.earlySum.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[1rem]" },
});
(__VLS_ctx.stats.lateSum.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[1.125rem] text-ink" },
});
(__VLS_ctx.tickedTotal.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-t mt-4 pt-3 grid grid-cols-2 gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-1 flex items-baseline gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[1.25rem]" },
});
(__VLS_ctx.errCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label-mono text-[0.625rem]" },
});
(__VLS_ctx.errCategories);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label block" },
});
if (__VLS_ctx.latestRun) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mt-1 flex items-baseline gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-[0.8125rem] uppercase tracking-[0.06em] text-ink" },
    });
    (__VLS_ctx.latestRun.mode);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label-mono text-[0.625rem]" },
    });
    (__VLS_ctx.timeAgo(__VLS_ctx.latestRun.started_at));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-t mt-3 pt-2 flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label-mono text-[0.625rem]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label-mono text-[0.625rem]" },
});
(__VLS_ctx.stats.points);
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['p-5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[3.5rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-[1fr_auto]']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-y-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-x-4']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1.125rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1.25rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.8125rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.06em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            stats: stats,
            errCount: errCount,
            errCategories: errCategories,
            latestRun: latestRun,
            timeAgo: timeAgo,
            tickedDelta: tickedDelta,
            tickedTotal: tickedTotal,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
