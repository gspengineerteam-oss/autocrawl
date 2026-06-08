/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
// Six critical fields whose ABSENCE is what enrichment_gap signals.
// Backend stores these as JSONB array entries via VendorORM.enrichment_gap.
// Denominator is locked at 6 so the bar segment math is consistent across
// every vendor card / row / detail page.
const CRITICAL = ['email', 'products', 'industries', 'description', 'address', 'contacts'];
const props = defineProps();
const completeness = computed(() => {
    const missing = new Set((props.gap ?? []).map((g) => g.toLowerCase()));
    const present = CRITICAL.filter((f) => !missing.has(f)).length;
    return present / CRITICAL.length;
});
const segments = computed(() => {
    // Three-segment bar — paper / ink / gold. Each segment is filled
    // independently so the visual reads as discrete progress rather than
    // a smooth value, which matches the editorial register better than
    // a gradient bar.
    const pct = completeness.value;
    return [
        pct >= 0.34 ? 'on' : 'off',
        pct >= 0.67 ? 'on' : 'off',
        pct >= 0.99 ? 'on' : 'off',
    ];
});
const tone = computed(() => {
    if (completeness.value >= 0.99)
        return 'full';
    if (completeness.value >= 0.5)
        return 'partial';
    return 'thin';
});
const label = computed(() => {
    if (tone.value === 'full')
        return 'Lengkap';
    if (tone.value === 'partial')
        return 'Sebagian';
    return 'Tipis';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['enrichment-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__seg']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__seg']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__seg']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__label']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__label']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "enrichment-badge" },
    'data-size': (__VLS_ctx.size ?? 'normal'),
    'data-tone': (__VLS_ctx.tone),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "enrichment-badge__bar" },
});
for (const [state, idx] of __VLS_getVForSourceType((__VLS_ctx.segments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        key: (idx),
        ...{ class: "enrichment-badge__seg" },
        'data-state': (state),
    });
}
if (__VLS_ctx.showLabel ?? true) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "enrichment-badge__label" },
    });
    (__VLS_ctx.label);
}
/** @type {__VLS_StyleScopedClasses['enrichment-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__seg']} */ ;
/** @type {__VLS_StyleScopedClasses['enrichment-badge__label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            segments: segments,
            tone: tone,
            label: label,
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
