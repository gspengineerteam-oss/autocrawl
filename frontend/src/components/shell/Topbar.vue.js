/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useDebounceFn, useEventListener } from '@vueuse/core';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { api } from '@/api/client';
import HudThemeToggle from '@/components/HudThemeToggle.vue';
import VendorCard from '@/components/VendorCard.vue';
/**
 * Operator topbar - mission-control density.
 *
 *   [A AUTOCRAWL/OPS] [⌘K Cari…] [●LIVE 3W ▮▮▮▱▱▱▱▱ 12m] [09 MAY 12:48:53] [ENGAGE] [☀]
 *     brand+badge       search       live status meter     date+time clock   action  theme
 *
 * Inline live worker meter shows real /orchestrator/throughput data:
 * filled cells = current active workers out of 8-cell visual capacity.
 * Run duration counter ticks every second when active.
 */
const router = useRouter();
const queryClient = useQueryClient();
/* ------------------------------------------------------------------ */
/* Live clock + run state                                               */
/* ------------------------------------------------------------------ */
const now = ref(new Date());
let tickHandle = 0;
onMounted(() => { tickHandle = window.setInterval(() => { now.value = new Date(); }, 1000); });
onBeforeUnmount(() => { if (tickHandle)
    window.clearInterval(tickHandle); });
const dateLabel = computed(() => {
    const d = now.value;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${day} ${months[d.getMonth()]}`;
});
const clockHMS = computed(() => {
    const h = String(now.value.getHours()).padStart(2, '0');
    const m = String(now.value.getMinutes()).padStart(2, '0');
    const s = String(now.value.getSeconds()).padStart(2, '0');
    return { h, m, s };
});
const activeQuery = useQuery({
    queryKey: ['runs', 'active'],
    queryFn: api.activeRun,
    refetchInterval: 5000,
});
const throughputQuery = useQuery({
    queryKey: ['orchestrator', 'throughput', 'topbar'],
    queryFn: () => api.orchestrator.throughput(60),
    refetchInterval: 4000,
});
const currentQuery = useQuery({
    queryKey: ['orchestrator', 'current', 'topbar'],
    queryFn: api.orchestrator.current,
    refetchInterval: 4000,
});
const isRunning = computed(() => Boolean(activeQuery.data.value?.active));
const stopRequested = computed(() => {
    const a = activeQuery.data.value?.active;
    return Boolean(a?.stop_requested);
});
const workerCount = computed(() => throughputQuery.data.value?.active_workers_total ?? 0);
const runDuration = computed(() => {
    const startedAt = currentQuery.data.value?.active_run?.started_at;
    if (!startedAt)
        return null;
    const start = new Date(startedAt).getTime();
    if (Number.isNaN(start))
        return null;
    const sec = Math.max(0, Math.floor((now.value.getTime() - start) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0)
        return `${h}j ${m}m`;
    return `${m}m ${sec % 60}d`;
});
const submitting = ref(false);
const showModeMenu = ref(false);
async function trigger(mode = 'normal') {
    showModeMenu.value = false;
    if (isRunning.value || submitting.value)
        return;
    submitting.value = true;
    try {
        await api.triggerRun(mode);
        toast.success('Operasi diluncurkan', { description: `Mode ${mode.toUpperCase()} berjalan di background.` });
        ['runs', 'vendors', 'expos', 'pdfs', 'overview', 'stats', 'exhibitor-refs'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    }
    catch (err) {
        const e = err;
        if (e.response?.status === 409)
            toast.warning('Operasi masih aktif');
        else
            toast.error('Gagal meluncurkan operasi');
    }
    finally {
        submitting.value = false;
    }
}
/* ------------------------------------------------------------------ */
/* Omnisearch                                                           */
/* ------------------------------------------------------------------ */
const search = ref('');
const debouncedTerm = ref('');
const searchInput = ref(null);
const searchWrap = ref(null);
const searchOpen = ref(false);
const searchLoading = ref(false);
const vendorResults = ref([]);
const expoResults = ref([]);
const activeIdx = ref(-1);
const searchDegraded = ref(false);
const searchMode = ref(null);
const flatResults = computed(() => {
    const out = [];
    for (const v of vendorResults.value)
        out.push({ kind: 'vendor', v });
    for (const e of expoResults.value)
        out.push({ kind: 'expo', e });
    return out;
});
const setDebounced = useDebounceFn((value) => { debouncedTerm.value = value; }, 250);
watch(search, (v) => { setDebounced(v.trim()); activeIdx.value = -1; });
watch(debouncedTerm, async (term) => {
    if (term.length < 2) {
        vendorResults.value = [];
        expoResults.value = [];
        searchLoading.value = false;
        searchDegraded.value = false;
        searchMode.value = null;
        return;
    }
    searchLoading.value = true;
    try {
        const [vRes, eRes] = await Promise.all([
            api
                .vendorsSemantic(term, 6)
                .catch(() => ({ items: [], degraded: false, mode: 'semantic', query: term, limit: 6 })),
            api.expos({ search: term, limit: 6 }).catch(() => ({ items: [] })),
        ]);
        vendorResults.value = (vRes.items ?? []);
        expoResults.value = (eRes.items ?? []);
        searchDegraded.value = vRes.degraded ?? false;
        searchMode.value = vRes.mode ?? null;
    }
    finally {
        searchLoading.value = false;
    }
});
function focusSearch() { searchInput.value?.focus(); searchOpen.value = true; }
function closeSearch() { searchOpen.value = false; activeIdx.value = -1; }
function selectVendor(v) {
    const target = v.vendor_id || v.domain;
    if (!target)
        return;
    router.push(`/vendors/${encodeURIComponent(target)}`);
    search.value = '';
    closeSearch();
}
function selectExpo(e) {
    router.push(`/expos/${encodeURIComponent(e.expo_id)}`);
    search.value = '';
    closeSearch();
}
function onSearchKeydown(e) {
    if (e.key === 'Escape') {
        closeSearch();
        searchInput.value?.blur();
        return;
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flatResults.value.length === 0)
            return;
        activeIdx.value = (activeIdx.value + 1) % flatResults.value.length;
        return;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flatResults.value.length === 0)
            return;
        activeIdx.value = activeIdx.value <= 0 ? flatResults.value.length - 1 : activeIdx.value - 1;
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        const idx = activeIdx.value >= 0 ? activeIdx.value : 0;
        const item = flatResults.value[idx];
        if (!item)
            return;
        if (item.kind === 'vendor' && item.v)
            selectVendor(item.v);
        else if (item.kind === 'expo' && item.e)
            selectExpo(item.e);
    }
}
function onGlobalKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusSearch();
    }
}
onMounted(() => { window.addEventListener('keydown', onGlobalKeyDown); });
onBeforeUnmount(() => { window.removeEventListener('keydown', onGlobalKeyDown); });
useEventListener('click', (e) => {
    if (!searchWrap.value)
        return;
    if (!searchWrap.value.contains(e.target))
        closeSearch();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['topbar-result-wrap']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "autocrawl-topbar rule-b bg-bg relative z-50 flex h-[64px] shrink-0 items-stretch" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex w-[220px] shrink-0 items-center gap-3 px-5 rule-r" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "relative shrink-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "34",
    height: "34",
    viewBox: "0 0 34 34",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.polygon)({
    points: "17,2 31,9.5 31,24.5 17,32 3,24.5 3,9.5",
    fill: "#FFB840",
    stroke: "#FF9230",
    'stroke-width': "0.8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "17",
    y: "22",
    'text-anchor': "middle",
    'font-family': "Geist Variable, system-ui",
    'font-weight': "800",
    'font-size': "14",
    fill: "#0A1525",
    ...{ style: {} },
});
if (__VLS_ctx.isRunning) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "absolute -top-0.5 -right-0.5 dot dot-amber dot-glow blink" },
        ...{ style: {} },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col leading-[1.0] min-w-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-wordmark text-ink" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-eyebrow text-amber" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "searchWrap",
    ...{ class: "flex flex-1 items-center px-5 relative min-w-0" },
});
/** @type {typeof __VLS_ctx.searchWrap} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex w-full items-center gap-3" },
});
const __VLS_0 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    icon: (['fas', 'star']),
    ...{ class: "text-[12px] text-amber" },
}));
const __VLS_2 = __VLS_1({
    icon: (['fas', 'star']),
    ...{ class: "text-[12px] text-amber" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onFocus: (...[$event]) => {
            __VLS_ctx.searchOpen = true;
        } },
    ...{ onKeydown: (__VLS_ctx.onSearchKeydown) },
    ref: "searchInput",
    value: (__VLS_ctx.search),
    type: "text",
    placeholder: "Cari berdasarkan keahlian, produk, atau industri",
    ...{ class: "flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-ink-mute text-ink" },
    autocomplete: "off",
    spellcheck: "false",
});
/** @type {typeof __VLS_ctx.searchInput} */ ;
if (__VLS_ctx.searchLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dot dot-amber pulse-amber" },
    });
}
if (__VLS_ctx.searchDegraded) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "topbar-degraded-chip" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.kbd, __VLS_intrinsicElements.kbd)({
    ...{ class: "text-[10px] tracking-widest border border-rule-strong px-1.5 py-0.5 text-ink-mute" },
    ...{ style: {} },
});
if (__VLS_ctx.searchOpen && __VLS_ctx.search.trim().length >= 2) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute left-5 right-5 top-[3.6rem] z-[60] card shadow-[0_18px_40px_rgb(0_0_0/0.55)] max-h-[26rem] overflow-y-auto" },
    });
    if (__VLS_ctx.vendorResults.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "px-4 py-2 rule-b flex items-baseline justify-between" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        (__VLS_ctx.vendorResults.length);
        for (const [v, i] of __VLS_getVForSourceType((__VLS_ctx.vendorResults))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onMouseenter: (...[$event]) => {
                        if (!(__VLS_ctx.searchOpen && __VLS_ctx.search.trim().length >= 2))
                            return;
                        if (!(__VLS_ctx.vendorResults.length > 0))
                            return;
                        __VLS_ctx.activeIdx = i;
                    } },
                key: (`v-${v.vendor_id}`),
                ...{ class: "topbar-result-wrap rule-b last:border-b-0" },
                ...{ class: (__VLS_ctx.activeIdx === i ? 'bg-surface-2' : '') },
            });
            /** @type {[typeof VendorCard, ]} */ ;
            // @ts-ignore
            const __VLS_4 = __VLS_asFunctionalComponent(VendorCard, new VendorCard({
                ...{ 'onClick': {} },
                vendor: ({
                    vendor_id: v.vendor_id,
                    company_name: v.company_name || v.domain || '(tanpa nama)',
                    domain: v.domain,
                    logo_url: v.logo_url,
                    industries: v.industries ?? [],
                    enrichment_gap: v.enrichment_gap ?? [],
                    country: v.address?.country ?? v.registrar_country ?? null,
                    similarity: v.similarity ?? undefined,
                }),
                size: "compact",
                showEnrichment: (true),
                industryLimit: (2),
            }));
            const __VLS_5 = __VLS_4({
                ...{ 'onClick': {} },
                vendor: ({
                    vendor_id: v.vendor_id,
                    company_name: v.company_name || v.domain || '(tanpa nama)',
                    domain: v.domain,
                    logo_url: v.logo_url,
                    industries: v.industries ?? [],
                    enrichment_gap: v.enrichment_gap ?? [],
                    country: v.address?.country ?? v.registrar_country ?? null,
                    similarity: v.similarity ?? undefined,
                }),
                size: "compact",
                showEnrichment: (true),
                industryLimit: (2),
            }, ...__VLS_functionalComponentArgsRest(__VLS_4));
            let __VLS_7;
            let __VLS_8;
            let __VLS_9;
            const __VLS_10 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.searchOpen && __VLS_ctx.search.trim().length >= 2))
                        return;
                    if (!(__VLS_ctx.vendorResults.length > 0))
                        return;
                    __VLS_ctx.selectVendor(v);
                }
            };
            var __VLS_6;
        }
    }
    if (__VLS_ctx.expoResults.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (__VLS_ctx.vendorResults.length > 0 ? 'rule-t' : '') },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "px-4 py-2 rule-b flex items-baseline justify-between" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        (__VLS_ctx.expoResults.length);
        for (const [e, i] of __VLS_getVForSourceType((__VLS_ctx.expoResults))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.searchOpen && __VLS_ctx.search.trim().length >= 2))
                            return;
                        if (!(__VLS_ctx.expoResults.length > 0))
                            return;
                        __VLS_ctx.selectExpo(e);
                    } },
                ...{ onMouseenter: (...[$event]) => {
                        if (!(__VLS_ctx.searchOpen && __VLS_ctx.search.trim().length >= 2))
                            return;
                        if (!(__VLS_ctx.expoResults.length > 0))
                            return;
                        __VLS_ctx.activeIdx = __VLS_ctx.vendorResults.length + i;
                    } },
                key: (`e-${e.expo_id}`),
                ...{ class: "w-full text-left px-4 py-2.5 rule-b last:border-b-0 hover:bg-surface-2/60" },
                ...{ class: (__VLS_ctx.activeIdx === __VLS_ctx.vendorResults.length + i ? 'bg-surface-2' : '') },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-baseline justify-between gap-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-[14px] text-ink truncate" },
            });
            (e.name);
            if (e.country) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "label label-mute shrink-0" },
                });
                (e.country);
            }
            if (e.location || e.start_date) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mt-0.5 flex items-baseline gap-2" },
                });
                if (e.location) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "text-[12px] text-ink-2 truncate" },
                    });
                    (e.location);
                }
                if (e.start_date) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "label label-mute" },
                    });
                    (e.start_date);
                }
            }
        }
    }
    if (!__VLS_ctx.searchLoading && __VLS_ctx.vendorResults.length === 0 && __VLS_ctx.expoResults.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "px-4 py-6 text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        (__VLS_ctx.search.trim());
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center px-3 gap-2 rule-l" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-glow" },
    ...{ class: (__VLS_ctx.isRunning ? 'dot-amber pulse-amber' : 'dot-mute') },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label" },
    ...{ class: (__VLS_ctx.isRunning ? 'label-amber' : 'label-mute') },
});
(__VLS_ctx.isRunning ? 'LIVE' : 'IDLE');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute text-[10px] leading-none select-none" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[12.5px] tabular-nums leading-none" },
    ...{ class: (__VLS_ctx.workerCount > 0 ? 'num-amber' : 'text-ink-mute') },
});
(__VLS_ctx.workerCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-[9.5px] ml-0.5" },
    ...{ class: (__VLS_ctx.workerCount > 0 ? 'text-amber/70' : 'text-ink-mute') },
});
if (__VLS_ctx.runDuration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-ink-mute text-[10px] leading-none select-none" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display text-[12px] text-ink-2 tabular-nums leading-none" },
    });
    (__VLS_ctx.runDuration);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center px-4 gap-3 rule-l" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[10.5px] tracking-[0.18em] text-ink-mute font-semibold" },
});
(__VLS_ctx.dateLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-baseline gap-0.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[16px] font-medium" },
});
(__VLS_ctx.clockHMS.h);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute text-[16px] blink" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[16px] font-medium" },
});
(__VLS_ctx.clockHMS.m);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute text-[16px] blink" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[14px] text-ink-mute" },
});
(__VLS_ctx.clockHMS.s);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center px-3 rule-l relative" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "split-btn" },
    ...{ class: ([
            __VLS_ctx.isRunning || __VLS_ctx.submitting ? 'is-disabled' : '',
            __VLS_ctx.isRunning && !__VLS_ctx.stopRequested ? 'is-running' : '',
            __VLS_ctx.stopRequested ? 'is-stopping' : '',
        ]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.trigger('normal');
        } },
    ...{ class: "split-btn-main" },
    disabled: (__VLS_ctx.isRunning || __VLS_ctx.submitting),
});
const __VLS_11 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
    icon: (['fas', __VLS_ctx.submitting ? 'circle-notch' : (__VLS_ctx.isRunning ? 'tower-broadcast' : 'play')]),
    ...{ class: (__VLS_ctx.submitting ? 'animate-spin text-[10px]' : 'text-[10px]') },
}));
const __VLS_13 = __VLS_12({
    icon: (['fas', __VLS_ctx.submitting ? 'circle-notch' : (__VLS_ctx.isRunning ? 'tower-broadcast' : 'play')]),
    ...{ class: (__VLS_ctx.submitting ? 'animate-spin text-[10px]' : 'text-[10px]') },
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.isRunning ? (__VLS_ctx.stopRequested ? 'STOP…' : 'BERJALAN') : 'ENGAGE');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "split-btn-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.showModeMenu = !__VLS_ctx.showModeMenu;
        } },
    ...{ class: "split-btn-menu" },
    disabled: (__VLS_ctx.isRunning || __VLS_ctx.submitting),
    'aria-label': "Pilih mode",
    'aria-expanded': (__VLS_ctx.showModeMenu),
});
const __VLS_15 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
    icon: (['fas', 'chevron-down']),
    ...{ class: "text-[10px]" },
}));
const __VLS_17 = __VLS_16({
    icon: (['fas', 'chevron-down']),
    ...{ class: "text-[10px]" },
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
const __VLS_19 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    enterActiveClass: "transition duration-150",
    enterFromClass: "opacity-0 -translate-y-1",
    enterToClass: "opacity-100 translate-y-0",
    leaveActiveClass: "transition duration-100",
    leaveFromClass: "opacity-100",
    leaveToClass: "opacity-0",
}));
const __VLS_21 = __VLS_20({
    enterActiveClass: "transition duration-150",
    enterFromClass: "opacity-0 -translate-y-1",
    enterToClass: "opacity-100 translate-y-0",
    leaveActiveClass: "transition duration-100",
    leaveFromClass: "opacity-100",
    leaveToClass: "opacity-0",
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
__VLS_22.slots.default;
if (__VLS_ctx.showModeMenu) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute right-3 top-[3.6rem] z-[55] w-56 card shadow-[0_18px_40px_rgb(0_0_0/0.55)]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showModeMenu))
                    return;
                __VLS_ctx.trigger('dev');
            } },
        ...{ class: "flex w-full items-center justify-between px-4 py-2.5 text-left rule-b hover:bg-surface-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-ink text-[12px]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showModeMenu))
                    return;
                __VLS_ctx.trigger('normal');
            } },
        ...{ class: "flex w-full items-center justify-between px-4 py-2.5 text-left rule-b hover:bg-surface-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-ink text-[12px]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showModeMenu))
                    return;
                __VLS_ctx.trigger('aggressive');
            } },
        ...{ class: "flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-surface-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-ink text-[12px]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
}
var __VLS_22;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center px-3 rule-l" },
});
/** @type {[typeof HudThemeToggle, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(HudThemeToggle, new HudThemeToggle({}));
const __VLS_24 = __VLS_23({}, ...__VLS_functionalComponentArgsRest(__VLS_23));
/** @type {__VLS_StyleScopedClasses['autocrawl-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[64px]']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['items-stretch']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[220px]']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['px-5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-r']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['-top-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['-right-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['blink']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-[1.0]']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-wordmark']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-5']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['border-0']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-none']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[14px]']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder:text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['pulse-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-degraded-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule-strong']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-5']} */ ;
/** @type {__VLS_StyleScopedClasses['right-5']} */ ;
/** @type {__VLS_StyleScopedClasses['top-[3.6rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[60]']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-[0_18px_40px_rgb(0_0_0/0.55)]']} */ ;
/** @type {__VLS_StyleScopedClasses['max-h-[26rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-result-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['last:border-b-0']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['last:border-b-0']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2/60']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[14px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-l']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['select-none']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['select-none']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-l']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[16px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[16px]']} */ ;
/** @type {__VLS_StyleScopedClasses['blink']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[16px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[16px]']} */ ;
/** @type {__VLS_StyleScopedClasses['blink']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[14px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-l']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['split-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['split-btn-main']} */ ;
/** @type {__VLS_StyleScopedClasses['split-btn-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['split-btn-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['right-3']} */ ;
/** @type {__VLS_StyleScopedClasses['top-[3.6rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[55]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-56']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-[0_18px_40px_rgb(0_0_0/0.55)]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-l']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudThemeToggle: HudThemeToggle,
            VendorCard: VendorCard,
            dateLabel: dateLabel,
            clockHMS: clockHMS,
            isRunning: isRunning,
            stopRequested: stopRequested,
            workerCount: workerCount,
            runDuration: runDuration,
            submitting: submitting,
            showModeMenu: showModeMenu,
            trigger: trigger,
            search: search,
            searchInput: searchInput,
            searchWrap: searchWrap,
            searchOpen: searchOpen,
            searchLoading: searchLoading,
            vendorResults: vendorResults,
            expoResults: expoResults,
            activeIdx: activeIdx,
            searchDegraded: searchDegraded,
            selectVendor: selectVendor,
            selectExpo: selectExpo,
            onSearchKeydown: onSearchKeydown,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
