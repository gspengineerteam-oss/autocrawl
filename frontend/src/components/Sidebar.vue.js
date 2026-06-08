/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useStorage } from '@vueuse/core';
import { RouterLink } from 'vue-router';
const items = [
    { to: '/', label: 'Pusat Komando', icon: 'gauge-high', code: '01' },
    { to: '/vendors', label: 'Vendor', icon: 'building', code: '02' },
    { to: '/expos', label: 'Ekspo', icon: 'flag-checkered', code: '03' },
    { to: '/pdfs', label: 'Brosur PDF', icon: 'file-pdf', code: '04' },
    { to: '/runs', label: 'Riwayat Operasi', icon: 'clock-rotate-left', code: '05' },
    { to: '/diagnostik', label: 'Diagnostik', icon: 'heart-pulse', code: '06' },
    { to: '/orkestrator', label: 'Orkestrator', icon: 'circle-nodes', code: '07' },
    { to: '/konfigurasi', label: 'Konfigurasi', icon: 'sliders', code: '08' },
    { to: '/labs', label: 'Labs', icon: 'flask', code: '09' },
];
const collapsed = useStorage('autocrawl-sidebar-collapsed', true);
const __VLS_props = defineProps();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: ([
            'relative z-10 flex h-full shrink-0 flex-col transition-[width] duration-150',
            __VLS_ctx.collapsed ? 'w-14' : 'w-56',
            __VLS_ctx.transparent
                ? 'border-r border-accent-500/15 bg-base-950/55 backdrop-blur-xl'
                : 'border-r border-base-200 bg-white dark:border-base-700 dark:bg-base-900',
        ]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex h-12 shrink-0 items-center px-2" },
    ...{ class: ([
            __VLS_ctx.collapsed ? 'justify-center' : 'gap-3 px-3',
            __VLS_ctx.transparent
                ? 'border-b border-accent-500/15'
                : 'border-b border-base-200 dark:border-base-700',
        ]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent-600 bg-accent-500 text-base-950" },
});
const __VLS_0 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    icon: (['fas', 'crosshairs']),
    ...{ class: "text-xs" },
}));
const __VLS_2 = __VLS_1({
    icon: (['fas', 'crosshairs']),
    ...{ class: "text-xs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex min-w-0 flex-col leading-tight" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-xs font-semibold uppercase tracking-ops text-base-800 dark:text-base-100" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.items))) {
    const __VLS_4 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        key: (item.to),
        to: (item.to),
        custom: true,
    }));
    const __VLS_6 = __VLS_5({
        key: (item.to),
        to: (item.to),
        custom: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    {
        const { default: __VLS_thisSlot } = __VLS_7.slots;
        const [{ isActive, navigate }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (navigate) },
            ...{ class: ([
                    'group relative flex w-full items-center rounded-md font-mono text-2xs font-medium uppercase tracking-ops transition-colors',
                    __VLS_ctx.collapsed ? 'h-10 justify-center' : 'h-10 gap-3 px-2',
                    isActive
                        ? 'bg-accent-500/10 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                        : 'text-base-500 hover:bg-base-100 hover:text-base-800 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100',
                ]) },
            title: (__VLS_ctx.collapsed ? item.label : undefined),
        });
        if (isActive) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                ...{ class: "absolute left-0 top-0 h-full w-0.5 bg-accent-500" },
                'aria-hidden': "true",
            });
        }
        const __VLS_8 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            icon: (['fas', item.icon]),
            ...{ class: "text-sm" },
        }));
        const __VLS_10 = __VLS_9({
            icon: (['fas', item.icon]),
            ...{ class: "text-sm" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        if (!__VLS_ctx.collapsed) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "flex-1 truncate text-left" },
            });
            (item.label);
        }
        if (!__VLS_ctx.collapsed) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "font-mono text-2xs text-base-400 dark:text-base-600" },
            });
            (item.code);
        }
        __VLS_7.slots['' /* empty slot name completion */];
    }
    var __VLS_7;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.collapsed = !__VLS_ctx.collapsed;
        } },
    ...{ class: "m-1.5 flex h-8 items-center justify-center rounded-md border border-base-200 text-base-500 transition-colors hover:border-base-300 hover:bg-base-50 hover:text-base-800 dark:border-base-700 dark:text-base-400 dark:hover:border-base-600 dark:hover:bg-base-800 dark:hover:text-base-100" },
    ...{ class: (__VLS_ctx.collapsed ? '' : 'gap-2 px-2') },
    title: (__VLS_ctx.collapsed ? 'Buka' : 'Tutup'),
});
const __VLS_12 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    icon: (['fas', __VLS_ctx.collapsed ? 'angles-right' : 'angles-left']),
    ...{ class: "text-2xs" },
}));
const __VLS_14 = __VLS_13({
    icon: (['fas', __VLS_ctx.collapsed ? 'angles-right' : 'angles-left']),
    ...{ class: "text-2xs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops" },
    });
}
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-[width]']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-150']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-12']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['w-8']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-accent-600']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-accent-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-950']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['p-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-0']} */ ;
/** @type {__VLS_StyleScopedClasses['top-0']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['w-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-accent-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['m-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:border-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:hover:border-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:hover:bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:hover:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            items: items,
            collapsed: collapsed,
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
