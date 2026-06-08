/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const size = computed(() => props.size ?? 56);
const seedSafe = computed(() => encodeURIComponent(props.seed || 'autocrawl'));
// DiceBear Shapes — geometric abstract shapes that read as logos.
// Background gradient uses our gold palette (hex without #).
const url = computed(() => `https://api.dicebear.com/9.x/shapes/svg?seed=${seedSafe.value}` +
    `&backgroundType=gradientLinear` +
    `&backgroundColor=b8893a,9a6f26,d4a250` +
    `&shape1Color=ffffff,faf6ee,ebe4d7` +
    `&shape2Color=09090b,3f3f46,c81212` +
    `&shape3Color=f25f4c,38bdf8,9a6f26` +
    `&radius=22`);
const fallbackMark = computed(() => {
    const s = props.fallback ?? props.seed;
    return (s ?? '?').toString().trim().charAt(0).toUpperCase() || '?';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "geo-avatar" },
    ...{ style: ({ width: __VLS_ctx.size + 'px', height: __VLS_ctx.size + 'px' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    src: (__VLS_ctx.url),
    alt: (`shape-${__VLS_ctx.seed}`),
    loading: "lazy",
    referrerpolicy: "no-referrer",
    ...{ class: "geo-avatar__img" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "geo-avatar__fallback" },
    'aria-hidden': "true",
});
(__VLS_ctx.fallbackMark);
/** @type {__VLS_StyleScopedClasses['geo-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['geo-avatar__img']} */ ;
/** @type {__VLS_StyleScopedClasses['geo-avatar__fallback']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            size: size,
            url: url,
            fallbackMark: fallbackMark,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
