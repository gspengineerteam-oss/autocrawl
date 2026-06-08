/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import HudPanel from '@/components/HudPanel.vue';
import HudStatusPill from '@/components/HudStatusPill.vue';
import HudUptime from '@/components/HudUptime.vue';
import HudCompletenessBar from '@/components/HudCompletenessBar.vue';
import HudEmptyState from '@/components/HudEmptyState.vue';
import Phase2GaugeChart from '@/components/charts/Phase2GaugeChart.vue';
import { useApiHealth } from '@/composables/useApiHealth';
const { status, dbStatus, query: healthQuery } = useApiHealth();
const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
    retry: 1,
    refetchInterval: 60000,
});
const overviewQ = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
    refetchInterval: 30000,
});
const runsQ = useQuery({
    queryKey: ['runs', 'diag'],
    queryFn: () => api.runs(20),
    refetchInterval: 30000,
});
const apiTone = computed(() => {
    if (status.value === 'down')
        return 'crit';
    if (status.value === 'degraded' || status.value === 'unknown')
        return 'warn';
    return 'ok';
});
const dbTone = computed(() => {
    if (dbStatus.value === 'down')
        return 'crit';
    if (dbStatus.value === 'unknown')
        return 'warn';
    return 'ok';
});
const apiVersion = computed(() => healthQuery.data.value?.version ?? 'N/A');
const phaseProgress = computed(() => {
    const o = overviewQ.data.value;
    if (!o || !o.phase_2_threshold)
        return 0;
    return Math.round((o.vendors_total / o.phase_2_threshold) * 100);
});
const phaseRemaining = computed(() => {
    const o = overviewQ.data.value;
    if (!o)
        return 0;
    return Math.max(0, o.phase_2_threshold - o.vendors_total);
});
const totalFailures = computed(() => {
    const items = runsQ.data.value?.items ?? [];
    return items.reduce((sum, r) => sum + (r.failures ?? 0), 0);
});
const totalTokens = computed(() => {
    const items = runsQ.data.value?.items ?? [];
    return items.reduce((sum, r) => sum + (r.openai_tokens_used ?? 0), 0);
});
const totalCredits = computed(() => {
    const items = runsQ.data.value?.items ?? [];
    return items.reduce((sum, r) => sum + (r.firecrawl_credits_used ?? 0), 0);
});
const successRate = computed(() => {
    const items = runsQ.data.value?.items ?? [];
    if (items.length === 0)
        return 0;
    const ok = items.filter((r) => Boolean(r.finished_at) && r.failures === 0).length;
    return ok / items.length;
});
function formatNumber(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-3 p-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500" },
});
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.apiTone === 'ok' && __VLS_ctx.dbTone === 'ok' ? 'ok' : 'crit'),
    label: (__VLS_ctx.apiTone === 'ok' && __VLS_ctx.dbTone === 'ok' ? 'SEMUA HIJAU' : 'PERHATIAN'),
    pulse: (true),
}));
const __VLS_1 = __VLS_0({
    tone: (__VLS_ctx.apiTone === 'ok' && __VLS_ctx.dbTone === 'ok' ? 'ok' : 'crit'),
    label: (__VLS_ctx.apiTone === 'ok' && __VLS_ctx.dbTone === 'ok' ? 'SEMUA HIJAU' : 'PERHATIAN'),
    pulse: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "grid grid-cols-1 gap-3 lg:grid-cols-3" },
});
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Status API",
    code: "DIAG-API",
}));
const __VLS_4 = __VLS_3({
    title: "Status API",
    code: "DIAG-API",
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_5.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
});
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.apiTone),
    label: (__VLS_ctx.apiTone === 'ok' ? 'ONLINE' : __VLS_ctx.apiTone === 'warn' ? 'CHECK' : 'OFFLINE'),
    pulse: (__VLS_ctx.apiTone === 'ok'),
}));
const __VLS_7 = __VLS_6({
    tone: (__VLS_ctx.apiTone),
    label: (__VLS_ctx.apiTone === 'ok' ? 'ONLINE' : __VLS_ctx.apiTone === 'warn' ? 'CHECK' : 'OFFLINE'),
    pulse: (__VLS_ctx.apiTone === 'ok'),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
});
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.dbTone),
    label: (__VLS_ctx.dbTone === 'ok' ? 'ONLINE' : __VLS_ctx.dbTone === 'warn' ? 'CHECK' : 'OFFLINE'),
    pulse: (__VLS_ctx.dbTone === 'ok'),
}));
const __VLS_10 = __VLS_9({
    tone: (__VLS_ctx.dbTone),
    label: (__VLS_ctx.dbTone === 'ok' ? 'ONLINE' : __VLS_ctx.dbTone === 'warn' ? 'CHECK' : 'OFFLINE'),
    pulse: (__VLS_ctx.dbTone === 'ok'),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-2xs" },
});
(__VLS_ctx.apiVersion);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
});
/** @type {[typeof HudUptime, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(HudUptime, new HudUptime({
    label: "",
}));
const __VLS_13 = __VLS_12({
    label: "",
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
var __VLS_5;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Phase 2 Status",
    code: "DIAG-PH2",
}));
const __VLS_16 = __VLS_15({
    title: "Phase 2 Status",
    code: "DIAG-PH2",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
__VLS_17.slots.default;
/** @type {[typeof Phase2GaugeChart, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(Phase2GaugeChart, new Phase2GaugeChart({
    current: (__VLS_ctx.overviewQ.data.value?.vendors_total ?? 0),
    threshold: (__VLS_ctx.overviewQ.data.value?.phase_2_threshold ?? 100),
    loading: (__VLS_ctx.overviewQ.isLoading.value),
}));
const __VLS_19 = __VLS_18({
    current: (__VLS_ctx.overviewQ.data.value?.vendors_total ?? 0),
    threshold: (__VLS_ctx.overviewQ.data.value?.phase_2_threshold ?? 100),
    loading: (__VLS_ctx.overviewQ.isLoading.value),
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-2 flex flex-col gap-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between font-mono text-2xs uppercase tracking-ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num" },
    ...{ class: (__VLS_ctx.phaseProgress >= 75 ? 'text-ok-600 dark:text-ok-400' : __VLS_ctx.phaseProgress >= 40 ? 'text-warn-600 dark:text-warn-400' : 'text-crit-600 dark:text-crit-400') },
});
(__VLS_ctx.phaseProgress);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between font-mono text-2xs uppercase tracking-ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num" },
});
(__VLS_ctx.phaseRemaining);
var __VLS_17;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Statistik 20 Operasi",
    code: "DIAG-OPS",
}));
const __VLS_22 = __VLS_21({
    title: "Statistik 20 Operasi",
    code: "DIAG-OPS",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between font-mono text-2xs uppercase tracking-ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num text-base-800 dark:text-base-100" },
});
(Math.round(__VLS_ctx.successRate * 100));
/** @type {[typeof HudCompletenessBar, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(HudCompletenessBar, new HudCompletenessBar({
    score: (__VLS_ctx.successRate),
}));
const __VLS_25 = __VLS_24({
    score: (__VLS_ctx.successRate),
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between font-mono text-2xs uppercase tracking-ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num" },
    ...{ class: (__VLS_ctx.totalFailures > 0 ? 'text-crit-600 dark:text-crit-400' : 'text-ok-600 dark:text-ok-400') },
});
(__VLS_ctx.totalFailures);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between font-mono text-2xs uppercase tracking-ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num" },
});
(__VLS_ctx.formatNumber(__VLS_ctx.totalTokens));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between font-mono text-2xs uppercase tracking-ops" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-base-500 dark:text-base-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hud-mono-num" },
});
(__VLS_ctx.formatNumber(__VLS_ctx.totalCredits));
var __VLS_23;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Konfigurasi Runtime",
    code: "DIAG-CFG",
}));
const __VLS_28 = __VLS_27({
    title: "Konfigurasi Runtime",
    code: "DIAG-CFG",
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
__VLS_29.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_29.slots;
    /** @type {[typeof HudStatusPill, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
        tone: (__VLS_ctx.settingsQ.isError.value ? 'crit' : 'ok'),
        label: (__VLS_ctx.settingsQ.isError.value ? 'GAGAL FETCH' : 'TERSEDIA'),
    }));
    const __VLS_31 = __VLS_30({
        tone: (__VLS_ctx.settingsQ.isError.value ? 'crit' : 'ok'),
        label: (__VLS_ctx.settingsQ.isError.value ? 'GAGAL FETCH' : 'TERSEDIA'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
}
if (__VLS_ctx.settingsQ.data.value) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2 lg:grid-cols-3" },
    });
    for (const [value, key] of __VLS_getVForSourceType((__VLS_ctx.settingsQ.data.value))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (key),
            ...{ class: "flex items-center justify-between border-b border-base-100 py-1.5 dark:border-base-800" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400" },
        });
        (String(key).replace(/_/g, ' '));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num truncate text-2xs" },
            ...{ class: (typeof value === 'boolean'
                    ? value
                        ? 'text-ok-600 dark:text-ok-400'
                        : 'text-base-400 dark:text-base-500'
                    : 'text-base-800 dark:text-base-100') },
        });
        if (typeof value === 'boolean') {
            (value ? 'AKTIF' : 'NONAKTIF');
        }
        else if (value === null) {
        }
        else {
            (value);
        }
    }
}
else if (__VLS_ctx.settingsQ.isError.value) {
    /** @type {[typeof HudEmptyState, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(HudEmptyState, new HudEmptyState({
        icon: "circle-xmark",
        title: "Endpoint settings tidak tersedia",
        hint: "Backend belum mengekspos GET /api/settings, atau request gagal. Cek log API container.",
    }));
    const __VLS_34 = __VLS_33({
        icon: "circle-xmark",
        title: "Endpoint settings tidak tersedia",
        hint: "Backend belum mengekspos GET /api/settings, atau request gagal. Cek log API container.",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
else {
    /** @type {[typeof HudEmptyState, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(HudEmptyState, new HudEmptyState({
        icon: "circle-notch",
        title: "Memuat konfigurasi",
    }));
    const __VLS_37 = __VLS_36({
        icon: "circle-notch",
        title: "Memuat konfigurasi",
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
}
var __VLS_29;
/** @type {[typeof HudPanel, typeof HudPanel, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(HudPanel, new HudPanel({
    title: "Audit Operasi Terbaru",
    code: "DIAG-AUDIT",
}));
const __VLS_40 = __VLS_39({
    title: "Audit Operasi Terbaru",
    code: "DIAG-AUDIT",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
__VLS_41.slots.default;
if ((__VLS_ctx.runsQ.data.value?.items ?? []).length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    /** @type {[typeof HudEmptyState, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(HudEmptyState, new HudEmptyState({
        icon: "clock-rotate-left",
        title: "Belum ada operasi",
        hint: "Trigger ENGAGE di topbar untuk meluncurkan operasi crawl pertama.",
    }));
    const __VLS_43 = __VLS_42({
        icon: "clock-rotate-left",
        title: "Belum ada operasi",
        hint: "Trigger ENGAGE di topbar untuk meluncurkan operasi crawl pertama.",
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "overflow-x-auto" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "hud-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[8%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[28%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[18%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[10%] text-right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[10%] text-right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[13%] text-right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[13%] text-right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [r] of __VLS_getVForSourceType((__VLS_ctx.runsQ.data.value?.items ?? []))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (r.run_id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        /** @type {[typeof HudStatusPill, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
            tone: (!r.finished_at ? 'warn' : r.failures > 0 ? 'crit' : 'ok'),
            label: (!r.finished_at ? 'JALAN' : r.failures > 0 ? 'GAGAL' : 'OK'),
            pulse: (!r.finished_at),
        }));
        const __VLS_46 = __VLS_45({
            tone: (!r.finished_at ? 'warn' : r.failures > 0 ? 'crit' : 'ok'),
            label: (!r.finished_at ? 'JALAN' : r.failures > 0 ? 'GAGAL' : 'OK'),
            pulse: (!r.finished_at),
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-2xs" },
        });
        (r.run_id.slice(0, 36));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-2xs" },
        });
        (new Date(r.started_at).toLocaleString('id-ID'));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "text-right" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-xs font-semibold text-accent-600 dark:text-accent-300" },
        });
        (r.vendors_enriched);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "text-right" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-xs" },
            ...{ class: (r.failures > 0 ? 'text-crit-600 dark:text-crit-400' : 'text-base-400 dark:text-base-500') },
        });
        (r.failures);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "text-right" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-2xs text-base-500 dark:text-base-400" },
        });
        (r.openai_tokens_used ? __VLS_ctx.formatNumber(r.openai_tokens_used) : '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "text-right" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "hud-mono-num text-2xs text-base-500 dark:text-base-400" },
        });
        (r.firecrawl_credits_used ?? '-');
    }
}
var __VLS_41;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-x-6']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-base-100']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-base-800']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-ops']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-x-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-table']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[8%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[28%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[18%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[10%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[10%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[13%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[13%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-accent-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-accent-300']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-mono-num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base-500']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-base-400']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudPanel: HudPanel,
            HudStatusPill: HudStatusPill,
            HudUptime: HudUptime,
            HudCompletenessBar: HudCompletenessBar,
            HudEmptyState: HudEmptyState,
            Phase2GaugeChart: Phase2GaugeChart,
            settingsQ: settingsQ,
            overviewQ: overviewQ,
            runsQ: runsQ,
            apiTone: apiTone,
            dbTone: dbTone,
            apiVersion: apiVersion,
            phaseProgress: phaseProgress,
            phaseRemaining: phaseRemaining,
            totalFailures: totalFailures,
            totalTokens: totalTokens,
            totalCredits: totalCredits,
            successRate: successRate,
            formatNumber: formatNumber,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
