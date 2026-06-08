/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api } from '@/api/client';
import PageHeader from '@/components/shell/PageHeader.vue';
import GeoAvatar from '@/components/GeoAvatar.vue';
import TagBadge from '@/components/TagBadge.vue';
import { exportCsv } from '@/composables/useCsvExport';
import { resolveCountry, flagEmoji } from '@/data/country_resolver';
const route = useRoute();
const router = useRouter();
const search = ref('');
const industry = ref('');
const country = ref(typeof route.query.country === 'string' ? route.query.country : '');
const status = ref('enriched');
const PAGE_SIZE = 250;
const page = ref(1);
watch([search, industry, country, status], () => { page.value = 1; });
watch(() => route.query.country, (next) => { country.value = typeof next === 'string' ? next : ''; });
const countryFlag = computed(() => {
    if (!country.value)
        return '';
    const rec = resolveCountry(country.value);
    return rec ? flagEmoji(rec.cca2) : '';
});
function clearCountryFilter() {
    country.value = '';
    const next = { ...route.query };
    delete next.country;
    router.replace({ path: route.path, query: next });
}
const countriesQ = useQuery({
    queryKey: ['stats', 'countries-all'],
    queryFn: () => api.stats.countries(50),
});
// Semantic when the user typed a free-form query (2+ chars). LIKE/admin path
// when search is empty or one char, so industry/country/status filters still
// route through list_paginated. Result shape is unified into {items, total}
// downstream so the table doesn't need to branch.
const { data, isLoading } = useQuery({
    queryKey: ['vendors', { search, industry, country, status, page }],
    queryFn: async () => {
        const term = search.value.trim();
        if (term.length >= 2) {
            const res = await api.vendorsSemantic(term, Math.min(50, 200), country.value || undefined);
            return {
                items: res.items,
                total: res.items.length,
                limit: res.limit,
                offset: 0,
                degraded: res.degraded,
                mode: res.mode,
            };
        }
        const res = await api.vendors({
            search: term,
            industry: industry.value,
            country: country.value,
            status: status.value || undefined,
            limit: PAGE_SIZE,
            offset: (page.value - 1) * PAGE_SIZE,
            sort: 'scope_match_score:desc',
        });
        return { ...res, degraded: false, mode: null };
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
});
const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const isDegraded = computed(() => Boolean(data.value?.degraded));
const searchMode = computed(() => data.value?.mode ?? null);
const semanticActive = computed(() => search.value.trim().length >= 2);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const canPrev = computed(() => page.value > 1 && !semanticActive.value);
const canNext = computed(() => page.value < totalPages.value && !semanticActive.value);
function goNext() { if (canNext.value)
    page.value += 1; }
function goPrev() { if (canPrev.value)
    page.value -= 1; }
function statusTone(s) {
    if (s === 'enriched')
        return { color: 'ok', label: 'OK' };
    if (s === 'unresolved')
        return { color: 'mute', label: 'BELUM' };
    if (s === 'enrich_failed')
        return { color: 'crit', label: 'GAGAL' };
    if (s === 'scope_rejected')
        return { color: 'warn', label: 'OFF' };
    if (s === 'validation_rejected')
        return { color: 'warn', label: 'TIPIS' };
    return { color: 'mute', label: s.toUpperCase() };
}
function handleExport() {
    exportCsv('vendors_export.csv', items.value, [
        { key: (v) => v.domain ?? '', label: 'Domain' },
        { key: 'company_name', label: 'Company' },
        { key: 'status', label: 'Status' },
        { key: (v) => v.industries.join('|'), label: 'Industries' },
        { key: (v) => v.address?.country ?? '', label: 'Country' },
        { key: (v) => Math.round((v.scope_match_score ?? 0) * 100), label: 'Scope %' },
        { key: (v) => (v.military_categories ?? []).join('|'), label: 'Military Categories' },
        { key: (v) => v.contacts.find((c) => c.type === 'email')?.value ?? '', label: 'Email' },
        { key: (v) => v.contacts.find((c) => c.type === 'phone')?.value ?? '', label: 'Phone' },
        { key: (v) => v.canonical_url ?? '', label: 'URL' },
        { key: (v) => v.catalog_count ?? 0, label: 'Catalog Count' },
        { key: (v) => v.expos_seen.join('|'), label: 'Expos' },
    ]);
}
function scopePct(v) {
    return Math.round(Math.min(100, (v.scope_match_score ?? 0) * 100));
}
function contactTag(v) {
    const bits = [];
    if (v.has_email)
        bits.push('EML');
    if (v.has_phone)
        bits.push('TLP');
    if (v.has_website)
        bits.push('WEB');
    if (v.catalog_count && v.catalog_count > 0)
        bits.push('KAT');
    return bits.join(' · ') || '—';
}
const stats = computed(() => [
    { label: 'Total', value: total.value.toLocaleString(), tone: 'amber' },
    { label: 'Termuat', value: items.value.length, tone: 'mute' },
]);
const STATUS_OPTIONS = [
    { value: '', label: 'Semua status' },
    { value: 'enriched', label: 'Enriched' },
    { value: 'unresolved', label: 'Belum resolve' },
    { value: 'enrich_failed', label: 'Gagal' },
    { value: 'scope_rejected', label: 'Off-scope' },
    { value: 'validation_rejected', label: 'Tipis' },
];
const INDUSTRY_OPTIONS = [
    { value: '', label: 'Semua industri' },
    { value: 'defense', label: 'Defense' },
    { value: 'cybersecurity', label: 'Cybersecurity' },
    { value: 'law_enforcement', label: 'Law Enforcement' },
    { value: 'surveillance', label: 'Surveillance' },
    { value: 'aerospace', label: 'Aerospace' },
];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col" },
});
/** @type {[typeof PageHeader, typeof PageHeader, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PageHeader, new PageHeader({
    title: "Vendor Registry",
    subtitle: "Indeks semua exhibitor yang sudah ter-enriched + yang menunggu resolusi",
    stats: (__VLS_ctx.stats),
}));
const __VLS_1 = __VLS_0({
    title: "Vendor Registry",
    subtitle: "Indeks semua exhibitor yang sudah ter-enriched + yang menunggu resolusi",
    stats: (__VLS_ctx.stats),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_2.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleExport) },
        ...{ class: "btn btn-ghost h-9" },
        disabled: (!__VLS_ctx.items.length),
    });
    const __VLS_3 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(__VLS_3, new __VLS_3({
        icon: (['fas', 'arrow-up-right-from-square']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_5 = __VLS_4({
        icon: (['fas', 'arrow-up-right-from-square']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
var __VLS_2;
if (__VLS_ctx.country) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-between bg-amber/5 rule-b border-amber/30 px-6 py-2.5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2 text-[12px]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[15px]" },
    });
    (__VLS_ctx.countryFlag);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-amber" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-ink" },
    });
    (__VLS_ctx.country);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearCountryFilter) },
        ...{ class: "btn btn-ghost h-7 px-2" },
        type: "button",
        title: "Hapus filter",
    });
    const __VLS_7 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_9 = __VLS_8({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-b bg-bg flex items-center gap-2 px-6 py-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "relative flex-1 max-w-md" },
});
const __VLS_11 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
    icon: (['fas', 'magnifying-glass']),
    ...{ class: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-mute" },
}));
const __VLS_13 = __VLS_12({
    icon: (['fas', 'magnifying-glass']),
    ...{ class: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-mute" },
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    value: (__VLS_ctx.search),
    type: "text",
    placeholder: "Cari berdasarkan keahlian, produk, atau industri",
    ...{ class: "input pl-8 h-9" },
});
if (!__VLS_ctx.semanticActive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.status),
        ...{ class: "input h-9 w-44" },
    });
    for (const [o] of __VLS_getVForSourceType((__VLS_ctx.STATUS_OPTIONS))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (o.value),
            value: (o.value),
        });
        (o.label);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.industry),
        ...{ class: "input h-9 w-44" },
    });
    for (const [o] of __VLS_getVForSourceType((__VLS_ctx.INDUSTRY_OPTIONS))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (o.value),
            value: (o.value),
        });
        (o.label);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    value: (__VLS_ctx.country),
    ...{ class: "input h-9 w-44" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "",
});
for (const [c] of __VLS_getVForSourceType((__VLS_ctx.countriesQ.data.value ?? []))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        key: (c.country),
        value: (c.country),
    });
    (c.country);
    (c.count);
}
if (__VLS_ctx.semanticActive) {
    const __VLS_15 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
        to: "/cari",
        ...{ class: "label label-amber flex items-center gap-1.5 hover:underline" },
        title: "Buka ruang pencarian penuh",
    }));
    const __VLS_17 = __VLS_16({
        to: "/cari",
        ...{ class: "label label-amber flex items-center gap-1.5 hover:underline" },
        title: "Buka ruang pencarian penuh",
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    __VLS_18.slots.default;
    const __VLS_19 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
        icon: (['fas', 'expand']),
        ...{ class: "text-[9px]" },
    }));
    const __VLS_21 = __VLS_20({
        icon: (['fas', 'expand']),
        ...{ class: "text-[9px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    var __VLS_18;
}
if (__VLS_ctx.isLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ml-auto label label-amber flex items-center gap-1.5" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dot dot-amber pulse-amber" },
    });
}
else if (__VLS_ctx.isDegraded) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ml-auto label label-warn" },
    });
}
else if (__VLS_ctx.searchMode === 'semantic') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ml-auto label label-amber" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ml-auto label label-mute" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex-1 overflow-auto" },
});
if (__VLS_ctx.items.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "ledger w-full" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[22%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[14%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[7%] text-center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[16%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[9%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[14%]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[10%] text-right" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "w-[8%] text-center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [row] of __VLS_getVForSourceType((__VLS_ctx.items))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (row.vendor_id),
            ...{ class: "vendor-row cursor-pointer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        const __VLS_23 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
            to: (`/vendors/${row.vendor_id || row.domain}`),
            ...{ class: "flex items-center gap-3 group" },
        }));
        const __VLS_25 = __VLS_24({
            to: (`/vendors/${row.vendor_id || row.domain}`),
            ...{ class: "flex items-center gap-3 group" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        __VLS_26.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vendor-row__avatar" },
            'data-elite': ((row.scope_match_score ?? 0) >= 0.5 ? 'true' : 'false'),
            'data-elite-style': "inset",
        });
        if (row.logo_url) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                src: (row.logo_url),
                alt: (row.company_name),
                ...{ class: "vendor-row__logo" },
                referrerpolicy: "no-referrer",
            });
        }
        else {
            /** @type {[typeof GeoAvatar, ]} */ ;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent(GeoAvatar, new GeoAvatar({
                seed: (row.vendor_id || row.domain || row.company_name),
                fallback: (row.company_name),
                size: (36),
            }));
            const __VLS_28 = __VLS_27({
                seed: (row.vendor_id || row.domain || row.company_name),
                fallback: (row.company_name),
                size: (36),
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "truncate text-ink group-hover:text-amber transition-colors" },
        });
        (row.company_name);
        var __VLS_26;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        if (row.domain) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "num-display text-[11.5px] text-ink-2 truncate block" },
            });
            (row.domain);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-ink-mute" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "pill" },
            ...{ class: (`pill-${__VLS_ctx.statusTone(row.status).color}`) },
        });
        (__VLS_ctx.statusTone(row.status).label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-wrap gap-1" },
        });
        for (const [tag] of __VLS_getVForSourceType((row.industries.slice(0, 2)))) {
            /** @type {[typeof TagBadge, ]} */ ;
            // @ts-ignore
            const __VLS_30 = __VLS_asFunctionalComponent(TagBadge, new TagBadge({
                key: (tag),
                raw: (tag),
                size: "xs",
            }));
            const __VLS_31 = __VLS_30({
                key: (tag),
                raw: (tag),
                size: "xs",
            }, ...__VLS_functionalComponentArgsRest(__VLS_30));
        }
        if (row.industries.length > 2) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-[10px] text-ink-mute self-center" },
            });
            (row.industries.length - 2);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        if (row.address?.country) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "flex items-center gap-1.5 text-[12.5px]" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-[14px]" },
            });
            (__VLS_ctx.flagEmoji(__VLS_ctx.resolveCountry(row.address.country)?.cca2 ?? ''));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "truncate" },
            });
            (row.address.country);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-ink-mute" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex flex-wrap gap-1" },
        });
        for (const [tech] of __VLS_getVForSourceType(((row.tech_stack ?? []).slice(0, 3)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (tech),
                ...{ class: "text-[10px] px-1.5 py-0.5 rounded-[3px] bg-surface-2 text-ink-2 border border-rule" },
            });
            (tech);
        }
        if (!row.tech_stack?.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-ink-mute" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "text-right" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-end gap-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "w-14 h-1 rounded-[1px] bg-surface-2 overflow-hidden" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "h-full bg-amber rounded-[1px]" },
            ...{ style: ({ width: `${__VLS_ctx.scopePct(row)}%` }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num-display text-[11.5px] tabular-nums w-9" },
        });
        (__VLS_ctx.scopePct(row));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "pill text-[9.5px]" },
        });
        (__VLS_ctx.contactTag(row));
    }
}
else if (!__VLS_ctx.isLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col items-center justify-center py-24 gap-3" },
    });
    const __VLS_33 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        icon: (['fas', 'building']),
        ...{ class: "text-[28px] text-ink-mute" },
    }));
    const __VLS_35 = __VLS_34({
        icon: (['fas', 'building']),
        ...{ class: "text-[28px] text-ink-mute" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[12px] text-ink-mute" },
    });
}
if (!__VLS_ctx.semanticActive && __VLS_ctx.total > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-t bg-bg flex items-center justify-between px-6 py-3 text-[12px]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-ink-mute" },
    });
    (__VLS_ctx.page);
    (__VLS_ctx.totalPages);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display text-ink ml-2" },
    });
    (__VLS_ctx.total.toLocaleString());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display text-ink-mute ml-1" },
    });
    (__VLS_ctx.items.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.goPrev) },
        ...{ class: "btn btn-ghost h-8" },
        disabled: (!__VLS_ctx.canPrev),
    });
    const __VLS_37 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        icon: (['fas', 'chevron-left']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_39 = __VLS_38({
        icon: (['fas', 'chevron-left']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.goNext) },
        ...{ class: "btn btn-ghost h-8" },
        disabled: (!__VLS_ctx.canNext),
    });
    const __VLS_41 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        icon: (['fas', 'chevron-right']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_43 = __VLS_42({
        icon: (['fas', 'chevron-right']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
}
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber/5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-amber/30']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[15px]']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-7']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-3']} */ ;
/** @type {__VLS_StyleScopedClasses['top-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['-translate-y-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['pl-8']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['w-44']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['w-44']} */ ;
/** @type {__VLS_StyleScopedClasses['input']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['w-44']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:underline']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['pulse-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['ledger']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[22%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[14%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[7%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[16%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[9%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[14%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[10%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[8%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['vendor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['vendor-row__avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['vendor-row__logo']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['self-center']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[14px]']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[3px]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-14']} */ ;
/** @type {__VLS_StyleScopedClasses['h-1']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[1px]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-2']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[1px]']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['w-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['py-24']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[28px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-2']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            PageHeader: PageHeader,
            GeoAvatar: GeoAvatar,
            TagBadge: TagBadge,
            resolveCountry: resolveCountry,
            flagEmoji: flagEmoji,
            search: search,
            industry: industry,
            country: country,
            status: status,
            page: page,
            countryFlag: countryFlag,
            clearCountryFilter: clearCountryFilter,
            countriesQ: countriesQ,
            isLoading: isLoading,
            items: items,
            total: total,
            isDegraded: isDegraded,
            searchMode: searchMode,
            semanticActive: semanticActive,
            totalPages: totalPages,
            canPrev: canPrev,
            canNext: canNext,
            goNext: goNext,
            goPrev: goPrev,
            statusTone: statusTone,
            handleExport: handleExport,
            scopePct: scopePct,
            contactTag: contactTag,
            stats: stats,
            STATUS_OPTIONS: STATUS_OPTIONS,
            INDUSTRY_OPTIONS: INDUSTRY_OPTIONS,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
