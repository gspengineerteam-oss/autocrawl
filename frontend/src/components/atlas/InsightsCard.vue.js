/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import { useNumberTicker } from '@/composables/useNumberTicker';
/**
 * AI Insights — big amber delta % up top, sparkline middle, small
 * supporting stats below. Hand-rolled SVG sparkline (no chart lib for
 * something this simple), data straight from /stats/timeline.
 */
const timeline = useQuery({
    queryKey: ['stats', 'timeline', 30],
    queryFn: () => api.stats.timeline(30),
    refetchInterval: 60_000,
});
const errSummary = useQuery({
    queryKey: ['orchestrator', 'error-summary'],
    queryFn: () => api.orchestrator.errorSummary(8),
    refetchInterval: 30_000,
});
const points = computed(() => timeline.data.value ?? []);
const stats = computed(() => {
    const ps = points.value;
    if (ps.length === 0)
        return { delta: 0, total: 0, peak: 0, avg: 0 };
    const half = Math.floor(ps.length / 2);
    const earlySum = ps.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const lateSum = ps.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const total = earlySum + lateSum;
    const delta = earlySum === 0
        ? (lateSum > 0 ? 100 : 0)
        : ((lateSum - earlySum) / earlySum) * 100;
    const peak = ps.reduce((m, p) => Math.max(m, p.vendors_added ?? 0), 0);
    const avg = total / Math.max(1, ps.length);
    return { delta, total, peak, avg };
});
const errCount = computed(() => (errSummary.data.value?.groups ?? []).reduce((s, g) => s + (g.count ?? 0), 0));
const tickedDelta = useNumberTicker(computed(() => Math.round(stats.value.delta * 10)), { round: false, duration: 600 });
/* Sparkline path */
const sparkPath = computed(() => {
    const ps = points.value;
    if (ps.length === 0)
        return { line: '', area: '' };
    const w = 280;
    const h = 60;
    const max = Math.max(1, ...ps.map(p => p.vendors_added ?? 0));
    const stepX = ps.length > 1 ? w / (ps.length - 1) : 0;
    let line = '';
    for (let i = 0; i < ps.length; i++) {
        const x = i * stepX;
        const y = h - ((ps[i].vendors_added ?? 0) / max) * h * 0.85 - 4;
        line += (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;
    return { line, area };
});
const positive = computed(() => stats.value.delta >= 0);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "card overflow-hidden" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-amber dot-glow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-baseline gap-2.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[40px] leading-none font-semibold" },
    ...{ class: (__VLS_ctx.positive ? 'num-amber' : 'text-crit') },
});
(__VLS_ctx.positive ? '+' : '');
((__VLS_ctx.tickedDelta / 10).toFixed(1));
const __VLS_0 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    icon: (['fas', __VLS_ctx.positive ? 'arrow-trend-up' : 'arrow-trend-down']),
    ...{ class: "text-[20px]" },
    ...{ class: (__VLS_ctx.positive ? 'text-amber' : 'text-crit') },
}));
const __VLS_2 = __VLS_1({
    icon: (['fas', __VLS_ctx.positive ? 'arrow-trend-up' : 'arrow-trend-down']),
    ...{ class: "text-[20px]" },
    ...{ class: (__VLS_ctx.positive ? 'text-amber' : 'text-crit') },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "mt-1 text-[12.5px] text-ink-2 leading-snug" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-4 -mx-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 280 60",
    ...{ class: "w-full h-[60px] block" },
    preserveAspectRatio: "none",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.defs, __VLS_intrinsicElements.defs)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.linearGradient, __VLS_intrinsicElements.linearGradient)({
    id: "spark-fill",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.stop)({
    offset: "0%",
    'stop-color': "rgb(255 184 64)",
    'stop-opacity': "0.40",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.stop)({
    offset: "100%",
    'stop-color': "rgb(255 184 64)",
    'stop-opacity': "0",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.sparkPath.area),
    fill: "url(#spark-fill)",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.sparkPath.line),
    fill: "none",
    stroke: "rgb(255 184 64)",
    'stroke-width': "1.6",
    'stroke-linejoin': "round",
    'stroke-linecap': "round",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({
    ...{ class: "mt-4 grid grid-cols-3 gap-3 pt-4 rule-t" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[16px] mt-1" },
});
(__VLS_ctx.stats.total.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[16px] mt-1" },
});
(__VLS_ctx.stats.peak.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[16px] mt-1" },
    ...{ class: (__VLS_ctx.errCount > 0 ? 'text-crit' : '') },
});
(__VLS_ctx.errCount);
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[40px]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[20px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-snug']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['-mx-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[60px]']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[16px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[16px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[16px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            stats: stats,
            errCount: errCount,
            tickedDelta: tickedDelta,
            sparkPath: sparkPath,
            positive: positive,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
