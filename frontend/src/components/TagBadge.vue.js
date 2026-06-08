/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { presentTag } from '@/utils/tagPresentation';
const props = withDefaults(defineProps(), { size: 'sm', variant: 'soft' });
const meta = computed(() => presentTag(props.raw));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ size: 'sm', variant: 'soft' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "tag-badge" },
    'data-size': (__VLS_ctx.size),
    'data-variant': (__VLS_ctx.variant),
    title: (__VLS_ctx.raw),
});
const __VLS_0 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    icon: (__VLS_ctx.meta.icon),
    ...{ class: "tag-badge__icon" },
}));
const __VLS_2 = __VLS_1({
    icon: (__VLS_ctx.meta.icon),
    ...{ class: "tag-badge__icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "tag-badge__label" },
});
(__VLS_ctx.meta.label);
/** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-badge__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-badge__label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            meta: meta,
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
