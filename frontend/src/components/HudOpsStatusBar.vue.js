/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import HudPanel from './HudPanel.vue';
import HudStatusPill from './HudStatusPill.vue';
import HudCompletenessBar from './HudCompletenessBar.vue';
const currentQ = useQuery({
    queryKey: ['ops', 'current'],
    queryFn: api.orchestrator.current,
    refetchInterval: 2000,
});
const overviewQ = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
    refetchInterval: 5000,
});
const refsQ = useQuery({
    queryKey: ['exhibitor-refs', 'stats'],
    queryFn: api.exhibitorRefs.stats,
    refetchInterval: 5000,
});
const isRunning = computed(() => Boolean(currentQ.data.value?.active_run));
const runMode = computed(() => currentQ.data.value?.active_run?.mode?.toUpperCase() ?? 'IDLE');
const runDuration = computed(() => {
    const sec = currentQ.data.value?.active_run?.duration_seconds ?? 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});
const phase2Pct = computed(() => overviewQ.data.value?.phase_2_progress_ratio ?? 0);
const phase2Threshold = computed(() => overviewQ.data.value?.phase_2_threshold ?? 100);
const enrichedNow = computed(() => Math.round(phase2Pct.value * phase2Threshold.value));
const counters = computed(() => ({
    vendor: overviewQ.data.value?.vendors_total ?? 0,
    ekspo: overviewQ.data.value?.expos_total ?? 0,
    pdf: overviewQ.data.value?.pdfs_total ?? 0,
    refs: refsQ.data.value?.total ?? 0,
}));
function modeTone(m) {
    if (m === 'AGGRESSIVE')
        return 'crit';
    if (m === 'NORMAL')
        return 'accent';
    if (m === 'DEV')
        return 'info';
    return 'muted';
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Status Operasi",
    code: "OPS-STATUS",
}));
const __VLS_1 = __VLS_0({
    title: "Status Operasi",
    code: "OPS-STATUS",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-2xs text-base-400 dark:text-base-500" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid grid-cols-1 gap-3 md:grid-cols-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2 border-r-0 pr-0 md:border-r md:border-base-200 md:pr-3 md:dark:border-base-700" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
});
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.isRunning ? 'warn' : 'muted'),
    label: (__VLS_ctx.isRunning ? 'OPS BERJALAN' : 'IDLE'),
    pulse: (__VLS_ctx.isRunning),
}));
const __VLS_5 = __VLS_4({
    tone: (__VLS_ctx.isRunning ? 'warn' : 'muted'),
    label: (__VLS_ctx.isRunning ? 'OPS BERJALAN' : 'IDLE'),
    pulse: (__VLS_ctx.isRunning),
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-baseline justify-between gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-base font-semibold text-base-800 dark:text-base-100" },
});
(__VLS_ctx.runDuration);
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.modeTone(__VLS_ctx.runMode)),
    label: (__VLS_ctx.runMode),
}));
const __VLS_8 = __VLS_7({
    tone: (__VLS_ctx.modeTone(__VLS_ctx.runMode)),
    label: (__VLS_ctx.runMode),
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
if (__VLS_ctx.currentQ.data.value?.active_run) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num truncate text-2xs text-base-400 dark:text-base-500" },
        title: (__VLS_ctx.currentQ.data.value.active_run.started_at),
    });
    (__VLS_ctx.currentQ.data.value.active_run.started_at.slice(11, 19));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2 border-r-0 pr-0 md:border-r md:border-base-200 md:pr-3 md:dark:border-base-700" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-2xs text-base-600 dark:text-base-300" },
});
(__VLS_ctx.enrichedNow);
(__VLS_ctx.phase2Threshold);
/** @type {[typeof HudCompletenessBar, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(HudCompletenessBar, new HudCompletenessBar({
    score: (Math.min(1, __VLS_ctx.phase2Pct)),
    showLabel: true,
}));
const __VLS_11 = __VLS_10({
    score: (Math.min(1, __VLS_ctx.phase2Pct)),
    showLabel: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs text-base-400 dark:text-base-500" },
});
(__VLS_ctx.phase2Threshold);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid grid-cols-4 gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-sm font-semibold text-accent-600 dark:text-accent-300" },
});
(__VLS_ctx.counters.vendor);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-sm font-semibold text-info-600 dark:text-info-400" },
});
(__VLS_ctx.counters.ekspo);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-sm font-semibold text-base-700 dark:text-base-200" },
});
(__VLS_ctx.counters.pdf);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-sm font-semibold text-warn-600 dark:text-warn-400" },
});
(__VLS_ctx.counters.refs);
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border-r-0']} */ ;
/** @type {__VLS_StyleScopedClasses['pr-0']} */ ;
/** @type {__VLS_StyleScopedClasses['md:border-r']} */ ;
/** @type {__VLS_StyleScopedClasses['md:border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['md:pr-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border-r-0']} */ ;
/** @type {__VLS_StyleScopedClasses['pr-0']} */ ;
/** @type {__VLS_StyleScopedClasses['md:border-r']} */ ;
/** @type {__VLS_StyleScopedClasses['md:border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['md:pr-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-4']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-accent-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-accent-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-info-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-info-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warn-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-warn-400']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudPanel: HudPanel,
            HudStatusPill: HudStatusPill,
            HudCompletenessBar: HudCompletenessBar,
            currentQ: currentQ,
            isRunning: isRunning,
            runMode: runMode,
            runDuration: runDuration,
            phase2Pct: phase2Pct,
            phase2Threshold: phase2Threshold,
            enrichedNow: enrichedNow,
            counters: counters,
            modeTone: modeTone,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
