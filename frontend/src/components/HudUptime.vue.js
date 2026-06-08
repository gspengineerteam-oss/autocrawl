/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watchEffect } from 'vue';
import { useUptime } from '@/composables/useUptime';
import { useApiHealth } from '@/composables/useApiHealth';
const __VLS_props = withDefaults(defineProps(), { label: 'UPTIME' });
const { query } = useApiHealth();
const reference = ref(0);
const { formatted, tick } = useUptime(reference);
watchEffect(() => {
    const data = query.data.value;
    if (data && typeof data.uptime_seconds === 'number') {
        reference.value = data.uptime_seconds;
        tick.value = 0;
    }
});
const tone = computed(() => {
    if (query.isError.value)
        return 'crit';
    if (!query.data.value)
        return 'muted';
    return 'ok';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ label: 'UPTIME' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2 font-mono text-2xs uppercase tracking-ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-base-400 dark:text-base-500" },
});
(__VLS_ctx.label);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num" },
    ...{ class: ({
            'text-accent-600 dark:text-accent-300': __VLS_ctx.tone === 'ok',
            'text-base-400 dark:text-base-500': __VLS_ctx.tone === 'muted',
            'text-crit-600 dark:text-crit-400': __VLS_ctx.tone === 'crit',
        }) },
});
(__VLS_ctx.formatted);
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-accent-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-accent-300']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-crit-400']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatted: formatted,
            tone: tone,
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
