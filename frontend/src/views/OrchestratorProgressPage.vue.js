/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import HudOpsStatusBar from '@/components/HudOpsStatusBar.vue';
import HudOpsCurrentActivity from '@/components/HudOpsCurrentActivity.vue';
import HudOpsThroughput from '@/components/HudOpsThroughput.vue';
import HudOpsTimeline from '@/components/HudOpsTimeline.vue';
import HudOpsErrorInbox from '@/components/HudOpsErrorInbox.vue';
/**
 * Orkestrator — Console archetype, cinematic vertical stage rail.
 *
 * Layout intent: a hero strip declares the current run with cinema-scale
 * exhibitor count + run mode. Below it, a two-column live console:
 * LEFT 5-col the vertical stage rail (HudOpsCurrentActivity) — pipeline
 * progression top-to-bottom. RIGHT 7-col stacked telemetry: throughput
 * sparkline, timeline ribbon, error inbox. All chrome is gold-accented
 * Geist; numbers are Geist tabular.
 *
 * Real data: /orchestrator/state + /orchestrator/throughput + the
 * existing HudOps* components which already wire their own backend.
 */
const stateQ = useQuery({
    queryKey: ['orchestrator', 'state', 'hero'],
    queryFn: api.orchestrator.state,
    refetchInterval: 4000,
});
const throughputQ = useQuery({
    queryKey: ['orchestrator', 'throughput', 'hero'],
    queryFn: () => api.orchestrator.throughput(60),
    refetchInterval: 4000,
});
const currentQ = useQuery({
    queryKey: ['orchestrator', 'current', 'hero'],
    queryFn: api.orchestrator.current,
    refetchInterval: 4000,
});
const runState = computed(() => stateQ.data.value);
const runMode = computed(() => {
    const r = runState.value;
    return r?.mode
        ?? currentQ.data.value?.mode
        ?? null;
});
const isLive = computed(() => {
    const r = runState.value;
    const status = r?.status ?? '';
    return status === 'running' || status === 'live' || status === 'active';
});
const exhibitorsExtracted = computed(() => {
    const r = runState.value;
    return r?.exhibitors_extracted ?? null;
});
const vendorsResolved = computed(() => {
    const r = runState.value;
    return r?.vendors_resolved ?? null;
});
const failures = computed(() => {
    const r = runState.value;
    return r?.failures ?? null;
});
const eventsPerMin = computed(() => Math.round((throughputQ.data.value?.events_per_minute ?? 0) * 10) / 10);
const workers = computed(() => throughputQ.data.value?.active_workers_total ?? 0);
const formatNum = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n))
        return '—';
    return new Intl.NumberFormat('id-ID').format(n);
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['orch-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__status']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-console__stage']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-console__stage']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-stack__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__num-row']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-console']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-canvas" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "orch-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__ticker fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "dot" },
    ...{ class: (__VLS_ctx.isLive ? 'dot-amber dot-glow' : 'dot-mute') },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-tag" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-msg" },
});
(__VLS_ctx.runMode ? __VLS_ctx.runMode.toUpperCase() : 'IDLE');
(__VLS_ctx.workers);
(__VLS_ctx.formatNum(__VLS_ctx.eventsPerMin));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-stamp" },
});
(new Date().toISOString().slice(11, 19));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__stencil fade-up" },
    ...{ style: {} },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__cinema fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow eyebrow-accent" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__num-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "orch-hero__num" },
});
(__VLS_ctx.formatNum(__VLS_ctx.exhibitorsExtracted));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__sub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__sub-stat" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "num text-ink" },
    ...{ style: {} },
});
(__VLS_ctx.formatNum(__VLS_ctx.vendorsResolved));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__sub-stat" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "num text-amber" },
    ...{ style: {} },
});
(__VLS_ctx.formatNum(__VLS_ctx.failures));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-hero__status fade-up" },
    ...{ style: {} },
});
/** @type {[typeof HudOpsStatusBar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudOpsStatusBar, new HudOpsStatusBar({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atlas-section-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-section-mark__num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "atlas-section-mark__rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atlas-section-mark__title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "display-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "orch-console" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-console__stage" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bezel bezel-lg h-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bezel-core h-full" },
});
/** @type {[typeof HudOpsCurrentActivity, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(HudOpsCurrentActivity, new HudOpsCurrentActivity({}));
const __VLS_4 = __VLS_3({}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-console__stack" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-stack__cell" },
});
/** @type {[typeof HudOpsThroughput, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(HudOpsThroughput, new HudOpsThroughput({}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-stack__cell" },
});
/** @type {[typeof HudOpsTimeline, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(HudOpsTimeline, new HudOpsTimeline({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "orch-stack__cell" },
});
/** @type {[typeof HudOpsErrorInbox, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(HudOpsErrorInbox, new HudOpsErrorInbox({}));
const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
/** @type {__VLS_StyleScopedClasses['orch-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-stamp']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__cinema']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__num-row']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__num']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__sub-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__sub-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-hero__status']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__rule']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-console']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-console__stage']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-core']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-console__stack']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-stack__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-stack__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['orch-stack__cell']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudOpsStatusBar: HudOpsStatusBar,
            HudOpsCurrentActivity: HudOpsCurrentActivity,
            HudOpsThroughput: HudOpsThroughput,
            HudOpsTimeline: HudOpsTimeline,
            HudOpsErrorInbox: HudOpsErrorInbox,
            runMode: runMode,
            isLive: isLive,
            exhibitorsExtracted: exhibitorsExtracted,
            vendorsResolved: vendorsResolved,
            failures: failures,
            eventsPerMin: eventsPerMin,
            workers: workers,
            formatNum: formatNum,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
