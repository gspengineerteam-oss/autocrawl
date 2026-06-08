/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { useQuery } from '@tanstack/vue-query';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
const router = useRouter();
const auth = useAuthStore();
function handleLogout() {
    auth.logout();
    router.replace('/login');
}
/**
 * Pure icon-rail sidebar - no brand wordmark, just FontAwesome icons
 * stacked vertically. Active route gets a 2px amber bar on the left
 * edge + amber icon tint. Tooltip on hover shows the section label
 * with its live count.
 *
 * Reference layout matches this: sidebar is purely glyphic, brand
 * wordmark sits in the topbar to the right.
 */
const items = [
    { to: '/cari', label: 'Cari Semantik', icon: 'magnifying-glass' },
    { to: '/', label: 'Pusat Komando', icon: 'gauge-high' },
    { to: '/vendors', label: 'Katalog', icon: 'building', countKey: 'vendors' },
    { to: '/expos', label: 'Ekspo', icon: 'flag-checkered', countKey: 'expos' },
    { to: '/pdfs', label: 'Brosur', icon: 'file-pdf', countKey: 'pdfs' },
    { to: '/runs', label: 'Riwayat', icon: 'clock-rotate-left', countKey: 'runs' },
    { to: '/diagnostik', label: 'Diagnostik', icon: 'heart-pulse' },
    { to: '/orkestrator', label: 'Orkestrator', icon: 'circle-nodes' },
    { to: '/konfigurasi', label: 'Konfigurasi', icon: 'sliders' },
    { to: '/labs', label: 'Labs', icon: 'flask' },
    { to: '/pemantauan', label: 'Pemantauan', icon: 'tower-broadcast' },
];
const collapsed = useStorage('autocrawl-sidebar-collapsed', true);
const overview = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
    refetchInterval: 30000,
});
const runsList = useQuery({
    queryKey: ['runs', 'recent', 50],
    queryFn: () => api.runs(50),
    refetchInterval: 30000,
});
const counts = computed(() => ({
    vendors: overview.data.value?.vendors_total ?? null,
    expos: overview.data.value?.expos_total ?? null,
    pdfs: overview.data.value?.pdfs_total ?? null,
    runs: runsList.data.value?.total ?? runsList.data.value?.items?.length ?? null,
}));
function fmt(n) {
    if (n == null)
        return '—';
    if (n >= 1000)
        return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "autocrawl-sidebar bg-bg rule-r relative z-10 flex h-full shrink-0 flex-col transition-[width] duration-200" },
    ...{ class: (__VLS_ctx.collapsed ? 'w-[52px]' : 'w-[200px]') },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex shrink-0 items-center justify-center" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "block bg-amber" },
    ...{ class: (__VLS_ctx.collapsed ? 'w-[14px] h-[2px]' : 'w-[28px] h-[2px]') },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "flex flex-col py-2.5 gap-0.5" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.items))) {
    const __VLS_0 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        key: (item.to),
        to: (item.to),
        custom: true,
    }));
    const __VLS_2 = __VLS_1({
        key: (item.to),
        to: (item.to),
        custom: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    {
        const { default: __VLS_thisSlot } = __VLS_3.slots;
        const [{ isActive, navigate }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (navigate) },
            ...{ class: ([
                    'group relative flex h-9 w-full items-center transition-colors duration-150',
                    __VLS_ctx.collapsed ? 'justify-center px-0' : 'gap-3 px-4 text-left',
                ]) },
            title: (__VLS_ctx.collapsed ? item.label : undefined),
        });
        if (isActive) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                ...{ class: "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] bg-amber" },
                'aria-hidden': "true",
            });
        }
        else if (item.to === '/cari') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                ...{ class: "absolute left-0 top-1/2 -translate-y-1/2 h-3 w-[2px] bg-amber/60" },
                'aria-hidden': "true",
            });
        }
        const __VLS_4 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            icon: (['fas', item.icon]),
            ...{ class: "text-[13px] shrink-0 transition-colors" },
            ...{ class: (isActive
                    ? 'text-amber'
                    : item.to === '/cari'
                        ? 'text-amber/80 group-hover:text-amber'
                        : 'text-ink-mute group-hover:text-ink') },
        }));
        const __VLS_6 = __VLS_5({
            icon: (['fas', item.icon]),
            ...{ class: "text-[13px] shrink-0 transition-colors" },
            ...{ class: (isActive
                    ? 'text-amber'
                    : item.to === '/cari'
                        ? 'text-amber/80 group-hover:text-amber'
                        : 'text-ink-mute group-hover:text-ink') },
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        if (!__VLS_ctx.collapsed) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "flex-1 text-[12.5px] truncate transition-colors" },
                ...{ class: (isActive ? 'text-ink font-medium' : 'text-ink-2 group-hover:text-ink') },
            });
            (item.label);
            if (item.countKey) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "num-display text-[10.5px] tabular-nums" },
                    ...{ class: (isActive ? 'text-amber' : 'text-ink-mute') },
                });
                (__VLS_ctx.fmt(__VLS_ctx.counts[item.countKey]));
            }
        }
        __VLS_3.slots['' /* empty slot name completion */];
    }
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-t mx-2" },
});
if (__VLS_ctx.auth.isAuthenticated) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleLogout) },
        type: "button",
        ...{ class: "group flex h-9 w-full items-center transition-colors hover:bg-surface-2/50" },
        ...{ class: (__VLS_ctx.collapsed ? 'justify-center' : 'gap-3 px-4') },
        title: (__VLS_ctx.collapsed ? `Keluar (${__VLS_ctx.auth.user})` : 'Keluar dari console'),
    });
    const __VLS_8 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        icon: (['fas', 'right-from-bracket']),
        ...{ class: "text-[12px] text-ink-mute group-hover:text-amber transition-colors" },
    }));
    const __VLS_10 = __VLS_9({
        icon: (['fas', 'right-from-bracket']),
        ...{ class: "text-[12px] text-ink-mute group-hover:text-amber transition-colors" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    if (!__VLS_ctx.collapsed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "flex-1 text-left" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "block text-[10.5px] uppercase tracking-[0.12em] text-ink-mute leading-tight" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "block text-[12px] font-medium text-ink leading-tight" },
        });
        (__VLS_ctx.auth.user);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute group-hover:text-amber transition-colors" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-t mx-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.collapsed = !__VLS_ctx.collapsed;
        } },
    type: "button",
    ...{ class: "flex h-9 w-full items-center transition-colors hover:bg-surface-2/50 mb-1" },
    ...{ class: (__VLS_ctx.collapsed ? 'justify-center' : 'gap-3 px-4') },
    title: (__VLS_ctx.collapsed ? 'Buka sidebar' : 'Tutup sidebar'),
});
const __VLS_12 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    icon: (['fas', __VLS_ctx.collapsed ? 'angles-right' : 'angles-left']),
    ...{ class: "text-[11px] text-ink-mute" },
}));
const __VLS_14 = __VLS_13({
    icon: (['fas', __VLS_ctx.collapsed ? 'angles-right' : 'angles-left']),
    ...{ class: "text-[11px] text-ink-mute" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label" },
    });
}
/** @type {__VLS_StyleScopedClasses['autocrawl-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-r']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-[width]']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-150']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-0']} */ ;
/** @type {__VLS_StyleScopedClasses['top-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['-translate-y-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['h-5']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[2px]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-0']} */ ;
/** @type {__VLS_StyleScopedClasses['top-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['-translate-y-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['h-3']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[2px]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber/60']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-2']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2/50']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.12em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2/50']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            auth: auth,
            handleLogout: handleLogout,
            items: items,
            collapsed: collapsed,
            counts: counts,
            fmt: fmt,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
