/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { RouterLink } from 'vue-router';
const __VLS_props = defineProps();
function sourceMeta(v) {
    const types = new Set((v.source_trail ?? []).map((s) => s.type));
    if (types.has('pdf'))
        return { label: 'PDF', tone: 'crit', icon: 'file-pdf' };
    if (types.has('aggregator'))
        return { label: 'AGR', tone: 'info', icon: 'globe' };
    if (types.has('search'))
        return { label: 'SRC', tone: 'accent', icon: 'magnifying-glass' };
    return { label: 'MAN', tone: 'muted', icon: 'circle-info' };
}
function relativeTime(iso) {
    if (!iso)
        return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
        return 'baru saja';
    if (mins < 60)
        return `${mins}m lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}j lalu`;
    const days = Math.floor(hours / 24);
    if (days < 30)
        return `${days}h lalu`;
    const months = Math.floor(days / 30);
    return `${months}bln lalu`;
}
function pillClass(tone) {
    switch (tone) {
        case 'crit':
            return 'hud-pill-crit';
        case 'info':
            return 'hud-pill-info';
        case 'accent':
            return 'hud-pill-accent';
        default:
            return 'hud-pill-muted';
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col divide-y divide-base-100 dark:divide-base-800" },
});
for (const [v] of __VLS_getVForSourceType((__VLS_ctx.vendors))) {
    const __VLS_0 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        key: (v.vendor_id || v.domain || v.company_name),
        to: (`/vendors/${v.vendor_id || v.domain || ''}`),
        ...{ class: "block px-3 py-2.5 transition-colors hover:bg-accent-500/5 dark:hover:bg-accent-500/10" },
    }));
    const __VLS_2 = __VLS_1({
        key: (v.vendor_id || v.domain || v.company_name),
        to: (`/vendors/${v.vendor_id || v.domain || ''}`),
        ...{ class: "block px-3 py-2.5 transition-colors hover:bg-accent-500/5 dark:hover:bg-accent-500/10" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-start gap-2.5" },
    });
    if (!v.logo_url) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "flex h-8 w-8 shrink-0 items-center justify-center border border-base-200 bg-base-50 font-mono text-xs font-semibold text-base-700 dark:border-base-700 dark:bg-base-800 dark:text-base-200" },
        });
        (v.company_name.charAt(0).toUpperCase());
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (v.logo_url),
            alt: (v.company_name),
            ...{ class: "h-8 w-8 shrink-0 border border-base-200 bg-white object-contain p-0.5 dark:border-base-700 dark:bg-base-800" },
            referrerpolicy: "no-referrer",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "min-w-0 flex-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "truncate text-sm font-medium text-base-800 dark:text-base-100" },
    });
    (v.company_name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num truncate font-mono text-2xs text-base-400 dark:text-base-500" },
    });
    (v.domain);
    if (v.tagline || v.description) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "mt-1 line-clamp-1 text-xs text-base-500 dark:text-base-400" },
        });
        (v.tagline || (v.description ?? '').slice(0, 100));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mt-1.5 flex items-center gap-2 font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: (__VLS_ctx.pillClass(__VLS_ctx.sourceMeta(v).tone)) },
    });
    const __VLS_4 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        icon: (['fas', __VLS_ctx.sourceMeta(v).icon]),
        ...{ class: "text-[8px]" },
    }));
    const __VLS_6 = __VLS_5({
        icon: (['fas', __VLS_ctx.sourceMeta(v).icon]),
        ...{ class: "text-[8px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    (__VLS_ctx.sourceMeta(v).label);
    if (v.address?.country) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "flex items-center gap-1" },
        });
        const __VLS_8 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            icon: (['fas', 'location-dot']),
            ...{ class: "text-[8px]" },
        }));
        const __VLS_10 = __VLS_9({
            icon: (['fas', 'location-dot']),
            ...{ class: "text-[8px]" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        (v.address.country);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ml-auto" },
    });
    (__VLS_ctx.relativeTime(v.last_enriched_at));
    var __VLS_3;
}
if (!__VLS_ctx.vendors.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "p-6 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
    });
}
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-y']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:divide-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-accent-500/5']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:hover:bg-accent-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['w-8']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['w-8']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['object-contain']} */ ;
/** @type {__VLS_StyleScopedClasses['p-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['line-clamp-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[8px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[8px]']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            sourceMeta: sourceMeta,
            relativeTime: relativeTime,
            pillClass: pillClass,
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
