/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { resolveCountry } from '@/data/country_resolver';
const props = defineProps();
const size = computed(() => props.size ?? 16);
const code = computed(() => {
    if (props.iso2)
        return props.iso2.toUpperCase();
    if (!props.country)
        return '··';
    const rec = resolveCountry(props.country);
    return rec?.cca2 ?? props.country.slice(0, 2).toUpperCase();
});
function rng(seed) {
    let t = seed >>> 0;
    return () => {
        t = (t + 0x6D2B79F5) >>> 0;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}
const dots = computed(() => {
    const seed = code.value.charCodeAt(0) * 256 + (code.value.charCodeAt(1) || 65);
    const r = rng(seed);
    const points = [];
    const grid = 1.6;
    const radius = size.value / 2 - 0.5;
    const cx0 = size.value / 2;
    const cy0 = size.value / 2;
    for (let y = 0; y < size.value; y += grid) {
        for (let x = 0; x < size.value; x += grid) {
            const dx = x - cx0;
            const dy = y - cy0;
            if (dx * dx + dy * dy > radius * radius)
                continue;
            if (r() > 0.55)
                continue;
            points.push({
                cx: x + (r() - 0.5) * 0.6,
                cy: y + (r() - 0.5) * 0.6,
                rad: 0.35 + r() * 0.3,
                opacity: 0.5 + r() * 0.4,
            });
        }
    }
    return points;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "inline-flex items-center gap-1.5 align-middle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: (__VLS_ctx.size),
    height: (__VLS_ctx.size),
    viewBox: (`0 0 ${__VLS_ctx.size} ${__VLS_ctx.size}`),
    'aria-hidden': "true",
    ...{ class: "inline-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: (__VLS_ctx.size / 2),
    cy: (__VLS_ctx.size / 2),
    r: (__VLS_ctx.size / 2 - 0.5),
    fill: "rgb(var(--paper))",
    stroke: "rgb(var(--ink) / 0.32)",
    'stroke-width': "0.6",
});
for (const [d, i] of __VLS_getVForSourceType((__VLS_ctx.dots))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        key: (i),
        cx: (d.cx),
        cy: (d.cy),
        r: (d.rad),
        fill: (`rgb(var(--ink) / ${d.opacity.toFixed(2)})`),
    });
}
var __VLS_0 = {};
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[0.6875rem] tracking-[0.14em] text-ink-2" },
});
(__VLS_ctx.code);
/** @type {__VLS_StyleScopedClasses['inline-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['align-middle']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-block']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.6875rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.14em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
// @ts-ignore
var __VLS_1 = __VLS_0;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            size: size,
            code: code,
            dots: dots,
        };
    },
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
