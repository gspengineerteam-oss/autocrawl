/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
const props = defineProps();
const tone = computed(() => {
    if (props.data.status === 'crit')
        return 'rgb(var(--crit))';
    if (props.data.status === 'active')
        return 'rgb(var(--amber))';
    if (props.data.status === 'ok')
        return 'rgb(var(--ok))';
    return 'rgb(var(--ink-mute))';
});
const toneAlpha = computed(() => {
    if (props.data.status === 'crit')
        return 'rgb(var(--crit) / 0.12)';
    if (props.data.status === 'active')
        return 'rgb(var(--amber) / 0.12)';
    if (props.data.status === 'ok')
        return 'rgb(var(--ok) / 0.12)';
    return 'rgb(var(--ink-mute) / 0.12)';
});
const ledClass = computed(() => {
    if (props.data.status === 'crit')
        return 'hud-led-crit animate-pulse-led';
    if (props.data.status === 'active')
        return 'hud-led-warn animate-pulse-led';
    if (props.data.status === 'ok')
        return 'hud-led-ok';
    return 'hud-led-muted';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hud-flow-subnode group relative flex w-[150px] flex-col rounded-md border bg-white shadow-sm transition-all duration-200 dark:bg-base-900" },
    ...{ style: ({ borderColor: __VLS_ctx.tone, boxShadow: `0 0 0 1px ${__VLS_ctx.toneAlpha}` }) },
});
const __VLS_0 = {}.Handle;
/** @type {[typeof __VLS_components.Handle, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: "target",
    position: (__VLS_ctx.Position.Left),
    ...{ class: "!h-1.5 !w-1.5 !border !border-base-400 !bg-base-100 dark:!bg-base-800" },
}));
const __VLS_2 = __VLS_1({
    type: "target",
    position: (__VLS_ctx.Position.Left),
    ...{ class: "!h-1.5 !w-1.5 !border !border-base-400 !bg-base-100 dark:!bg-base-800" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const __VLS_4 = {}.Handle;
/** @type {[typeof __VLS_components.Handle, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    type: "source",
    position: (__VLS_ctx.Position.Right),
    ...{ class: "!h-1.5 !w-1.5 !border !border-base-400 !bg-base-100 dark:!bg-base-800" },
}));
const __VLS_6 = __VLS_5({
    type: "source",
    position: (__VLS_ctx.Position.Right),
    ...{ class: "!h-1.5 !w-1.5 !border !border-base-400 !bg-base-100 dark:!bg-base-800" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-1 border-b border-base-200 bg-base-50 px-1.5 py-0.5 dark:border-base-700 dark:bg-base-800" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: (__VLS_ctx.ledClass) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-500 dark:text-base-400 truncate" },
});
(__VLS_ctx.data.code);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col px-1.5 py-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "font-mono text-2xs font-medium uppercase tracking-ops text-base-800 dark:text-base-100 truncate" },
    title: (__VLS_ctx.data.label),
});
(__VLS_ctx.data.label);
if (__VLS_ctx.data.sub_label) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "font-mono text-[10px] text-base-500 dark:text-base-400 truncate" },
        title: (__VLS_ctx.data.sub_label),
    });
    (__VLS_ctx.data.sub_label);
}
/** @type {__VLS_StyleScopedClasses['hud-flow-subnode']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[150px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-200']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['!h-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['!w-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['!border']} */ ;
/** @type {__VLS_StyleScopedClasses['!border-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['!bg-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:!bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['!h-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['!w-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['!border']} */ ;
/** @type {__VLS_StyleScopedClasses['!border-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['!bg-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:!bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Handle: Handle,
            Position: Position,
            tone: tone,
            toneAlpha: toneAlpha,
            ledClass: ledClass,
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
