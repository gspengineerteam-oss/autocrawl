/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import { useNumberTicker } from '@/composables/useNumberTicker';
/**
 * KPI strip - 5 tiles in a row across the full width, separated by
 * vertical hairlines. Matches the reference image layout: small label
 * top, big amber number, small delta/unit hint below.
 *
 * All numbers from real backend endpoints. Numbers tick odometer-style
 * via useNumberTicker.
 */
const overview = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
    refetchInterval: 30000,
});
const timeline = useQuery({
    queryKey: ['stats', 'timeline', 30],
    queryFn: () => api.stats.timeline(30),
    refetchInterval: 60000,
});
const industries = useQuery({
    queryKey: ['stats', 'industries'],
    queryFn: api.stats.industries,
    refetchInterval: 60000,
});
const expoCountries = useQuery({
    queryKey: ['stats', 'expo-countries'],
    queryFn: api.stats.expoCountries,
    refetchInterval: 60000,
});
const vendorCountries = useQuery({
    queryKey: ['stats', 'countries'],
    queryFn: () => api.stats.countries(50),
    refetchInterval: 60000,
});
const totals = computed(() => ({
    vendors: overview.data.value?.vendors_total ?? 0,
    expos: overview.data.value?.expos_total ?? 0,
    industries: industries.data.value?.length ?? 0,
    countries: (() => {
        const set = new Set();
        for (const r of (vendorCountries.data.value ?? []))
            if (r.country)
                set.add(r.country);
        for (const r of (expoCountries.data.value ?? []))
            if (r.country)
                set.add(r.country);
        return set.size;
    })(),
}));
const deltaPct = computed(() => {
    const points = timeline.data.value ?? [];
    if (points.length < 2)
        return 0;
    const half = Math.floor(points.length / 2);
    const earlySum = points.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    const lateSum = points.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
    if (earlySum === 0)
        return lateSum > 0 ? 100 : 0;
    return ((lateSum - earlySum) / earlySum) * 100;
});
const newLeads = computed(() => {
    const points = timeline.data.value ?? [];
    return points.slice(-7).reduce((s, p) => s + (p.vendors_added ?? 0), 0);
});
const tickedVendors = useNumberTicker(computed(() => totals.value.vendors), { duration: 500 });
const tickedExpos = useNumberTicker(computed(() => totals.value.expos), { duration: 500 });
const tickedIndustries = useNumberTicker(computed(() => totals.value.industries), { duration: 500 });
const tickedCountries = useNumberTicker(computed(() => totals.value.countries), { duration: 500 });
const tickedNewLeads = useNumberTicker(computed(() => newLeads.value), { duration: 500 });
function fmtCommas(n) { return n.toLocaleString('en-US'); }
const tiles = computed(() => [
    {
        label: 'Total Vendor',
        unit: '30D',
        value: tickedVendors.value,
        delta: {
            value: `${deltaPct.value >= 0 ? '+' : ''}${deltaPct.value.toFixed(1)}%`,
            positive: deltaPct.value >= 0,
        },
    },
    { label: 'Industri', unit: 'tag', value: tickedIndustries.value },
    { label: 'Ekspo', unit: 'edisi', value: tickedExpos.value },
    { label: 'Baru · 7D', unit: 'vendor', value: tickedNewLeads.value },
    { label: 'Negara', unit: 'jangkauan', value: tickedCountries.value },
]);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "rule-b bg-bg relative z-30 grid grid-cols-5" },
});
for (const [tile, i] of __VLS_getVForSourceType((__VLS_ctx.tiles))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (tile.label),
        ...{ class: ([
                'flex flex-col px-5 py-3.5',
                i < __VLS_ctx.tiles.length - 1 ? 'rule-r' : '',
            ]) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-baseline justify-between mb-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label" },
    });
    (tile.label);
    if (tile.delta) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num-display text-[10.5px] tabular-nums" },
            ...{ class: (tile.delta.positive ? 'text-ok' : 'text-crit') },
        });
        const __VLS_0 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            icon: (['fas', tile.delta.positive ? 'arrow-up' : 'arrow-down']),
            ...{ class: "text-[8px] mr-0.5" },
        }));
        const __VLS_2 = __VLS_1({
            icon: (['fas', tile.delta.positive ? 'arrow-up' : 'arrow-down']),
            ...{ class: "text-[8px] mr-0.5" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        (tile.delta.value);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        (tile.unit);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-baseline gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "kpi-num" },
    });
    (__VLS_ctx.fmtCommas(tile.value));
    if (tile.delta) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        (tile.unit);
    }
}
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['z-30']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['px-5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tabular-nums']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[8px]']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-num']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            fmtCommas: fmtCommas,
            tiles: tiles,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
