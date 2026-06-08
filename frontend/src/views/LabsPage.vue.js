/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useQuery } from '@tanstack/vue-query';
import axios from 'axios';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { api } from '@/api/client';
import ConfirmCountdownModal from '@/components/ConfirmCountdownModal.vue';
import LabsFusionResult from '@/components/LabsFusionResult.vue';
import LabsSuggestionCard from '@/components/LabsSuggestionCard.vue';
import LabsVendorCard from '@/components/LabsVendorCard.vue';
const activeTab = ref('create');
const search = ref('');
const onlyWithEmail = ref(false);
const onlyWithProducts = ref(true);
const createIndustryFilter = ref(new Set());
const selected = ref(new Set());
const hint = ref('');
const showConfirm = ref(false);
const PAGE_SIZE = 100;
const loadedCandidates = ref([]);
const candidatesTotal = ref(0);
const candidatesHasMore = ref(false);
const candidatesLoading = ref(false);
const candidatesError = ref(null);
const loadMoreBusy = ref(false);
const industriesQuery = useQuery({
    queryKey: ['labs-candidate-industries', onlyWithProducts, onlyWithEmail],
    queryFn: () => api.labs.candidateIndustries({
        only_with_products: onlyWithProducts.value,
        only_with_email: onlyWithEmail.value,
    }),
});
const availableCreateIndustries = computed(() => industriesQuery.data.value?.items ?? []);
async function loadCandidatesPage(offset, append) {
    const params = {
        search: search.value || undefined,
        only_with_email: onlyWithEmail.value,
        only_with_products: onlyWithProducts.value,
        industries: createIndustryFilter.value.size ? Array.from(createIndustryFilter.value) : undefined,
        limit: PAGE_SIZE,
        offset,
    };
    if (append)
        loadMoreBusy.value = true;
    else
        candidatesLoading.value = true;
    candidatesError.value = null;
    try {
        const res = await api.labs.candidates(params);
        const items = res.items ?? [];
        if (append)
            loadedCandidates.value = [...loadedCandidates.value, ...items];
        else
            loadedCandidates.value = items;
        candidatesTotal.value = res.total ?? items.length;
        candidatesHasMore.value = Boolean(res.has_more);
    }
    catch (e) {
        candidatesError.value = 'Gagal load kandidat';
        if (!append)
            loadedCandidates.value = [];
    }
    finally {
        candidatesLoading.value = false;
        loadMoreBusy.value = false;
    }
}
async function refreshCandidates() {
    await loadCandidatesPage(0, false);
}
async function loadMoreCandidates() {
    if (!candidatesHasMore.value || loadMoreBusy.value)
        return;
    await loadCandidatesPage(loadedCandidates.value.length, true);
}
async function loadAllCandidates() {
    while (candidatesHasMore.value && !loadMoreBusy.value) {
        await loadCandidatesPage(loadedCandidates.value.length, true);
    }
}
function toggleCreateIndustry(name) {
    const next = new Set(createIndustryFilter.value);
    if (next.has(name))
        next.delete(name);
    else
        next.add(name);
    createIndustryFilter.value = next;
}
function clearCreateIndustries() {
    createIndustryFilter.value = new Set();
}
let searchDebounce = null;
watch([search, onlyWithEmail, onlyWithProducts, createIndustryFilter], () => {
    if (searchDebounce)
        clearTimeout(searchDebounce);
    searchDebounce = setTimeout(refreshCandidates, 250);
}, { deep: true });
refreshCandidates();
const candidates = computed(() => loadedCandidates.value);
const candidateMap = computed(() => {
    const m = new Map();
    for (const v of candidates.value)
        m.set(v.vendor_id, v);
    return m;
});
const suggestions = ref([]);
const suggestLoading = ref(false);
async function fetchSuggestions() {
    suggestLoading.value = true;
    try {
        const res = await api.labs.suggest({});
        suggestions.value = res.suggestions;
        if (res.suggestions.length === 0) {
            toast.info('Belum ada saran yang masuk akal. Coba lagi atau periksa data vendor.');
        }
    }
    catch {
        toast.error('Gagal ngambil saran AI');
    }
    finally {
        suggestLoading.value = false;
    }
}
function useSuggestion(vendorIds) {
    selected.value = new Set(vendorIds);
    toast.success(`${vendorIds.length} vendor terpilih dari saran`);
}
function toggleVendor(vendorId) {
    const next = new Set(selected.value);
    if (next.has(vendorId))
        next.delete(vendorId);
    else
        next.add(vendorId);
    selected.value = next;
}
const selectedVendors = computed(() => Array.from(selected.value)
    .map((id) => candidateMap.value.get(id))
    .filter((v) => Boolean(v)));
const missingEmail = computed(() => selectedVendors.value.filter((v) => !v.has_verified_email));
const canCombine = computed(() => selected.value.size >= 2);
const deepenBusy = ref(new Set());
async function deepenVendor(vendorId) {
    const next = new Set(deepenBusy.value);
    next.add(vendorId);
    deepenBusy.value = next;
    try {
        await api.deepenVendor(vendorId);
        toast.success('Deepen request dikirim. Tunggu beberapa menit, refresh kandidat.');
    }
    catch {
        toast.error('Gagal trigger deepen');
    }
    finally {
        const after = new Set(deepenBusy.value);
        after.delete(vendorId);
        deepenBusy.value = after;
    }
}
const combineLoading = ref(false);
const lastFusion = ref(null);
function openCombine() {
    if (!canCombine.value)
        return;
    showConfirm.value = true;
}
async function doCombine() {
    combineLoading.value = true;
    lastFusion.value = null;
    try {
        const fusion = await api.labs.create({
            vendor_ids: Array.from(selected.value),
            hint: hint.value || undefined,
        });
        lastFusion.value = fusion;
        toast.success(`Fusion "${fusion.name}" berhasil dibikin`);
        selected.value = new Set();
        hint.value = '';
        historyQuery.refetch();
    }
    catch (e) {
        let msg = 'Combine gagal';
        if (axios.isAxiosError(e) && e.response?.data) {
            const detail = e.response.data.detail;
            if (typeof detail === 'string')
                msg = detail;
            else if (detail?.hint)
                msg = detail.hint;
        }
        toast.error(msg);
    }
    finally {
        combineLoading.value = false;
    }
}
const historyQuery = useQuery({
    queryKey: ['labs-history'],
    queryFn: () => api.labs.list({ limit: 50 }),
});
const categoryFilter = ref('');
const historyItems = computed(() => historyQuery.data.value?.items ?? []);
const availableCategories = computed(() => {
    const counts = new Map();
    for (const f of historyItems.value) {
        for (const ind of f.industries ?? []) {
            const key = (ind ?? '').trim();
            if (!key)
                continue;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
});
const filteredHistoryItems = computed(() => {
    if (!categoryFilter.value)
        return historyItems.value;
    return historyItems.value.filter((f) => (f.industries ?? []).some((i) => i === categoryFilter.value));
});
const historyDetail = ref(null);
async function openHistoryDetail(fusionId) {
    try {
        historyDetail.value = await api.labs.detail(fusionId);
    }
    catch {
        toast.error('Gagal load detail fusion');
    }
}
watch(activeTab, () => {
    if (activeTab.value === 'history')
        historyQuery.refetch();
});
const formatNum = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n))
        return '—';
    return new Intl.NumberFormat('id-ID').format(n);
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['labs-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab--active']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab__num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__body']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-bench']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-history']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip--active']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip__num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip--sm']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip__num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-rail-cats']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-rail-cats']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "labs-canvas" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "labs-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "labs-hero__ticker fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "dot dot-amber dot-glow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-tag" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-msg" },
});
(__VLS_ctx.candidates.length);
(__VLS_ctx.historyQuery.data.value?.items?.length ?? 0);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atlas-hero__ticker-stamp" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "labs-hero__stencil fade-up" },
    ...{ style: {} },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "labs-hero__body fade-up" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "labs-hero__copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow eyebrow-accent" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "display-hero mt-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-amber" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-ink-2 mt-3 max-w-xl" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "labs-hero__tabs" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'create';
        } },
    type: "button",
    ...{ class: "labs-tab" },
    ...{ class: ({ 'labs-tab--active': __VLS_ctx.activeTab === 'create' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num labs-tab__num" },
});
(__VLS_ctx.selected.size);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'history';
        } },
    type: "button",
    ...{ class: "labs-tab" },
    ...{ class: ({ 'labs-tab--active': __VLS_ctx.activeTab === 'history' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num labs-tab__num" },
});
(__VLS_ctx.historyQuery.data.value?.items?.length ?? 0);
if (__VLS_ctx.activeTab === 'create') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "labs-bench" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "labs-rail" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "bezel bezel-lg" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "bezel-core p-6 flex flex-col gap-5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "labs-rail__num num" },
    });
    (__VLS_ctx.selected.size === 0 ? '00' : __VLS_ctx.formatNum(__VLS_ctx.selected.size));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-ink-mute text-xs" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.fetchSuggestions) },
        ...{ class: "btn btn-amber btn-lg w-full justify-between" },
        type: "button",
        disabled: (__VLS_ctx.suggestLoading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.suggestLoading ? 'Mencari Saran…' : 'Cari Saran AI');
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
        d: "M7 2v3M7 9v3M2 7h3M9 7h3M3.5 3.5l2 2M8.5 8.5l2 2M3.5 10.5l2-2M8.5 5.5l2-2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        value: (__VLS_ctx.search),
        type: "text",
        placeholder: "Cari nama vendor",
        ...{ class: "input" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "flex items-center gap-2 cursor-pointer text-sm text-ink-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "checkbox",
        ...{ class: "h-4 w-4 cursor-pointer accent-amber" },
    });
    (__VLS_ctx.onlyWithProducts);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "flex items-center gap-2 cursor-pointer text-sm text-ink-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "checkbox",
        ...{ class: "h-4 w-4 cursor-pointer accent-amber" },
    });
    (__VLS_ctx.onlyWithEmail);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-2 pt-3 rule-t" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-between" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    if (__VLS_ctx.createIndustryFilter.size) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.clearCreateIndustries) },
            type: "button",
            ...{ class: "text-xs text-ink-mute hover:text-amber" },
        });
    }
    if (__VLS_ctx.industriesQuery.isLoading.value) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-xs text-ink-mute" },
        });
    }
    else if (__VLS_ctx.availableCreateIndustries.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-xs text-ink-mute" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "labs-rail-cats flex flex-wrap gap-1.5" },
        });
        for (const [cat] of __VLS_getVForSourceType((__VLS_ctx.availableCreateIndustries))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeTab === 'create'))
                            return;
                        if (!!(__VLS_ctx.industriesQuery.isLoading.value))
                            return;
                        if (!!(__VLS_ctx.availableCreateIndustries.length === 0))
                            return;
                        __VLS_ctx.toggleCreateIndustry(cat.name);
                    } },
                key: (cat.name),
                type: "button",
                ...{ class: "labs-cat-chip labs-cat-chip--sm" },
                ...{ class: ({ 'labs-cat-chip--active': __VLS_ctx.createIndustryFilter.has(cat.name) }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "labs-cat-chip__label" },
            });
            (cat.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "num labs-cat-chip__num" },
            });
            (cat.count);
        }
    }
    if (__VLS_ctx.createIndustryFilter.size) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-xs text-ink-mute" },
        });
        (__VLS_ctx.createIndustryFilter.size);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-3 pt-3 rule-t" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        value: (__VLS_ctx.hint),
        type: "text",
        placeholder: "Contoh: layanan B2B sektor pertahanan",
        ...{ class: "input" },
    });
    if (__VLS_ctx.missingEmail.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "pill pill-warn" },
        });
        (__VLS_ctx.missingEmail.length);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openCombine) },
        ...{ class: "btn btn-amber btn-lg w-full justify-between" },
        type: "button",
        disabled: (!__VLS_ctx.canCombine || __VLS_ctx.combineLoading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.combineLoading ? 'Generating…' : 'Combine ' + __VLS_ctx.selected.size);
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
    if (__VLS_ctx.selected.size > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'create'))
                        return;
                    if (!(__VLS_ctx.selected.size > 0))
                        return;
                    __VLS_ctx.selected = new Set();
                } },
            ...{ class: "btn btn-ghost btn-sm w-full" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "labs-canvas-right" },
    });
    if (__VLS_ctx.lastFusion) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "labs-spotlight" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "bezel bezel-lg" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "bezel-core p-6" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between mb-4" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow eyebrow-accent" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "live-dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num text-ink" },
            ...{ style: {} },
        });
        (__VLS_ctx.lastFusion.name);
        /** @type {[typeof LabsFusionResult, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(LabsFusionResult, new LabsFusionResult({
            fusion: (__VLS_ctx.lastFusion),
        }));
        const __VLS_1 = __VLS_0({
            fusion: (__VLS_ctx.lastFusion),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    }
    if (__VLS_ctx.suggestions.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "labs-suggestions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between mb-3 px-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-ink-mute text-xs num" },
        });
        (__VLS_ctx.suggestions.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3" },
        });
        for (const [s, idx] of __VLS_getVForSourceType((__VLS_ctx.suggestions))) {
            /** @type {[typeof LabsSuggestionCard, ]} */ ;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent(LabsSuggestionCard, new LabsSuggestionCard({
                ...{ 'onUseSuggestion': {} },
                key: (idx),
                suggestion: (s),
                vendorMap: (__VLS_ctx.candidateMap),
            }));
            const __VLS_4 = __VLS_3({
                ...{ 'onUseSuggestion': {} },
                key: (idx),
                suggestion: (s),
                vendorMap: (__VLS_ctx.candidateMap),
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
            let __VLS_6;
            let __VLS_7;
            let __VLS_8;
            const __VLS_9 = {
                onUseSuggestion: (__VLS_ctx.useSuggestion)
            };
            var __VLS_5;
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "labs-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-between mb-3 px-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow" },
    });
    (__VLS_ctx.candidates.length);
    (__VLS_ctx.candidatesTotal);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num text-ink-mute text-xs" },
    });
    (__VLS_ctx.candidatesHasMore ? 'masih ada' : 'habis');
    if (__VLS_ctx.candidatesLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "py-16 text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "dot dot-amber pulse-soft mx-auto inline-block" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "label label-mute mt-3" },
        });
    }
    else if (__VLS_ctx.candidatesError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "py-16 text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-ink-mute" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "label label-mute mt-3" },
        });
        (__VLS_ctx.candidatesError);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.refreshCandidates) },
            ...{ class: "btn btn-ghost btn-sm mt-3" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else if (__VLS_ctx.candidates.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "py-16 text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-ink-mute" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "label label-mute mt-3" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-xs text-ink-mute mt-1" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" },
        });
        for (const [v] of __VLS_getVForSourceType((__VLS_ctx.candidates))) {
            /** @type {[typeof LabsVendorCard, ]} */ ;
            // @ts-ignore
            const __VLS_10 = __VLS_asFunctionalComponent(LabsVendorCard, new LabsVendorCard({
                ...{ 'onToggle': {} },
                ...{ 'onDeepen': {} },
                key: (v.vendor_id),
                vendor: (v),
                selected: (__VLS_ctx.selected.has(v.vendor_id)),
                busyDeepen: (__VLS_ctx.deepenBusy.has(v.vendor_id)),
            }));
            const __VLS_11 = __VLS_10({
                ...{ 'onToggle': {} },
                ...{ 'onDeepen': {} },
                key: (v.vendor_id),
                vendor: (v),
                selected: (__VLS_ctx.selected.has(v.vendor_id)),
                busyDeepen: (__VLS_ctx.deepenBusy.has(v.vendor_id)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_10));
            let __VLS_13;
            let __VLS_14;
            let __VLS_15;
            const __VLS_16 = {
                onToggle: (__VLS_ctx.toggleVendor)
            };
            const __VLS_17 = {
                onDeepen: (__VLS_ctx.deepenVendor)
            };
            var __VLS_12;
        }
        if (__VLS_ctx.candidatesHasMore) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "labs-loadmore mt-5 flex flex-col items-center gap-2" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex gap-2" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.loadMoreCandidates) },
                ...{ class: "btn btn-ghost btn-sm" },
                type: "button",
                disabled: (__VLS_ctx.loadMoreBusy),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.loadMoreBusy ? 'Loading' : 'Muat 100 berikutnya');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.loadAllCandidates) },
                ...{ class: "btn btn-amber btn-sm" },
                type: "button",
                disabled: (__VLS_ctx.loadMoreBusy),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.loadMoreBusy ? 'Muat semua' : 'Muat semua sisa');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-xs text-ink-mute" },
            });
            (__VLS_ctx.candidates.length);
            (__VLS_ctx.candidatesTotal);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mt-5 text-center text-xs text-ink-mute" },
            });
            (__VLS_ctx.candidatesTotal);
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "labs-history" },
    });
    if (__VLS_ctx.historyDetail) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "bezel bezel-lg" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "bezel-core p-6" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between mb-4" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow eyebrow-accent" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeTab === 'create'))
                        return;
                    if (!(__VLS_ctx.historyDetail))
                        return;
                    __VLS_ctx.historyDetail = null;
                } },
            ...{ class: "btn btn-ghost btn-sm" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        /** @type {[typeof LabsFusionResult, ]} */ ;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent(LabsFusionResult, new LabsFusionResult({
            fusion: (__VLS_ctx.historyDetail),
        }));
        const __VLS_19 = __VLS_18({
            fusion: (__VLS_ctx.historyDetail),
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "labs-history__list" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between mb-4 px-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num text-ink-mute text-xs" },
        });
        (__VLS_ctx.filteredHistoryItems.length);
        (__VLS_ctx.historyItems.length);
        if (__VLS_ctx.availableCategories.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "labs-history__filter mb-4 px-2 flex flex-wrap items-center gap-1.5" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "eyebrow eyebrow-mute mr-2" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.activeTab === 'create'))
                            return;
                        if (!!(__VLS_ctx.historyDetail))
                            return;
                        if (!(__VLS_ctx.availableCategories.length))
                            return;
                        __VLS_ctx.categoryFilter = '';
                    } },
                type: "button",
                ...{ class: "labs-cat-chip" },
                ...{ class: ({ 'labs-cat-chip--active': !__VLS_ctx.categoryFilter }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "num labs-cat-chip__num" },
            });
            (__VLS_ctx.historyItems.length);
            for (const [cat] of __VLS_getVForSourceType((__VLS_ctx.availableCategories))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.activeTab === 'create'))
                                return;
                            if (!!(__VLS_ctx.historyDetail))
                                return;
                            if (!(__VLS_ctx.availableCategories.length))
                                return;
                            __VLS_ctx.categoryFilter = __VLS_ctx.categoryFilter === cat.name ? '' : cat.name;
                        } },
                    key: (cat.name),
                    type: "button",
                    ...{ class: "labs-cat-chip" },
                    ...{ class: ({ 'labs-cat-chip--active': __VLS_ctx.categoryFilter === cat.name }) },
                });
                (cat.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "num labs-cat-chip__num" },
                });
                (cat.count);
            }
        }
        if (__VLS_ctx.historyQuery.isLoading.value) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "py-16 text-center" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                ...{ class: "dot dot-amber pulse-soft mx-auto inline-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "label label-mute mt-3" },
            });
        }
        else if (__VLS_ctx.historyItems.length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "py-16 text-center" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-ink-mute" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "label label-mute mt-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "text-xs text-ink-mute mt-1" },
            });
        }
        else if (__VLS_ctx.filteredHistoryItems.length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "py-16 text-center" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-ink-mute" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "label label-mute mt-3" },
            });
            (__VLS_ctx.categoryFilter);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.activeTab === 'create'))
                            return;
                        if (!!(__VLS_ctx.historyDetail))
                            return;
                        if (!!(__VLS_ctx.historyQuery.isLoading.value))
                            return;
                        if (!!(__VLS_ctx.historyItems.length === 0))
                            return;
                        if (!(__VLS_ctx.filteredHistoryItems.length === 0))
                            return;
                        __VLS_ctx.categoryFilter = '';
                    } },
                ...{ class: "btn btn-ghost btn-sm mt-3" },
                type: "button",
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" },
            });
            for (const [f] of __VLS_getVForSourceType((__VLS_ctx.filteredHistoryItems))) {
                /** @type {[typeof LabsFusionResult, ]} */ ;
                // @ts-ignore
                const __VLS_21 = __VLS_asFunctionalComponent(LabsFusionResult, new LabsFusionResult({
                    ...{ 'onOpenDetail': {} },
                    key: (f.fusion_id),
                    fusion: f,
                    compact: true,
                }));
                const __VLS_22 = __VLS_21({
                    ...{ 'onOpenDetail': {} },
                    key: (f.fusion_id),
                    fusion: f,
                    compact: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_21));
                let __VLS_24;
                let __VLS_25;
                let __VLS_26;
                const __VLS_27 = {
                    onOpenDetail: (__VLS_ctx.openHistoryDetail)
                };
                var __VLS_23;
            }
        }
    }
}
/** @type {[typeof ConfirmCountdownModal, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(ConfirmCountdownModal, new ConfirmCountdownModal({
    ...{ 'onConfirm': {} },
    open: (__VLS_ctx.showConfirm),
    title: "Yakin mau combine?",
    body: ('Ini eksperimen, hasilnya bisa ga sesuai ekspektasi. AI bisa salah saran produk dan email draft.\nLo bertanggung jawab review hasilnya sebelum kirim email beneran ke vendor.\n\nLanjut?'),
    countdown: (3),
    confirmLabel: "Setuju, Combine",
    cancelLabel: "Batal",
    tone: "danger",
}));
const __VLS_29 = __VLS_28({
    ...{ 'onConfirm': {} },
    open: (__VLS_ctx.showConfirm),
    title: "Yakin mau combine?",
    body: ('Ini eksperimen, hasilnya bisa ga sesuai ekspektasi. AI bisa salah saran produk dan email draft.\nLo bertanggung jawab review hasilnya sebelum kirim email beneran ke vendor.\n\nLanjut?'),
    countdown: (3),
    confirmLabel: "Setuju, Combine",
    cancelLabel: "Batal",
    tone: "danger",
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
let __VLS_31;
let __VLS_32;
let __VLS_33;
const __VLS_34 = {
    onConfirm: (__VLS_ctx.doCombine)
};
var __VLS_30;
/** @type {__VLS_StyleScopedClasses['labs-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-hero__ticker-stamp']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__body']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__copy']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-hero__tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab--active']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab__num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab--active']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-tab__num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-bench']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-rail']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-core']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-5']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-rail__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['h-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-4']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['accent-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['h-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-4']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['accent-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-rail-cats']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip--sm']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip--active']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip__label']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip__num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-canvas-right']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-spotlight']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-core']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['live-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-suggestions']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['xl:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['2xl:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['py-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['pulse-soft']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-block']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['xl:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-loadmore']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-history']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['bezel-core']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-history__list']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-history__filter']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-2']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip--active']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip__num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip--active']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-cat-chip__num']} */ ;
/** @type {__VLS_StyleScopedClasses['py-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['pulse-soft']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-block']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['py-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['xl:grid-cols-3']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ConfirmCountdownModal: ConfirmCountdownModal,
            LabsFusionResult: LabsFusionResult,
            LabsSuggestionCard: LabsSuggestionCard,
            LabsVendorCard: LabsVendorCard,
            activeTab: activeTab,
            search: search,
            onlyWithEmail: onlyWithEmail,
            onlyWithProducts: onlyWithProducts,
            createIndustryFilter: createIndustryFilter,
            selected: selected,
            hint: hint,
            showConfirm: showConfirm,
            candidatesTotal: candidatesTotal,
            candidatesHasMore: candidatesHasMore,
            candidatesLoading: candidatesLoading,
            candidatesError: candidatesError,
            loadMoreBusy: loadMoreBusy,
            industriesQuery: industriesQuery,
            availableCreateIndustries: availableCreateIndustries,
            refreshCandidates: refreshCandidates,
            loadMoreCandidates: loadMoreCandidates,
            loadAllCandidates: loadAllCandidates,
            toggleCreateIndustry: toggleCreateIndustry,
            clearCreateIndustries: clearCreateIndustries,
            candidates: candidates,
            candidateMap: candidateMap,
            suggestions: suggestions,
            suggestLoading: suggestLoading,
            fetchSuggestions: fetchSuggestions,
            useSuggestion: useSuggestion,
            toggleVendor: toggleVendor,
            missingEmail: missingEmail,
            canCombine: canCombine,
            deepenBusy: deepenBusy,
            deepenVendor: deepenVendor,
            combineLoading: combineLoading,
            lastFusion: lastFusion,
            openCombine: openCombine,
            doCombine: doCombine,
            historyQuery: historyQuery,
            categoryFilter: categoryFilter,
            historyItems: historyItems,
            availableCategories: availableCategories,
            filteredHistoryItems: filteredHistoryItems,
            historyDetail: historyDetail,
            openHistoryDetail: openHistoryDetail,
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
