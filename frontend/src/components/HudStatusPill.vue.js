/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = withDefaults(defineProps(), { tone: 'muted', pulse: false });
const pillClass = computed(() => {
    switch (props.tone) {
        case 'ok':
            return 'hud-pill-ok';
        case 'warn':
            return 'hud-pill-warn';
        case 'crit':
            return 'hud-pill-crit';
        case 'info':
            return 'hud-pill-info';
        case 'accent':
            return 'hud-pill-accent';
        default:
            return 'hud-pill-muted';
    }
});
const ledClass = computed(() => {
    switch (props.tone) {
        case 'ok':
            return 'hud-led-ok';
        case 'warn':
            return 'hud-led-warn';
        case 'crit':
            return 'hud-led-crit';
        case 'info':
            return 'hud-led-ok';
        case 'accent':
            return 'hud-led-accent';
        default:
            return 'hud-led-muted';
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ tone: 'muted', pulse: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: (__VLS_ctx.pillClass) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: ([__VLS_ctx.ledClass, __VLS_ctx.pulse ? 'animate-pulse-led' : '']) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.label);
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            pillClass: pillClass,
            ledClass: ledClass,
        };
    },
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
