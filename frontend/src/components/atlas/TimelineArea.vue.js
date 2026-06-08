/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
const range = ref(90);
const timeline = useQuery({
    queryKey: computed(() => ['stats', 'timeline', range.value]),
    queryFn: () => api.stats.timeline(range.value),
    refetchInterval: 120_000,
});
const points = computed(() => timeline.data.value ?? []);
const stats = computed(() => {
    const ps = points.value;
    if (ps.length === 0)
        return { total: 0, max: 0, avg: 0, growth: 0 };
    const total = ps.reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const max = ps.reduce((m, p) => Math.max(m, p.vendors_added ?? 0), 0);
    const avg = total / ps.length;
    const half = Math.floor(ps.length / 2);
    const earlySum = ps.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const lateSum = ps.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const growth = earlySum === 0 ? (lateSum > 0 ? 100 : 0) : ((lateSum - earlySum) / earlySum) * 100;
    return { total, max, avg, growth };
});
/* Draw geometry */
const W = 1200;
const H = 200;
const PAD_T = 16;
const PAD_B = 32;
const PAD_L = 12;
const PAD_R = 12;
const innerW = computed(() => W - PAD_L - PAD_R);
const innerH = computed(() => H - PAD_T - PAD_B);
const path = computed(() => {
    const ps = points.value;
    if (ps.length === 0)
        return { line: '', area: '', dots: [] };
    const max = Math.max(1, stats.value.max);
    const stepX = ps.length > 1 ? innerW.value / (ps.length - 1) : 0;
    let line = '';
    const dots = [];
    for (let i = 0; i < ps.length; i++) {
        const x = PAD_L + i * stepX;
        const v = ps[i].vendors_added ?? 0;
        const y = PAD_T + innerH.value - (v / max) * innerH.value;
        line += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`);
        dots.push({ x, y, v });
    }
    const area = `${line} L ${PAD_L + innerW.value} ${PAD_T + innerH.value} L ${PAD_L} ${PAD_T + innerH.value} Z`;
    return { line, area, dots };
});
/* Path length for animated draw-in */
const linePathRef = ref(null);
const animKey = computed(() => `${range.value}-${points.value.length}`);
function startDrawAnim() {
    const el = linePathRef.value;
    if (!el)
        return;
    // Schedule after DOM updates so getTotalLength is accurate
    requestAnimationFrame(() => {
        try {
            const len = el.getTotalLength();
            el.style.transition = 'none';
            el.style.strokeDasharray = `${len}`;
            el.style.strokeDashoffset = `${len}`;
            // force reflow
            el.getBoundingClientRect();
            el.style.transition = `stroke-dashoffset 1100ms cubic-bezier(0.20, 0.60, 0.20, 1)`;
            el.style.strokeDashoffset = '0';
        }
        catch { /* ignore */ }
    });
}
/* Watch animKey + linePathRef to start animation */
watch([animKey, linePathRef], () => { startDrawAnim(); }, { flush: 'post' });
/* Hover crosshair */
const hoverIdx = ref(null);
const svgWrap = ref(null);
function onSvgMove(e) {
    const wrap = svgWrap.value;
    const ps = points.value;
    if (!wrap || ps.length === 0)
        return;
    const rect = wrap.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    // Convert to viewBox space x
    const vbX = xPct * W;
    const innerX = vbX - PAD_L;
    const stepX = ps.length > 1 ? innerW.value / (ps.length - 1) : innerW.value;
    const idx = Math.max(0, Math.min(ps.length - 1, Math.round(innerX / stepX)));
    hoverIdx.value = idx;
}
function onSvgLeave() { hoverIdx.value = null; }
const hoverPoint = computed(() => {
    if (hoverIdx.value == null)
        return null;
    const dot = path.value.dots[hoverIdx.value];
    if (!dot)
        return null;
    const point = points.value[hoverIdx.value];
    return { ...dot, date: point?.date };
});
function fmtDate(iso) {
    if (!iso)
        return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '—';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
function fmtFullDate(iso) {
    if (!iso)
        return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '—';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
const axisTicks = computed(() => {
    const ps = points.value;
    if (ps.length === 0)
        return [];
    const ticks = [];
    const N = 4;
    const stepX = ps.length > 1 ? innerW.value / (ps.length - 1) : 0;
    for (let i = 0; i <= N; i++) {
        const idx = Math.floor((ps.length - 1) * (i / N));
        ticks.push({
            x: PAD_L + idx * stepX,
            label: fmtDate(ps[idx]?.date),
        });
    }
    return ticks;
});
onBeforeUnmount(() => {
    // cleanup nothing — Vue handles refs
});
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
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-amber dot-glow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-amber" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-1" },
});
for (const [r] of __VLS_getVForSourceType([30, 60, 90])) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.range = r;
            } },
        key: (r),
        ...{ class: "px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.10em] uppercase rounded-[4px] transition-colors" },
        ...{ class: (__VLS_ctx.range === r
                ? 'bg-amber text-bg'
                : 'text-ink-mute hover:text-ink hover:bg-surface-2') },
    });
    (r);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid grid-cols-4 px-5 py-3 rule-b" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "num-display num-amber text-[20px] font-semibold mt-0.5" },
});
(__VLS_ctx.stats.total.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-l pl-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "num-display text-[20px] font-semibold mt-0.5" },
});
(__VLS_ctx.stats.avg.toFixed(1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-l pl-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "num-display text-[20px] font-semibold mt-0.5" },
});
(__VLS_ctx.stats.max.toLocaleString());
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-l pl-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "num-display text-[20px] font-semibold mt-0.5" },
    ...{ class: (__VLS_ctx.stats.growth >= 0 ? 'text-ok' : 'text-crit') },
});
(__VLS_ctx.stats.growth >= 0 ? '+' : '');
(__VLS_ctx.stats.growth.toFixed(1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMousemove: (__VLS_ctx.onSvgMove) },
    ...{ onMouseleave: (__VLS_ctx.onSvgLeave) },
    ref: "svgWrap",
    ...{ class: "px-3 pt-2 relative" },
});
/** @type {typeof __VLS_ctx.svgWrap} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: (`0 0 ${__VLS_ctx.W} ${__VLS_ctx.H}`),
    ...{ class: "w-full h-[200px] block" },
    preserveAspectRatio: "none",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.defs, __VLS_intrinsicElements.defs)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.linearGradient, __VLS_intrinsicElements.linearGradient)({
    id: "tl-fill",
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
    offset: "50%",
    'stop-color': "rgb(255 184 64)",
    'stop-opacity': "0.14",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.stop)({
    offset: "100%",
    'stop-color': "rgb(255 184 64)",
    'stop-opacity': "0",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.filter, __VLS_intrinsicElements.filter)({
    id: "tl-glow",
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.feGaussianBlur)({
    stdDeviation: "2.4",
    result: "blurred",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.feMerge, __VLS_intrinsicElements.feMerge)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.feMergeNode)({
    in: "blurred",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.feMergeNode)({
    in: "SourceGraphic",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: (__VLS_ctx.PAD_L),
    x2: (__VLS_ctx.W - __VLS_ctx.PAD_R),
    y1: (__VLS_ctx.PAD_T),
    y2: (__VLS_ctx.PAD_T),
    stroke: "rgb(240 232 213)",
    'stroke-opacity': "0.05",
    'stroke-dasharray': "2 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: (__VLS_ctx.PAD_L),
    x2: (__VLS_ctx.W - __VLS_ctx.PAD_R),
    y1: (__VLS_ctx.PAD_T + __VLS_ctx.innerH * 0.33),
    y2: (__VLS_ctx.PAD_T + __VLS_ctx.innerH * 0.33),
    stroke: "rgb(240 232 213)",
    'stroke-opacity': "0.04",
    'stroke-dasharray': "2 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: (__VLS_ctx.PAD_L),
    x2: (__VLS_ctx.W - __VLS_ctx.PAD_R),
    y1: (__VLS_ctx.PAD_T + __VLS_ctx.innerH * 0.66),
    y2: (__VLS_ctx.PAD_T + __VLS_ctx.innerH * 0.66),
    stroke: "rgb(240 232 213)",
    'stroke-opacity': "0.04",
    'stroke-dasharray': "2 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
    x1: (__VLS_ctx.PAD_L),
    x2: (__VLS_ctx.W - __VLS_ctx.PAD_R),
    y1: (__VLS_ctx.PAD_T + __VLS_ctx.innerH),
    y2: (__VLS_ctx.PAD_T + __VLS_ctx.innerH),
    stroke: "rgb(240 232 213)",
    'stroke-opacity': "0.12",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.path.area),
    fill: "url(#tl-fill)",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    ref: "linePathRef",
    d: (__VLS_ctx.path.line),
    fill: "none",
    stroke: "rgb(255 200 104)",
    'stroke-width': "1.8",
    'stroke-linejoin': "round",
    'stroke-linecap': "round",
    filter: "url(#tl-glow)",
});
/** @type {typeof __VLS_ctx.linePathRef} */ ;
if (__VLS_ctx.hoverPoint) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
        'pointer-events': "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: (__VLS_ctx.hoverPoint.x),
        x2: (__VLS_ctx.hoverPoint.x),
        y1: (__VLS_ctx.PAD_T),
        y2: (__VLS_ctx.PAD_T + __VLS_ctx.innerH),
        stroke: "rgb(255 184 64)",
        'stroke-opacity': "0.45",
        'stroke-dasharray': "2 3",
        'stroke-width': "1",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: (__VLS_ctx.hoverPoint.x),
        cy: (__VLS_ctx.hoverPoint.y),
        r: "6",
        fill: "rgb(255 184 64)",
        'fill-opacity': "0.20",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: (__VLS_ctx.hoverPoint.x),
        cy: (__VLS_ctx.hoverPoint.y),
        r: "3",
        fill: "rgb(255 240 210)",
        stroke: "rgb(10 21 37)",
        'stroke-width': "1.6",
    });
}
if (__VLS_ctx.hoverPoint) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute pointer-events-none bg-surface card-2 px-3 py-2 rounded-[6px] border border-rule-strong" },
        ...{ style: ({
                left: `clamp(8px, ${(__VLS_ctx.hoverPoint.x / __VLS_ctx.W) * 100}%, calc(100% - 140px))`,
                top: '8px',
                transform: 'translateX(-50%)',
                minWidth: '120px',
            }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "num-display num-amber text-[18px] font-semibold leading-none" },
    });
    (__VLS_ctx.hoverPoint.v.toLocaleString());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "label label-mute mt-1" },
    });
    (__VLS_ctx.fmtFullDate(__VLS_ctx.hoverPoint.date));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-3 pb-3 relative h-[18px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: (`0 0 ${__VLS_ctx.W} 18`),
    ...{ class: "w-full h-[18px] block" },
    preserveAspectRatio: "none",
});
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.axisTicks))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
        key: (`tick-${t.x}`),
        x: (t.x),
        y: "13",
        'font-family': "Geist Variable, system-ui",
        'font-size': "10",
        'font-weight': "600",
        'letter-spacing': "0.12em",
        'text-anchor': "middle",
        fill: "rgb(92 100 120)",
        ...{ style: {} },
    });
    (t.label);
}
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.10em]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[4px]']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-4']} */ ;
/** @type {__VLS_StyleScopedClasses['px-5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[20px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-l']} */ ;
/** @type {__VLS_StyleScopedClasses['pl-4']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[20px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-l']} */ ;
/** @type {__VLS_StyleScopedClasses['pl-4']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[20px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-l']} */ ;
/** @type {__VLS_StyleScopedClasses['pl-4']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[20px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[200px]']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['card-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule-strong']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[18px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[18px]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[18px]']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            range: range,
            stats: stats,
            W: W,
            H: H,
            PAD_T: PAD_T,
            PAD_L: PAD_L,
            PAD_R: PAD_R,
            innerH: innerH,
            path: path,
            linePathRef: linePathRef,
            svgWrap: svgWrap,
            onSvgMove: onSvgMove,
            onSvgLeave: onSvgLeave,
            hoverPoint: hoverPoint,
            fmtFullDate: fmtFullDate,
            axisTicks: axisTicks,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
