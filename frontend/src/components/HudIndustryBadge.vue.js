/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
// Industry categorical palette: 8 hand-picked editorial hues that read on
// both paper cream and warm navy. Mid-chroma, no SaaS purple/pink, no
// full-saturation. Static (not theme-aware) so an industry keeps its
// identity across themes.
const palette = [
    '#B5321A', // vermilion — aerospace/defense
    '#9E7C2E', // gold leaf — energy
    '#10302E', // deep teal — maritime
    '#6B7A2F', // sage olive — land
    '#94411E', // brick — munitions
    '#3D4D6A', // slate blue — cyber/IT
    '#5C3B5C', // plum ink — other
    '#3A342D', // ink soft — unspecified
];
const props = defineProps();
const color = computed(() => {
    let hash = 0;
    for (const ch of props.label) {
        hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }
    return palette[Math.abs(hash) % palette.length];
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-pill" },
    ...{ style: ({
            borderColor: __VLS_ctx.color + '55',
            backgroundColor: __VLS_ctx.color + '15',
            color: __VLS_ctx.color,
        }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "h-1.5 w-1.5 shrink-0 rounded-full" },
    ...{ style: ({ backgroundColor: __VLS_ctx.color }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "truncate" },
});
(__VLS_ctx.label);
/** @type {__VLS_StyleScopedClasses['hud-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['h-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['w-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            color: color,
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
