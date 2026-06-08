/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
// Bottom-right "CD" enrich progress disc. Compact rest state, expandable on
// hover/focus. All numbers come from /api/system/enrich-progress — no
// synthesized values. Transform-only animations (no filter/blur) to keep
// continuous CPU pressure off the main thread.
//
// Rest size: 72px disc + thin spin ring (military / total).
// Expanded:  panel with queue depth, throughput buckets, scope breakdown.
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { RouterLink } from 'vue-router';
import { api } from '@/api/client';
const expanded = ref(false);
function toggle() { expanded.value = !expanded.value; }
const { data, isError } = useQuery({
    queryKey: ['system', 'enrich-progress'],
    queryFn: () => api.system.enrichProgress(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
});
const backlog = computed(() => data.value?.queue.backlog ?? null);
const inflight = computed(() => data.value?.queue.inflight ?? null);
const consumers = computed(() => data.value?.queue.consumers ?? null);
const consumedTotal = computed(() => data.value?.queue.consumed_total ?? null);
const last5m = computed(() => data.value?.throughput.classified_5m ?? null);
const last1h = computed(() => data.value?.throughput.classified_1h ?? null);
const today = computed(() => data.value?.throughput.classified_today ?? null);
const total = computed(() => data.value?.scope.total ?? null);
const military = computed(() => data.value?.scope.military_visible ?? null);
const hidden = computed(() => data.value?.scope.hidden_off_scope ?? null);
// Derive consumption rate between polls (per-second). Pin previous values
// in refs so we measure actual delta, not snapshot value.
const prevConsumed = ref(null);
const prevTs = ref(null);
const consumedDelta = ref(0);
const ratePerMin = ref(0);
watch(() => consumedTotal.value, (cur) => {
    if (cur == null)
        return;
    const now = Date.now();
    if (prevConsumed.value != null && prevTs.value != null && now > prevTs.value) {
        const dt = (now - prevTs.value) / 1000;
        const dCount = cur - prevConsumed.value;
        consumedDelta.value = dCount;
        ratePerMin.value = dt > 0 ? Math.round((dCount / dt) * 60) : 0;
    }
    prevConsumed.value = cur;
    prevTs.value = now;
}, { immediate: true });
// Outer ring = military / total catalog. Snowglobe coverage indicator.
const militaryPct = computed(() => {
    const t = total.value;
    const m = military.value;
    if (!t || m == null)
        return 0;
    return Math.min(100, Math.round((m / t) * 100));
});
// Inner ring = drain progress against backlog. If backlog > total, we just
// cap at 1 incoming wave (visualizes "how close to drained").
const drainPct = computed(() => {
    const t = total.value;
    const b = backlog.value;
    if (!t || b == null)
        return 100;
    return Math.max(0, Math.min(100, Math.round(((t - b) / t) * 100)));
});
const RADIUS_OUTER = 32;
const CIRC_OUTER = 2 * Math.PI * RADIUS_OUTER;
const RADIUS_INNER = 22;
const CIRC_INNER = 2 * Math.PI * RADIUS_INNER;
const outerDash = computed(() => {
    const filled = (militaryPct.value / 100) * CIRC_OUTER;
    return `${filled} ${CIRC_OUTER - filled}`;
});
const innerDash = computed(() => {
    const filled = (drainPct.value / 100) * CIRC_INNER;
    return `${filled} ${CIRC_INNER - filled}`;
});
const headline = computed(() => {
    const b = backlog.value;
    if (b == null)
        return '—';
    if (b >= 10_000)
        return `${(b / 1000).toFixed(0)}k`;
    if (b >= 1_000)
        return `${(b / 1000).toFixed(1)}k`;
    return String(b);
});
// "Live" = consumer ada + delta consumed positif sejak poll terakhir
const isLive = computed(() => !isError.value && (consumers.value ?? 0) > 0 && consumedDelta.value > 0);
const statusLabel = computed(() => {
    if (isError.value)
        return 'OFFLINE';
    if ((backlog.value ?? 0) === 0 && consumedDelta.value === 0)
        return 'IDLE';
    if (consumedDelta.value > 0)
        return 'ENRICHING';
    return 'QUEUED';
});
function fmt(n) {
    if (n == null)
        return '—';
    return n.toLocaleString();
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['enrich-disc__core']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__core']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__core']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__svg']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-close']} */ ;
/** @type {__VLS_StyleScopedClasses['cell']} */ ;
/** @type {__VLS_StyleScopedClasses['cell']} */ ;
/** @type {__VLS_StyleScopedClasses['cell']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill__dot']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "enrich-disc" },
    ...{ class: ({ 'is-expanded': __VLS_ctx.expanded, 'is-live': __VLS_ctx.isLive, 'is-error': __VLS_ctx.isError }) },
    role: "region",
    'aria-label': "Status enrich agentic",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggle) },
    type: "button",
    ...{ class: "enrich-disc__core" },
    title: (`Backlog: ${__VLS_ctx.fmt(__VLS_ctx.backlog)} · ${__VLS_ctx.ratePerMin}/menit · klik buat detail`),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 80 80",
    ...{ class: "enrich-disc__svg" },
    ...{ class: ({ 'is-spinning': __VLS_ctx.isLive && !__VLS_ctx.expanded }) },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "40",
    cy: "40",
    r: "36",
    ...{ class: "ring-track ring-track--outer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "40",
    cy: "40",
    r: "32",
    ...{ class: "ring-track ring-track--mid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "40",
    cy: "40",
    r: "22",
    ...{ class: "ring-track ring-track--inner" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "40",
    cy: "40",
    r: (__VLS_ctx.RADIUS_OUTER),
    ...{ class: "ring-arc ring-arc--outer" },
    'stroke-dasharray': (__VLS_ctx.outerDash),
    'stroke-dashoffset': "0",
    transform: "rotate(-90 40 40)",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "40",
    cy: "40",
    r: (__VLS_ctx.RADIUS_INNER),
    ...{ class: "ring-arc ring-arc--inner" },
    'stroke-dasharray': (__VLS_ctx.innerDash),
    'stroke-dashoffset': "0",
    transform: "rotate(-90 40 40)",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "40",
    cy: "40",
    r: "7",
    ...{ class: "hub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "40",
    cy: "40",
    r: "2.5",
    ...{ class: "hub-bore" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "enrich-disc__num num-display" },
});
(__VLS_ctx.headline);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "enrich-disc__pulse" },
    'data-status': (__VLS_ctx.statusLabel),
});
const __VLS_0 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    name: "disc-panel",
}));
const __VLS_2 = __VLS_1({
    name: "disc-panel",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.expanded) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "enrich-disc__panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "panel-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-amber" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.toggle) },
        type: "button",
        ...{ class: "btn-close" },
        'aria-label': "Tutup",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({
        ...{ class: "panel-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
        ...{ class: "num-display" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.backlog));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sub" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
        ...{ class: "num-display" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.inflight));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sub" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.consumers));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
        ...{ class: "num-display" },
    });
    (__VLS_ctx.ratePerMin);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sub" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
        ...{ class: "num-display" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.consumedTotal));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sub" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scope-bar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scope-bar__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "scope-bar__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display scope-bar__val num-amber" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.military));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scope-bar__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "scope-bar__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display scope-bar__val text-ink-mute" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.hidden));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scope-bar__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "scope-bar__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display scope-bar__val" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.total));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scope-bar__row scope-bar__row--today" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "scope-bar__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display scope-bar__val" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.last5m));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scope-bar__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "scope-bar__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display scope-bar__val" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.last1h));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "scope-bar__row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "scope-bar__label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display scope-bar__val" },
    });
    (__VLS_ctx.fmt(__VLS_ctx.today));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "panel-foot" },
    });
    const __VLS_4 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        to: "/diagnostik",
        ...{ class: "btn btn-ghost btn-sm" },
    }));
    const __VLS_6 = __VLS_5({
        to: "/diagnostik",
        ...{ class: "btn btn-ghost btn-sm" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    var __VLS_7;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill" },
        'data-status': (__VLS_ctx.statusLabel),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill__dot" },
    });
    (__VLS_ctx.statusLabel);
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['enrich-disc']} */ ;
/** @type {__VLS_StyleScopedClasses['is-expanded']} */ ;
/** @type {__VLS_StyleScopedClasses['is-live']} */ ;
/** @type {__VLS_StyleScopedClasses['is-error']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__core']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__svg']} */ ;
/** @type {__VLS_StyleScopedClasses['is-spinning']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-track']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-track--outer']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-track']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-track--mid']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-track']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-track--inner']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-arc']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-arc--outer']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-arc']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-arc--inner']} */ ;
/** @type {__VLS_StyleScopedClasses['hub']} */ ;
/** @type {__VLS_StyleScopedClasses['hub-bore']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['enrich-disc__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-close']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['cell']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['sub']} */ ;
/** @type {__VLS_StyleScopedClasses['cell']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['sub']} */ ;
/** @type {__VLS_StyleScopedClasses['cell']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['sub']} */ ;
/** @type {__VLS_StyleScopedClasses['cell']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['sub']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__row']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__val']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__row']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__val']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__row']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__val']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__row']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__row--today']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__val']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__row']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__val']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__row']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-bar__val']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-foot']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill__dot']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            expanded: expanded,
            toggle: toggle,
            isError: isError,
            backlog: backlog,
            inflight: inflight,
            consumers: consumers,
            consumedTotal: consumedTotal,
            last5m: last5m,
            last1h: last1h,
            today: today,
            total: total,
            military: military,
            hidden: hidden,
            ratePerMin: ratePerMin,
            RADIUS_OUTER: RADIUS_OUTER,
            RADIUS_INNER: RADIUS_INNER,
            outerDash: outerDash,
            innerDash: innerDash,
            headline: headline,
            isLive: isLive,
            statusLabel: statusLabel,
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
