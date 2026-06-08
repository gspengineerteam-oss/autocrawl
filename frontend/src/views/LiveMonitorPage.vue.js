/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import ChannelTile from '@/components/monitor/ChannelTile.vue';
import NowCrawling from '@/components/atlas/NowCrawling.vue';
import SystemOverview from '@/components/atlas/SystemOverview.vue';
import AgentTracePanel from '@/components/monitor/AgentTracePanel.vue';
/**
 * Pemantauan — Theater Morph archetype.
 *
 * Layout intent: ALL channels render simultaneously inside ONE positioned
 * theater container. One is the hero (large, left), the rest are thumbs
 * (column, right). Clicking Switch swaps roles; CSS transitions positions
 * over 700ms with Apple cubic-bezier, so the channels visually MORPH
 * between hero and thumbnail without unmount/remount. ChannelTile keeps
 * its websocket alive across the transition (no reconnect flicker).
 *
 * Caption block lives INSIDE the hero frame (bottom-left, gradient veil)
 * so the focus and label are anchored together as a single composition.
 *
 * Real data: /orchestrator/current + /orchestrator/throughput.
 */
const VNC_HOST = import.meta.env.VITE_VNC_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
const VNC_PASSWORD = import.meta.env.VITE_VNC_PASSWORD || 'secret';
const channels = ref([
    { code: 'CH-A', name: 'agentic-a · primary', port: 7900, wsPath: '/vnc-a/websockify', vncBase: '/vnc-a/', active: true },
    { code: 'CH-B', name: 'agentic-b · backup', port: 7901, wsPath: '/vnc-b/websockify', vncBase: '/vnc-b/', active: true },
]);
const heroIndex = ref(0);
const heroChannel = computed(() => channels.value[heroIndex.value]);
const switching = ref(false);
function switchHero() {
    if (channels.value.length < 2)
        return;
    switching.value = true;
    // Rotate hero to the next channel; CSS transitions handle the morph.
    heroIndex.value = (heroIndex.value + 1) % channels.value.length;
    setTimeout(() => { switching.value = false; }, 750);
}
function selectHero(idx) {
    if (idx === heroIndex.value)
        return;
    switching.value = true;
    heroIndex.value = idx;
    setTimeout(() => { switching.value = false; }, 750);
}
/* Position calc: hero takes the big slot; thumbs stack on the right rail. */
const tilePosition = (idx) => {
    if (idx === heroIndex.value) {
        return { role: 'hero', thumbOrder: -1 };
    }
    // Compute thumb order: channels before hero keep their idx, channels after
    // hero shift down by one. So thumbs are always a sequential 0..n-1 list.
    let order = 0;
    for (let i = 0; i < channels.value.length; i++) {
        if (i === heroIndex.value)
            continue;
        if (i === idx)
            break;
        order += 1;
    }
    return { role: 'thumb', thumbOrder: order };
};
const currentQ = useQuery({
    queryKey: ['orchestrator', 'current', 'monitor'],
    queryFn: api.orchestrator.current,
    refetchInterval: 3000,
});
const throughputQ = useQuery({
    queryKey: ['orchestrator', 'throughput', 'monitor'],
    queryFn: () => api.orchestrator.throughput(60),
    refetchInterval: 3000,
});
const captions = computed(() => {
    const stages = currentQ.data.value?.stages ?? [];
    const live = stages.filter((s) => s.in_flight_label);
    return channels.value.map((_ch, i) => {
        const stage = live[i % Math.max(1, live.length)];
        return stage?.in_flight_label ?? 'menunggu telemetri';
    });
});
const activeChannels = computed(() => channels.value.filter((c) => c.active));
const eventsPerMin = computed(() => Math.round((throughputQ.data.value?.events_per_minute ?? 0) * 10) / 10);
const workers = computed(() => throughputQ.data.value?.active_workers_total ?? 0);
const heroCaption = computed(() => captions.value[heroIndex.value] || 'menunggu telemetri');
function toggleChannel(idx) {
    channels.value[idx].active = !channels.value[idx].active;
}
function buildControlUrl(ch) {
    const params = new URLSearchParams({
        autoconnect: 'true',
        password: VNC_PASSWORD,
        resize: 'scale',
    });
    return `${ch.vncBase}vnc.html?${params.toString()}`;
}
function takeControl() {
    window.open(buildControlUrl(heroChannel.value), '_blank', 'noopener');
}
const formatNum = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n))
        return '—';
    return new Intl.NumberFormat('id-ID').format(n);
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['mon-tile__frame']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile--thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile__swap']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption__num']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile--hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activation']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__state']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__state']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-band__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-theater']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile--hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile--thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-band']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-canvas" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "mon-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-ticker fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "dot dot-amber dot-glow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mon-ticker__tag" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mon-ticker__msg" },
});
(__VLS_ctx.heroChannel.code);
(__VLS_ctx.heroChannel.name.toUpperCase());
(__VLS_ctx.heroCaption.toUpperCase());
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mon-ticker__stamp" },
});
(__VLS_ctx.activeChannels.length);
(__VLS_ctx.channels.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-theater" },
    ...{ class: ({ 'mon-theater--switching': __VLS_ctx.switching }) },
});
for (const [ch, idx] of __VLS_getVForSourceType((__VLS_ctx.channels))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (ch.code),
        ...{ class: ([
                'mon-tile',
                __VLS_ctx.tilePosition(idx).role === 'hero' ? 'mon-tile--hero' : 'mon-tile--thumb',
            ]) },
        ...{ style: ({
                '--thumb-order': __VLS_ctx.tilePosition(idx).thumbOrder,
            }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mon-tile__frame" },
    });
    /** @type {[typeof ChannelTile, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(ChannelTile, new ChannelTile({
        code: (ch.code),
        name: (ch.name),
        host: (__VLS_ctx.VNC_HOST),
        port: (ch.port),
        path: (ch.wsPath),
        vncBase: (ch.vncBase),
        password: (__VLS_ctx.VNC_PASSWORD),
        active: (ch.active),
        caption: (__VLS_ctx.captions[idx]),
        viewOnly: (true),
    }));
    const __VLS_1 = __VLS_0({
        code: (ch.code),
        name: (ch.name),
        host: (__VLS_ctx.VNC_HOST),
        port: (ch.port),
        path: (ch.wsPath),
        vncBase: (ch.vncBase),
        password: (__VLS_ctx.VNC_PASSWORD),
        active: (ch.active),
        caption: (__VLS_ctx.captions[idx]),
        viewOnly: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    if (__VLS_ctx.tilePosition(idx).role === 'thumb') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.tilePosition(idx).role === 'thumb'))
                        return;
                    __VLS_ctx.selectHero(idx);
                } },
            ...{ class: "mon-tile__swap" },
            type: "button",
            'aria-label': (`Tukar ke ${ch.code}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "mon-tile__swap-tag" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num" },
        });
        (ch.code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "mon-tile__swap-name" },
        });
        (ch.name.split('·')[0]);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "mon-tile__swap-cta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "12",
            height: "12",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.8",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M3 7h8M7 3l4 4-4 4",
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-caption" },
    key: (__VLS_ctx.heroChannel.code),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "mon-caption__veil" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-caption__body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow eyebrow-accent" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "live-dot" },
});
(__VLS_ctx.heroChannel.code);
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "mon-caption__num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num" },
});
(__VLS_ctx.formatNum(__VLS_ctx.eventsPerMin));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mon-caption__num-unit" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "mon-caption__sub" },
});
(__VLS_ctx.heroCaption);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-caption__cta" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.takeControl) },
    ...{ class: "btn btn-amber" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "btn-icon-nest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "1.8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 7h8M7 3l4 4-4 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.switchHero) },
    ...{ class: "btn" },
    disabled: (__VLS_ctx.channels.length < 2),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "btn-icon-nest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "1.8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 4h7M3 4l3-3M3 4l3 3M11 10H4M11 10l-3-3M11 10l-3 3",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "pill" },
});
(__VLS_ctx.workers);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-activation fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-activation__list" },
});
for (const [ch, i] of __VLS_getVForSourceType((__VLS_ctx.channels))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.toggleChannel(i);
            } },
        key: (ch.code),
        type: "button",
        ...{ class: "mon-activate" },
        ...{ class: ({ 'mon-activate--on': ch.active, 'mon-activate--hero': i === __VLS_ctx.heroIndex }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "mon-activate__box" },
        ...{ class: ({ 'mon-activate__box--on': ch.active }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mon-activate__code num" },
    });
    (ch.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mon-activate__name" },
    });
    (ch.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mon-activate__port num" },
    });
    (ch.port);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mon-activate__state num" },
    });
    (ch.active ? 'ON' : 'OFF');
}
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
    ...{ class: "mon-band" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-band__cell mon-band__cell--trace" },
});
/** @type {[typeof AgentTracePanel, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(AgentTracePanel, new AgentTracePanel({}));
const __VLS_4 = __VLS_3({}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-band__cell" },
});
/** @type {[typeof NowCrawling, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(NowCrawling, new NowCrawling({
    compact: (false),
}));
const __VLS_7 = __VLS_6({
    compact: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mon-band__cell" },
});
/** @type {[typeof SystemOverview, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(SystemOverview, new SystemOverview({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
/** @type {__VLS_StyleScopedClasses['mon-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-ticker__tag']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-ticker__msg']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-ticker__stamp']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-theater']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-theater--switching']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile__frame']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile__swap']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile__swap-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile__swap-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-tile__swap-cta']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption__veil']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption__body']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['live-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption__num-unit']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption__sub']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-caption__cta']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activation']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activation__list']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate--on']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate--hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__box']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__box--on']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__code']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__name']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__port']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-activate__state']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__rule']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-band']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-band__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-band__cell--trace']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-band__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['mon-band__cell']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ChannelTile: ChannelTile,
            NowCrawling: NowCrawling,
            SystemOverview: SystemOverview,
            AgentTracePanel: AgentTracePanel,
            VNC_HOST: VNC_HOST,
            VNC_PASSWORD: VNC_PASSWORD,
            channels: channels,
            heroIndex: heroIndex,
            heroChannel: heroChannel,
            switching: switching,
            switchHero: switchHero,
            selectHero: selectHero,
            tilePosition: tilePosition,
            captions: captions,
            activeChannels: activeChannels,
            eventsPerMin: eventsPerMin,
            workers: workers,
            heroCaption: heroCaption,
            toggleChannel: toggleChannel,
            takeControl: takeControl,
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
