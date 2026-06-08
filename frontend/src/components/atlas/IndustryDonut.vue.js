/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
const industries = useQuery({
    queryKey: ['stats', 'industries'],
    queryFn: api.stats.industries,
    refetchInterval: 60_000,
});
const SIZE = 220;
const cx = SIZE / 2;
const cy = SIZE / 2;
const rOuter = 90;
const rInner = 64;
function arc(startAngle, endAngle) {
    const a0 = startAngle - Math.PI / 2;
    const a1 = endAngle - Math.PI / 2;
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    const x0 = cx + rOuter * Math.cos(a0);
    const y0 = cy + rOuter * Math.sin(a0);
    const x1 = cx + rOuter * Math.cos(a1);
    const y1 = cy + rOuter * Math.sin(a1);
    const xi1 = cx + rInner * Math.cos(a1);
    const yi1 = cy + rInner * Math.sin(a1);
    const xi0 = cx + rInner * Math.cos(a0);
    const yi0 = cy + rInner * Math.sin(a0);
    return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${large} 0 ${xi0} ${yi0} Z`;
}
/* Amber-led palette with cool secondaries */
const palette = [
    'rgb(255, 184, 64)',
    'rgb(255, 146, 48)',
    'rgb(77, 216, 230)',
    'rgb(157, 165, 184)',
    'rgb(240, 232, 213)',
    'rgb(92, 100, 120)',
];
const segments = computed(() => {
    const rows = (industries.data.value ?? []).slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    const top = rows.slice(0, 8);
    const rest = rows.slice(5);
    const restSum = rest.reduce((s, r) => s + (r.count ?? 0), 0);
    const merged = restSum > 0 ? [...top, { tag: 'Lainnya', count: restSum }] : top;
    const total = merged.reduce((s, r) => s + (r.count ?? 0), 0) || 1;
    let acc = 0;
    const out = [];
    for (let i = 0; i < merged.length; i++) {
        const r = merged[i];
        const span = ((r.count ?? 0) / total) * Math.PI * 2;
        const start = acc;
        const end = acc + span - 0.018;
        acc += span;
        if (end > start) {
            out.push({
                tag: r.tag,
                count: r.count ?? 0,
                start, end,
                d: arc(start, end),
                color: palette[i % palette.length],
            });
        }
    }
    return out;
});
const total = computed(() => segments.value.reduce((s, x) => s + x.count, 0));
function fmtK(n) {
    if (n >= 1000)
        return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
    return n.toLocaleString();
}
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-body flex items-center gap-5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "relative shrink-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: (`0 0 ${__VLS_ctx.SIZE} ${__VLS_ctx.SIZE}`),
    width: (__VLS_ctx.SIZE),
    height: (__VLS_ctx.SIZE),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: (__VLS_ctx.cx),
    cy: (__VLS_ctx.cy),
    r: (__VLS_ctx.rOuter),
    fill: "none",
    stroke: "rgb(240 232 213 / 0.04)",
    'stroke-width': "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: (__VLS_ctx.cx),
    cy: (__VLS_ctx.cy),
    r: (__VLS_ctx.rInner),
    fill: "none",
    stroke: "rgb(240 232 213 / 0.04)",
    'stroke-width': "1",
});
for (const [seg] of __VLS_getVForSourceType((__VLS_ctx.segments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path, __VLS_intrinsicElements.path)({
        key: (seg.tag),
        d: (seg.d),
        fill: (seg.color),
        stroke: "rgb(19 31 51)",
        'stroke-width': "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.title, __VLS_intrinsicElements.title)({});
    (seg.tag);
    (seg.count.toLocaleString());
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: (__VLS_ctx.cx),
    y: (__VLS_ctx.cy - 4),
    'text-anchor': "middle",
    'font-family': "Geist Mono Variable, monospace",
    'font-size': "32",
    'font-weight': "600",
    fill: "rgb(255 184 64)",
    'font-feature-settings': "'tnum','zero'",
    ...{ style: {} },
});
(__VLS_ctx.fmtK(__VLS_ctx.total));
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: (__VLS_ctx.cx),
    y: (__VLS_ctx.cy + 16),
    'text-anchor': "middle",
    'font-family': "Geist Variable, system-ui",
    'font-size': "9.5",
    'font-weight': "600",
    'letter-spacing': "0.18em",
    fill: "rgb(157 165 184)",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "flex-1 min-w-0 space-y-2" },
});
for (const [seg] of __VLS_getVForSourceType((__VLS_ctx.segments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
        key: (seg.tag),
        ...{ class: "grid grid-cols-[10px_1fr_auto] items-center gap-2.5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "block w-2.5 h-2.5 rounded-[2px]" },
        ...{ style: ({ background: seg.color }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[12.5px] text-ink-2 truncate" },
    });
    (seg.tag);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display text-[12.5px]" },
    });
    (seg.count.toLocaleString());
}
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-5']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-[10px_1fr_auto]']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['w-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[2px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12.5px]']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SIZE: SIZE,
            cx: cx,
            cy: cy,
            rOuter: rOuter,
            rInner: rInner,
            segments: segments,
            total: total,
            fmtK: fmtK,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
