/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import { humanizeEvent } from '@/composables/useEventHumanizer';
import HudPanel from './HudPanel.vue';
import HudStatusPill from './HudStatusPill.vue';
const MAX_EVENTS = 200;
const since = ref('0');
const events = ref([]);
const eventsQ = useQuery({
    queryKey: ['ops', 'timeline', since],
    queryFn: () => api.orchestrator.events(since.value, 50),
    refetchInterval: 1500,
});
watch(() => eventsQ.data.value, (resp) => {
    if (!resp)
        return;
    if (resp.events.length > 0) {
        events.value = [...resp.events.slice().reverse(), ...events.value].slice(0, MAX_EVENTS);
        since.value = resp.next_since;
    }
});
const rendered = computed(() => events.value.map((ev) => ({
    raw: ev,
    h: humanizeEvent(ev),
})));
function formatRelTime(ts) {
    const tsMs = ts > 1e12 ? ts : ts * 1000;
    const diff = (Date.now() - tsMs) / 1000;
    if (diff < 1)
        return 'baru saja';
    if (diff < 60)
        return `${Math.floor(diff)}s lalu`;
    if (diff < 3600)
        return `${Math.floor(diff / 60)}m lalu`;
    return `${Math.floor(diff / 3600)}j lalu`;
}
function payloadJson(ev) {
    try {
        return JSON.stringify(ev.payload, null, 2);
    }
    catch {
        return String(ev.payload);
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Aktivitas Live",
    code: "OPS-FEED",
}));
const __VLS_1 = __VLS_0({
    title: "Aktivitas Live",
    code: "OPS-FEED",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    /** @type {[typeof HudStatusPill, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
        tone: "accent",
        label: (`${__VLS_ctx.events.length} EVENT`),
    }));
    const __VLS_5 = __VLS_4({
        tone: "accent",
        label: (`${__VLS_ctx.events.length} EVENT`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-2xs text-base-400 dark:text-base-500" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex max-h-[560px] flex-col divide-y divide-base-100 overflow-y-auto pr-1 dark:divide-base-800" },
});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.rendered))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (row.raw.id),
        ...{ class: "flex items-start gap-2 py-1.5 first:pt-0" },
        title: (__VLS_ctx.payloadJson(row.raw)),
    });
    const __VLS_7 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
        icon: (['fas', row.h.icon]),
        ...{ class: "mt-0.5 text-2xs" },
        ...{ class: ({
                'text-ok-500': row.h.tone === 'ok',
                'text-warn-500': row.h.tone === 'warn',
                'text-crit-500': row.h.tone === 'crit',
                'text-info-500': row.h.tone === 'info',
                'text-base-400 dark:text-base-500': row.h.tone === 'muted',
            }) },
    }));
    const __VLS_9 = __VLS_8({
        icon: (['fas', row.h.icon]),
        ...{ class: "mt-0.5 text-2xs" },
        ...{ class: ({
                'text-ok-500': row.h.tone === 'ok',
                'text-warn-500': row.h.tone === 'warn',
                'text-crit-500': row.h.tone === 'crit',
                'text-info-500': row.h.tone === 'info',
                'text-base-400 dark:text-base-500': row.h.tone === 'muted',
            }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-1 flex-col gap-0.5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-xs leading-snug text-base-800 dark:text-base-100" },
    });
    (row.h.text);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-[10px] text-base-400 dark:text-base-500" },
    });
    (row.raw.node);
    (row.raw.event);
    (__VLS_ctx.formatRelTime(row.raw.ts));
}
if (__VLS_ctx.events.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "border border-base-200 bg-base-50 p-4 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:border-base-700 dark:bg-base-900 dark:text-base-500" },
    });
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['max-h-[560px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-y']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['pr-1']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:divide-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['first:pt-0']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ok-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warn-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-info-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-snug']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-base-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-base-900']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudPanel: HudPanel,
            HudStatusPill: HudStatusPill,
            events: events,
            rendered: rendered,
            formatRelTime: formatRelTime,
            payloadJson: payloadJson,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
