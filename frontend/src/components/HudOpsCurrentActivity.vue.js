/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import HudPanel from './HudPanel.vue';
import HudStatusPill from './HudStatusPill.vue';
const currentQ = useQuery({
    queryKey: ['ops', 'current'],
    queryFn: api.orchestrator.current,
    refetchInterval: 2000,
});
const stages = computed(() => currentQ.data.value?.stages ?? []);
function ledClass(active, failedToday) {
    if (active > 0)
        return 'hud-led hud-led-warn animate-pulse-led';
    if (failedToday > 0)
        return 'hud-led hud-led-crit';
    return 'hud-led hud-led-muted';
}
function stageTone(active, completed, failed) {
    if (active > 0)
        return 'warn';
    if (failed > 0 && completed === 0)
        return 'crit';
    if (completed > 0)
        return 'ok';
    return 'muted';
}
function formatRelTime(ts) {
    if (!ts)
        return 'belum ada';
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
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Sedang Berjalan",
    code: "OPS-NOW",
}));
const __VLS_1 = __VLS_0({
    title: "Sedang Berjalan",
    code: "OPS-NOW",
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
    ...{ class: "flex flex-col divide-y divide-base-100 dark:divide-base-800" },
});
for (const [stage] of __VLS_getVForSourceType((__VLS_ctx.stages))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (stage.node),
        ...{ class: "flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-between gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: (__VLS_ctx.ledClass(stage.active, stage.failed_today)) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-2xs text-base-400 dark:text-base-500" },
    });
    (stage.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-xs uppercase tracking-ops text-base-800 dark:text-base-100" },
    });
    (stage.label);
    /** @type {[typeof HudStatusPill, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
        tone: (__VLS_ctx.stageTone(stage.active, stage.completed_today, stage.failed_today)),
        label: (`${stage.active} AKTIF`),
        pulse: (stage.active > 0),
    }));
    const __VLS_5 = __VLS_4({
        tone: (__VLS_ctx.stageTone(stage.active, stage.completed_today, stage.failed_today)),
        label: (`${stage.active} AKTIF`),
        pulse: (stage.active > 0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    if (stage.in_flight_label) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ml-4 flex items-center gap-1.5 text-xs text-base-700 dark:text-base-200" },
        });
        const __VLS_7 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
            icon: (['fas', 'circle-notch']),
            ...{ class: "animate-spin text-2xs text-warn-500" },
        }));
        const __VLS_9 = __VLS_8({
            icon: (['fas', 'circle-notch']),
            ...{ class: "animate-spin text-2xs text-warn-500" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-medium" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num truncate text-base-600 dark:text-base-300" },
            title: (stage.in_flight_label),
        });
        (stage.in_flight_label);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ml-4 font-mono text-2xs text-base-400 dark:text-base-500" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ml-4 flex items-center gap-3 font-mono text-2xs text-base-500 dark:text-base-400" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num text-ok-600 dark:text-ok-400" },
    });
    (stage.completed_today);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hud-mono-num" },
        ...{ class: (stage.failed_today > 0 ? 'text-crit-600 dark:text-crit-400' : '') },
    });
    (stage.failed_today);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ml-auto" },
    });
    (__VLS_ctx.formatRelTime(stage.last_event_at));
}
if (__VLS_ctx.stages.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "px-2 py-3 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500" },
    });
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-y']} */ ;
/** @type {__VLS_StyleScopedClasses['divide-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:divide-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['first:pt-0']} */ ;
/** @type {__VLS_StyleScopedClasses['last:pb-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-200']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-spin']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warn-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-300']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-4']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ok-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-ok-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
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
            HudPanel: HudPanel,
            HudStatusPill: HudStatusPill,
            stages: stages,
            ledClass: ledClass,
            stageTone: stageTone,
            formatRelTime: formatRelTime,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
