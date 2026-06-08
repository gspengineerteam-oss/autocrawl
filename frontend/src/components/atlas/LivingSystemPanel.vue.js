/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import { useNumberTicker } from '@/composables/useNumberTicker';
/**
 * LivingSystemPanel — operator-console widget that surfaces the
 * orchestrator's real-time pulse on top of the map.
 *
 * REAL DATA ONLY. Every field comes from a backend endpoint:
 *   - active workers, vendors/min, errors/min, by_node breakdown
 *     ← /orchestrator/throughput  (poll 3s)
 *   - active_run.mode + status, current stage in-flight labels
 *     ← /orchestrator/current     (poll 3s)
 *   - events_observed total
 *     ← /orchestrator/state       (poll 5s)
 *
 * No synthesized commentary. Only raw labeled metrics.
 */
const throughput = useQuery({
    queryKey: ['orchestrator', 'throughput'],
    queryFn: () => api.orchestrator.throughput(60),
    refetchInterval: 3000,
});
const current = useQuery({
    queryKey: ['orchestrator', 'current'],
    queryFn: api.orchestrator.current,
    refetchInterval: 3000,
});
const state = useQuery({
    queryKey: ['orchestrator', 'state'],
    queryFn: api.orchestrator.state,
    refetchInterval: 5000,
});
const tp = computed(() => throughput.data.value);
const cur = computed(() => current.data.value);
const st = computed(() => state.data.value);
const workers = computed(() => tp.value?.active_workers_total ?? 0);
const vpm = computed(() => Math.round((tp.value?.vendors_per_minute ?? 0) * 10) / 10);
const epm = computed(() => Math.round((tp.value?.events_per_minute ?? 0) * 10) / 10);
const errpm = computed(() => Math.round((tp.value?.errors_per_minute ?? 0) * 10) / 10);
const eventsObserved = computed(() => st.value?.events_observed ?? 0);
const tickedWorkers = useNumberTicker(workers, { duration: 240 });
const tickedEvents = useNumberTicker(eventsObserved, { duration: 360 });
const activeStages = computed(() => {
    const stages = cur.value?.stages ?? [];
    return stages.filter((s) => s.active > 0 || s.in_flight_label);
});
const runMode = computed(() => cur.value?.active_run?.mode ?? null);
const runDuration = computed(() => {
    const sec = cur.value?.active_run?.duration_seconds ?? 0;
    if (!sec)
        return null;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h > 0 ? `${h}j ${m}m` : m > 0 ? `${m}m ${s}d` : `${s}d`;
});
const isLive = computed(() => Boolean(cur.value?.active_run));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "lsp card bg-paper/92 backdrop-blur-md p-3.5 w-[256px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "flex items-baseline justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "dot" },
    ...{ class: (__VLS_ctx.isLive ? 'dot-vermilion ink-blink' : 'dot-accent') },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
});
(__VLS_ctx.isLive ? 'Live' : 'Tenang');
if (__VLS_ctx.runMode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label-mono text-[0.625rem]" },
    });
    (__VLS_ctx.runMode.toUpperCase());
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({
    ...{ class: "mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[1.5rem] leading-none" },
});
(__VLS_ctx.tickedWorkers);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[1.5rem] leading-none" },
});
(__VLS_ctx.vpm);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[1rem] leading-none" },
});
(__VLS_ctx.epm);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({
    ...{ class: "label block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
    ...{ class: "num-display text-[1rem] leading-none" },
    ...{ class: (__VLS_ctx.errpm > 0 ? 'text-vermilion' : '') },
});
(__VLS_ctx.errpm);
if (__VLS_ctx.activeStages.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-t mt-3 pt-2.5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label block mb-1.5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "space-y-1" },
    });
    for (const [stage] of __VLS_getVForSourceType((__VLS_ctx.activeStages.slice(0, 3)))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (stage.code),
            ...{ class: "flex items-baseline gap-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-mono text-[0.625rem] tracking-[0.14em] text-ink-mute w-7 shrink-0" },
        });
        (stage.code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num-display text-[0.875rem] w-5 shrink-0" },
        });
        (stage.active);
        if (stage.in_flight_label) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-[0.75rem] text-ink-2 truncate" },
                title: (stage.in_flight_label),
            });
            (stage.in_flight_label);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-[0.75rem] text-ink-mute" },
            });
            (stage.label);
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-t mt-3 pt-2 flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label-mono text-[0.625rem]" },
});
(__VLS_ctx.tickedEvents.toLocaleString());
if (__VLS_ctx.runDuration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label-mono text-[0.625rem]" },
    });
    (__VLS_ctx.runDuration);
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label-mono text-[0.625rem]" },
    });
}
/** @type {__VLS_StyleScopedClasses['lsp']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-paper/92']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-md']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3.5']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[256px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-x-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1.5rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1.5rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[1rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.14em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['w-7']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.875rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-5']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.75rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.75rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[0.625rem]']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            vpm: vpm,
            epm: epm,
            errpm: errpm,
            tickedWorkers: tickedWorkers,
            tickedEvents: tickedEvents,
            activeStages: activeStages,
            runMode: runMode,
            runDuration: runDuration,
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
