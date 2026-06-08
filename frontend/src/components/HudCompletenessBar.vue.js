/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const pct = computed(() => Math.max(0, Math.min(100, Math.round(props.score * 100))));
// Tone returns a CSS var reference so the bar follows the theme.
const tone = computed(() => {
    if (pct.value >= 75)
        return 'rgb(var(--ok))';
    if (pct.value >= 40)
        return 'rgb(var(--amber))';
    return 'rgb(var(--crit))';
});
const segments = computed(() => {
    const total = 20;
    const filled = Math.round((pct.value / 100) * total);
    return Array.from({ length: total }, (_, i) => i < filled);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex h-3 flex-1 items-center gap-[2px]" },
});
for (const [on, i] of __VLS_getVForSourceType((__VLS_ctx.segments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        key: (i),
        ...{ class: "h-3 flex-1 transition-colors" },
        ...{ style: ({
                backgroundColor: on ? __VLS_ctx.tone : 'transparent',
                border: on ? `1px solid ${__VLS_ctx.tone}` : '1px solid currentColor',
                opacity: on ? 1 : 0.25,
            }) },
    });
}
if (__VLS_ctx.showLabel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num w-10 text-right font-mono text-2xs uppercase tracking-ops" },
        ...{ style: ({ color: __VLS_ctx.tone }) },
    });
    (__VLS_ctx.pct);
}
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-[2px]']} */ ;
/** @type {__VLS_StyleScopedClasses['h-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['w-10']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            pct: pct,
            tone: tone,
            segments: segments,
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
