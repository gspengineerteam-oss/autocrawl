/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import HudPanel from './HudPanel.vue';
const tpQ = useQuery({
    queryKey: ['ops', 'throughput'],
    queryFn: () => api.orchestrator.throughput(60),
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
});
const data = computed(() => tpQ.data.value);
const byNodeBars = computed(() => {
    const bn = data.value?.by_node ?? {};
    const max = Math.max(0.01, ...Object.values(bn));
    const order = [
        'discover',
        'worker_extract',
        'worker_pdf_extract',
        'worker_resolve',
        'worker_enrich',
        'finalize',
    ];
    return order.map((node) => ({
        node,
        code: nodeCode(node),
        rate: bn[node] ?? 0,
        pct: ((bn[node] ?? 0) / max) * 100,
    }));
});
function nodeCode(node) {
    if (node === 'discover')
        return '01 DSC';
    if (node === 'worker_extract')
        return '02A XTR';
    if (node === 'worker_pdf_extract')
        return '02B PDF';
    if (node === 'worker_resolve')
        return '03 RSV';
    if (node === 'worker_enrich')
        return '04 ENR';
    if (node === 'finalize')
        return '05 FIN';
    return node;
}
function formatWindow(seconds) {
    if (!seconds)
        return '—';
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400)
        return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}
function formatAgo(unix, now) {
    if (!unix)
        return 'belum ada';
    const ago = Math.max(0, (now ?? Date.now() / 1000) - unix);
    if (ago < 60)
        return `${Math.floor(ago)}s lalu`;
    if (ago < 3600)
        return `${Math.floor(ago / 60)}m lalu`;
    if (ago < 86400)
        return `${Math.floor(ago / 3600)}h lalu`;
    return `${Math.floor(ago / 86400)}d lalu`;
}
const windowLabel = computed(() => {
    const eff = data.value?.effective_window_seconds;
    const isFallback = data.value?.fallback_used;
    return `${formatWindow(eff)}${isFallback ? ' • fallback' : ''}`;
});
const lastEventLabel = computed(() => formatAgo(data.value?.last_event_at, data.value?.now));
const isLive = computed(() => {
    const last = data.value?.last_event_at;
    const now = data.value?.now ?? Date.now() / 1000;
    if (!last)
        return false;
    return now - last < 30;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Throughput",
    code: "OPS-RATE",
}));
const __VLS_1 = __VLS_0({
    title: "Throughput",
    code: "OPS-RATE",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-2xs" },
        ...{ class: (__VLS_ctx.isLive ? 'text-ok-600 dark:text-ok-400' : 'text-base-400 dark:text-base-500') },
    });
    (__VLS_ctx.isLive ? '● LIVE' : '○ IDLE');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-2xs text-base-400 dark:text-base-500" },
    });
    (__VLS_ctx.windowLabel);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid grid-cols-2 gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-xl font-semibold text-ok-600 dark:text-ok-400" },
});
(__VLS_ctx.data?.vendors_per_minute?.toFixed(1) ?? '0.0');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-xl font-semibold" },
    ...{ class: ((__VLS_ctx.data?.errors_per_minute ?? 0) > 0 ? 'text-crit-600 dark:text-crit-400' : 'text-base-500 dark:text-base-400') },
});
(__VLS_ctx.data?.errors_per_minute?.toFixed(1) ?? '0.0');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-xl font-semibold text-info-600 dark:text-info-400" },
});
(__VLS_ctx.data?.events_per_minute?.toFixed(1) ?? '0.0');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-xl font-semibold" },
    ...{ class: ((__VLS_ctx.data?.active_workers_total ?? 0) > 0 ? 'text-warn-600 dark:text-warn-400' : 'text-base-500 dark:text-base-400') },
});
(__VLS_ctx.data?.active_workers_total ?? 0);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between border border-base-200 bg-base-50/50 px-2 py-1 dark:border-base-700 dark:bg-base-900/50" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-2xs text-base-700 dark:text-base-200" },
});
(__VLS_ctx.lastEventLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-1.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
(__VLS_ctx.formatWindow(__VLS_ctx.data?.effective_window_seconds));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-1" },
});
for (const [bar] of __VLS_getVForSourceType((__VLS_ctx.byNodeBars))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (bar.node),
        ...{ class: "flex items-center gap-1.5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num w-16 text-2xs text-base-500 dark:text-base-400" },
    });
    (bar.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "relative h-2.5 flex-1 border border-base-200 bg-base-50 dark:border-base-700 dark:bg-base-900" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "h-full bg-accent-500/70" },
        ...{ style: ({ width: `${bar.pct}%` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num w-10 text-right text-2xs text-base-600 dark:text-base-300" },
    });
    (bar.rate.toFixed(1));
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ok-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-ok-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-info-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-info-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50/50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900/50']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['w-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-accent-500/70']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['w-10']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-300']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudPanel: HudPanel,
            data: data,
            byNodeBars: byNodeBars,
            formatWindow: formatWindow,
            windowLabel: windowLabel,
            lastEventLabel: lastEventLabel,
            isLive: isLive,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
