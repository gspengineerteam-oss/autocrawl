/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import SparklineChart from '@/components/charts/SparklineChart.vue';
const props = withDefaults(defineProps(), { tone: 'default', sparkType: 'line' });
const toneColor = computed(() => {
    switch (props.tone) {
        case 'accent':
            return 'rgb(var(--amber))';
        case 'ok':
            return 'rgb(var(--ok))';
        case 'warn':
            return 'rgb(var(--warn))';
        case 'crit':
            return 'rgb(var(--crit))';
        case 'info':
            return 'rgb(var(--cyan))';
        default:
            return 'rgb(var(--amber))';
    }
});
const deltaTone = computed(() => {
    if (props.delta === undefined || props.delta === null)
        return 'muted';
    if (props.delta > 0)
        return 'ok';
    if (props.delta < 0)
        return 'crit';
    return 'muted';
});
const deltaText = computed(() => {
    if (props.delta === undefined || props.delta === null)
        return '';
    const sign = props.delta > 0 ? '+' : '';
    return `${sign}${props.delta}${props.deltaLabel ? ' ' + props.deltaLabel : ''}`;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ tone: 'default', sparkType: 'line' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hud-panel relative flex flex-col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between border-b border-base-200 bg-base-50 px-3 py-1.5 dark:border-base-700 dark:bg-base-800" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs font-medium uppercase tracking-ops text-base-400 dark:text-base-500" },
});
(__VLS_ctx.code);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
});
(__VLS_ctx.label);
if (__VLS_ctx.icon) {
    const __VLS_0 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        icon: (['fas', __VLS_ctx.icon]),
        ...{ class: "text-2xs text-base-400 dark:text-base-500" },
    }));
    const __VLS_2 = __VLS_1({
        icon: (['fas', __VLS_ctx.icon]),
        ...{ class: "text-2xs text-base-400 dark:text-base-500" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-1 p-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-baseline gap-1.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-3xl font-semibold leading-none tracking-tight" },
    ...{ style: ({ color: __VLS_ctx.toneColor }) },
});
(__VLS_ctx.value);
if (__VLS_ctx.unit) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500" },
    });
    (__VLS_ctx.unit);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex h-3 items-center gap-1.5" },
});
if (__VLS_ctx.deltaText) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops" },
        ...{ class: ({
                'text-ok-600 dark:text-ok-400': __VLS_ctx.deltaTone === 'ok',
                'text-crit-600 dark:text-crit-400': __VLS_ctx.deltaTone === 'crit',
                'text-base-400 dark:text-base-500': __VLS_ctx.deltaTone === 'muted',
            }) },
    });
    (__VLS_ctx.deltaText);
}
if (__VLS_ctx.sparkline && __VLS_ctx.sparkline.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "px-2 pb-2" },
    });
    /** @type {[typeof SparklineChart, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(SparklineChart, new SparklineChart({
        data: (__VLS_ctx.sparkline),
        color: (__VLS_ctx.toneColor),
        type: (__VLS_ctx.sparkType),
    }));
    const __VLS_5 = __VLS_4({
        data: (__VLS_ctx.sparkline),
        color: (__VLS_ctx.toneColor),
        type: (__VLS_ctx.sparkType),
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
}
/** @type {__VLS_StyleScopedClasses['hud-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-3']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ok-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-ok-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-crit-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-2']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SparklineChart: SparklineChart,
            toneColor: toneColor,
            deltaTone: deltaTone,
            deltaText: deltaText,
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
