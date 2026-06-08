/// <reference types="../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { Toaster } from 'vue-sonner';
import AppShell from '@/layouts/AppShell.vue';
import { useCursorLight } from '@/composables/useCursorLight';
useCursorLight();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof AppShell, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(AppShell, new AppShell({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "cursor-halo" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "cursor-dot" },
    'aria-hidden': "true",
});
const __VLS_3 = {}.Toaster;
/** @type {[typeof __VLS_components.Toaster, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(__VLS_3, new __VLS_3({
    theme: "system",
    position: "top-right",
    richColors: true,
    closeButton: true,
    offset: (16),
}));
const __VLS_5 = __VLS_4({
    theme: "system",
    position: "top-right",
    richColors: true,
    closeButton: true,
    offset: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
/** @type {__VLS_StyleScopedClasses['cursor-halo']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-dot']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Toaster: Toaster,
            AppShell: AppShell,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
