/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { api } from '@/api/client';
import VendorProductCatalog from '@/components/VendorProductCatalog.vue';
import VendorEmailDraftModal from '@/components/VendorEmailDraftModal.vue';
import GeoAvatar from '@/components/GeoAvatar.vue';
import TagBadge from '@/components/TagBadge.vue';
import EnrichmentBadge from '@/components/EnrichmentBadge.vue';
import { downloadVendorDossierPdf } from '@/services/vendorPdfBuilder';
const props = defineProps();
const queryClient = useQueryClient();
const deepening = ref(false);
const downloadingPdf = ref(false);
const emailDraftOpen = ref(false);
const { data, isLoading, isError } = useQuery({
    queryKey: ['vendor', () => props.domain],
    queryFn: () => api.vendor(props.domain),
    refetchInterval: () => (deepening.value ? 4000 : false),
});
async function deepenVendor() {
    if (!data.value || deepening.value)
        return;
    const target = data.value.vendor_id || data.value.domain;
    if (!target)
        return;
    deepening.value = true;
    toast.info('Perdalam vendor diluncurkan', {
        description: 'AI re-enrich sedang berjalan. Skor akan update otomatis.',
    });
    try {
        await api.deepenVendor(target);
        setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['vendor', () => props.domain] });
            queryClient.invalidateQueries({ queryKey: ['vendors'] });
        }, 6000);
        setTimeout(() => {
            deepening.value = false;
            queryClient.invalidateQueries({ queryKey: ['vendor', () => props.domain] });
        }, 30000);
    }
    catch {
        deepening.value = false;
        toast.error('Gagal meluncurkan deepen');
    }
}
async function onDownloadPdf() {
    if (!data.value || downloadingPdf.value)
        return;
    const target = data.value.vendor_id || data.value.domain;
    if (!target)
        return;
    downloadingPdf.value = true;
    toast.info('Menyusun dosir vendor', {
        description: 'AI menulis konten dan diagram. Bisa 30 hingga 60 detik.',
    });
    try {
        const resp = await api.vendorDossierContent(target, 'id');
        await downloadVendorDossierPdf(resp);
        toast.success('PDF tersusun', { description: 'File diunduh ke browser.' });
    }
    catch (err) {
        const e = err;
        const detail = e.response?.data?.detail
            ?? (e.code === 'ECONNABORTED' ? 'Request timeout, coba lagi karena LLM lambat.' : null)
            ?? (e.response?.status ? `HTTP ${e.response.status}` : null)
            ?? e.message
            ?? 'Cek Ollama atau log API.';
        console.error('[vendorPdf] dossier failed:', err);
        toast.error('Gagal menyusun PDF', { description: detail });
    }
    finally {
        downloadingPdf.value = false;
    }
}
async function onDeepenProducts() {
    if (!data.value)
        return;
    const target = data.value.vendor_id || data.value.domain;
    if (!target)
        return;
    toast.info('Enrich produk diluncurkan', {
        description: 'Katalog akan terisi dalam sekitar 1 menit. Refresh halaman.',
    });
    try {
        await api.deepenVendorProducts(target);
        setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['vendor', () => props.domain] });
        }, 90000);
    }
    catch {
        toast.error('Gagal meluncurkan enrich produk');
    }
}
const logoFailed = ref(false);
const showOriginal = ref(false);
const isTranslated = computed(() => data.value?.language_code === 'id' && Boolean(data.value?.translation_method));
const displayDescription = computed(() => showOriginal.value && data.value?.description_original
    ? data.value.description_original
    : data.value?.description ?? null);
const displayTagline = computed(() => showOriginal.value && data.value?.tagline_original
    ? data.value.tagline_original
    : data.value?.tagline ?? null);
const displayProducts = computed(() => showOriginal.value && data.value?.products_original?.length
    ? data.value.products_original
    : data.value?.products ?? []);
const displayIndustries = computed(() => showOriginal.value && data.value?.industries_original?.length
    ? data.value.industries_original
    : data.value?.industries ?? []);
const tab = ref('katalog');
// Snowglobe rule 6 (2026-05-25): KATALOG = outreach priority, jadi tab pertama
// dan disembunyikan kalau vendor belum punya website (canonical_url null).
// SUMBER (provenance) dimatikan sepenuhnya — kita ga klaim source confidence lagi.
const TABS = computed(() => {
    const out = [];
    const hasSite = Boolean(data.value?.canonical_url);
    if (hasSite)
        out.push({ id: 'katalog', label: 'Katalog' });
    out.push({ id: 'profil', label: 'Profil' });
    out.push({ id: 'kontak', label: 'Kontak' });
    out.push({ id: 'json', label: 'JSON' });
    return out;
});
watch(TABS, (next) => {
    if (!next.some((t) => t.id === tab.value)) {
        tab.value = next[0]?.id ?? 'profil';
    }
});
function formatDate(iso) {
    if (!iso)
        return '—';
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
const jsonView = computed(() => (data.value ? JSON.stringify(data.value, null, 2) : ''));
function copyJson() {
    if (!jsonView.value)
        return;
    navigator.clipboard.writeText(jsonView.value);
    toast.success('JSON tersalin');
}
// confidence_score / confidenceTone removed 2026-05-25 — snowglobe reset
// rule 6 drops invented per-source confidence in favor of observable signals
// (contact_count, has_email, has_phone, has_website, scope_match_score).
// True completeness from enrichment_gap (4 default categories: contacts,
// socials, address, products). Falls back to confidence_score when the
// vendor has no gap data (legacy rows pre-2026-05-21).
const GAP_TOTAL = 4;
const completenessPct = computed(() => {
    const v = data.value;
    if (!v)
        return 0;
    const gap = v.enrichment_gap ?? [];
    if (gap.length === 0 && (v.confidence_score ?? 0) > 0) {
        // Legacy enriched without gap tracking — use confidence_score
        return Math.round((v.confidence_score ?? 0) * 100);
    }
    const filled = Math.max(0, GAP_TOTAL - gap.length);
    return Math.round((filled / GAP_TOTAL) * 100);
});
const completenessTone = computed(() => {
    if (completenessPct.value >= 75)
        return 'ok';
    if (completenessPct.value >= 40)
        return 'amber';
    return 'crit';
});
const scopePct = computed(() => data.value?.overall_scope_score != null
    ? Math.round(data.value.overall_scope_score * 100)
    : null);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['vd-back']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo__initials']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo__corner']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-domain']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__bar-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__bar-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__bar-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-spread']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-social']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-dl']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-dl']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__card']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-hero__layout']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo__initials']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-margin']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-folio']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-katalog']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-sumber']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-json']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vd-canvas" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vd-topbar fade-up" },
    ...{ style: {} },
});
const __VLS_0 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "/vendors",
    ...{ class: "vd-back" },
}));
const __VLS_2 = __VLS_1({
    to: "/vendors",
    ...{ class: "vd-back" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "12",
    height: "12",
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "1.6",
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M9 3 5 7l4 4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
var __VLS_3;
if (__VLS_ctx.data) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-ticker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "dot" },
        ...{ class: (__VLS_ctx.deepening ? 'dot-amber dot-glow' : 'dot-mute') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vd-ticker__tag num" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vd-ticker__msg" },
    });
    ((__VLS_ctx.data.domain || 'tanpa-domain').toUpperCase());
    (__VLS_ctx.deepening ? 'MEMPERDALAM' : 'STABIL');
    (__VLS_ctx.formatDate(__VLS_ctx.data.last_enriched_at).toUpperCase());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vd-ticker__stamp" },
    });
    (__VLS_ctx.data.vendor_id ? __VLS_ctx.data.vendor_id.slice(0, 8) : '———');
}
if (__VLS_ctx.isLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "vd-empty__pulse" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute mt-3" },
    });
}
else if (__VLS_ctx.isError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "vd-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-empty__glyph" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "32",
        height: "32",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "12",
        cy: "12",
        r: "9",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m9 9 6 6M15 9l-6 6",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "display-sans text-ink mt-4" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-ink-2 mt-2 max-w-md text-center" },
    });
}
else if (__VLS_ctx.data) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "vd-hero" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-stencil" },
        'aria-hidden': "true",
    });
    ((__VLS_ctx.data.domain || 'TANPA-DOMAIN').toUpperCase());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-hero__layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-identity fade-up" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-logo" },
        'data-elite': ((__VLS_ctx.data.scope_match_score ?? 0) >= 0.5 ? 'true' : 'false'),
    });
    if (__VLS_ctx.data.logo_url && !__VLS_ctx.logoFailed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            ...{ onError: (...[$event]) => {
                    if (!!(__VLS_ctx.isLoading))
                        return;
                    if (!!(__VLS_ctx.isError))
                        return;
                    if (!(__VLS_ctx.data))
                        return;
                    if (!(__VLS_ctx.data.logo_url && !__VLS_ctx.logoFailed))
                        return;
                    __VLS_ctx.logoFailed = true;
                } },
            src: (__VLS_ctx.data.logo_url),
            alt: (`Logo ${__VLS_ctx.data.company_name}`),
            referrerpolicy: "no-referrer",
        });
    }
    else {
        /** @type {[typeof GeoAvatar, ]} */ ;
        // @ts-ignore
        const __VLS_4 = __VLS_asFunctionalComponent(GeoAvatar, new GeoAvatar({
            seed: (__VLS_ctx.data.vendor_id || __VLS_ctx.data.domain || __VLS_ctx.data.company_name),
            fallback: (__VLS_ctx.data.company_name),
            size: (168),
        }));
        const __VLS_5 = __VLS_4({
            seed: (__VLS_ctx.data.vendor_id || __VLS_ctx.data.domain || __VLS_ctx.data.company_name),
            fallback: (__VLS_ctx.data.company_name),
            size: (168),
        }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "vd-logo__corner" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-identity__body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "eyebrow eyebrow-accent" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "vd-name" },
    });
    (__VLS_ctx.data.company_name);
    if (__VLS_ctx.data.canonical_url) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            href: (__VLS_ctx.data.canonical_url),
            target: "_blank",
            rel: "noopener noreferrer",
            ...{ class: "vd-domain" },
        });
        (__VLS_ctx.data.domain ?? 'tanpa domain');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "11",
            height: "11",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 9 9 5M5 5h4v4",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vd-domain vd-domain--mute" },
        });
        (__VLS_ctx.data.domain ?? 'belum ter-resolve');
    }
    if (__VLS_ctx.displayTagline) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.blockquote, __VLS_intrinsicElements.blockquote)({
            ...{ class: "vd-tagline" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vd-tagline__mark" },
        });
        (__VLS_ctx.displayTagline);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vd-tagline__mark" },
        });
    }
    if (__VLS_ctx.data.focus_summary) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "vd-focus" },
        });
        (__VLS_ctx.data.focus_summary);
    }
    if (__VLS_ctx.displayDescription) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "vd-description" },
        });
        (__VLS_ctx.displayDescription);
    }
    if (__VLS_ctx.displayIndustries.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-chips vd-chips--industries" },
        });
        for (const [tag] of __VLS_getVForSourceType((__VLS_ctx.displayIndustries))) {
            /** @type {[typeof TagBadge, ]} */ ;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent(TagBadge, new TagBadge({
                key: (tag),
                raw: (tag),
                size: "sm",
            }));
            const __VLS_8 = __VLS_7({
                key: (tag),
                raw: (tag),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        }
    }
    if (__VLS_ctx.data.domain_of_interest?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-chips" },
        });
        for (const [doi] of __VLS_getVForSourceType((__VLS_ctx.data.domain_of_interest))) {
            /** @type {[typeof TagBadge, ]} */ ;
            // @ts-ignore
            const __VLS_10 = __VLS_asFunctionalComponent(TagBadge, new TagBadge({
                key: (doi),
                raw: (doi),
                size: "sm",
                variant: "outline",
            }));
            const __VLS_11 = __VLS_10({
                key: (doi),
                raw: (doi),
                size: "sm",
                variant: "outline",
            }, ...__VLS_functionalComponentArgsRest(__VLS_10));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "vd-margin fade-up" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-stat" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-stat__num" },
        ...{ class: ({
                'is-ok': __VLS_ctx.completenessTone === 'ok',
                'is-amber': __VLS_ctx.completenessTone === 'amber',
                'is-crit': __VLS_ctx.completenessTone === 'crit',
            }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num" },
    });
    (__VLS_ctx.completenessPct);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vd-stat__unit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-stat__bar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "vd-stat__bar-fill" },
        ...{ class: ({
                'is-ok': __VLS_ctx.completenessTone === 'ok',
                'is-amber': __VLS_ctx.completenessTone === 'amber',
                'is-crit': __VLS_ctx.completenessTone === 'crit',
            }) },
        ...{ style: ({ width: __VLS_ctx.completenessPct + '%' }) },
    });
    if (__VLS_ctx.data.enrichment_gap?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-xs text-ink-mute mt-1 block" },
        });
        (__VLS_ctx.data.enrichment_gap.length);
        (__VLS_ctx.GAP_TOTAL);
    }
    if ((__VLS_ctx.data.contact_count ?? 0) > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-stat" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-stat__num is-ok" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num" },
        });
        (__VLS_ctx.data.contact_count ?? 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vd-stat__unit" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-xs text-ink-mute mt-1 block" },
        });
        (__VLS_ctx.data.has_email ? 'email' : '');
        (__VLS_ctx.data.has_email && __VLS_ctx.data.has_phone ? ' · ' : '');
        (__VLS_ctx.data.has_phone ? 'telepon' : '');
    }
    if (__VLS_ctx.scopePct !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-stat" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-stat__num" },
            ...{ class: ({
                    'is-ok': __VLS_ctx.scopePct >= 70,
                    'is-amber': __VLS_ctx.scopePct >= 40 && __VLS_ctx.scopePct < 70,
                    'is-crit': __VLS_ctx.scopePct < 40,
                }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num" },
        });
        (__VLS_ctx.scopePct);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vd-stat__unit" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-stat__bar" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "vd-stat__bar-fill" },
            ...{ class: ({
                    'is-ok': __VLS_ctx.scopePct >= 70,
                    'is-amber': __VLS_ctx.scopePct >= 40 && __VLS_ctx.scopePct < 70,
                    'is-crit': __VLS_ctx.scopePct < 40,
                }) },
            ...{ style: ({ width: __VLS_ctx.scopePct + '%' }) },
        });
    }
    if (__VLS_ctx.data.funding?.total_raised_usd) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-funding" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-funding__num num" },
        });
        ((__VLS_ctx.data.funding.total_raised_usd / 1_000_000).toFixed(1));
        if (__VLS_ctx.data.funding.last_round) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "vd-funding__round" },
            });
            (__VLS_ctx.data.funding.last_round);
            if (__VLS_ctx.data.funding.last_round_at) {
                (new Date(__VLS_ctx.data.funding.last_round_at).getFullYear());
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.deepenVendor) },
        ...{ class: "btn btn-amber" },
        disabled: (__VLS_ctx.deepening),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.deepening ? 'Memperdalam…' : 'Perdalam');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "btn-icon-nest" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "13",
        height: "13",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.8",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "7",
        cy: "7",
        r: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M7 1v2M7 11v2M1 7h2M11 7h2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.onDownloadPdf) },
        ...{ class: "btn" },
        disabled: (__VLS_ctx.downloadingPdf),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.downloadingPdf ? 'Menyusun…' : 'Unduh PDF');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "btn-icon-nest" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "13",
        height: "13",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.6",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M7 2v8m0 0-3-3m3 3 3-3M2 12h10",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.isLoading))
                    return;
                if (!!(__VLS_ctx.isError))
                    return;
                if (!(__VLS_ctx.data))
                    return;
                __VLS_ctx.emailDraftOpen = true;
            } },
        ...{ class: "btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "btn-icon-nest" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "13",
        height: "13",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.6",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "2",
        y: "3",
        width: "10",
        height: "8",
        rx: "1",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m2 3 5 5 5-5",
    });
    if (__VLS_ctx.isTranslated) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.isLoading))
                        return;
                    if (!!(__VLS_ctx.isError))
                        return;
                    if (!(__VLS_ctx.data))
                        return;
                    if (!(__VLS_ctx.isTranslated))
                        return;
                    __VLS_ctx.showOriginal = !__VLS_ctx.showOriginal;
                } },
            ...{ class: "btn btn-ghost" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.showOriginal ? 'Lihat ID' : 'Lihat EN');
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "atlas-section-mark vd-section-mark" },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "vd-tabs" },
    });
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.TABS))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.isLoading))
                        return;
                    if (!!(__VLS_ctx.isError))
                        return;
                    if (!(__VLS_ctx.data))
                        return;
                    __VLS_ctx.tab = t.id;
                } },
            key: (t.id),
            ...{ class: "vd-tab" },
            ...{ class: ({ 'vd-tab--active': __VLS_ctx.tab === t.id }) },
        });
        (t.label);
    }
    if (__VLS_ctx.tab === 'profil') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "vd-folio" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "vd-folio__main" },
        });
        if (__VLS_ctx.displayProducts.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-spread" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "eyebrow" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-product-chips" },
            });
            for (const [p] of __VLS_getVForSourceType((__VLS_ctx.displayProducts))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (p),
                    ...{ class: "vd-chip vd-chip--product" },
                });
                (p);
            }
        }
        if (__VLS_ctx.data.expos_seen.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-spread" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "eyebrow" },
            });
            (__VLS_ctx.data.expos_seen.length);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-expo-list" },
            });
            for (const [ex] of __VLS_getVForSourceType((__VLS_ctx.data.expos_seen))) {
                const __VLS_13 = {}.RouterLink;
                /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
                // @ts-ignore
                const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
                    key: (ex),
                    to: (`/expos/${ex}`),
                    ...{ class: "vd-expo" },
                }));
                const __VLS_15 = __VLS_14({
                    key: (ex),
                    to: (`/expos/${ex}`),
                    ...{ class: "vd-expo" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_14));
                __VLS_16.slots.default;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "vd-expo__id num" },
                });
                (ex.slice(0, 8));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "vd-expo__label" },
                });
                (ex.slice(0, 6));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "vd-expo__arrow" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    width: "12",
                    height: "12",
                    viewBox: "0 0 14 14",
                    fill: "none",
                    stroke: "currentColor",
                    'stroke-width': "1.6",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M3 7h8M7 3l4 4-4 4",
                });
                var __VLS_16;
            }
        }
        if (__VLS_ctx.data.tech_stack.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-spread" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "eyebrow" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-product-chips" },
            });
            for (const [t] of __VLS_getVForSourceType((__VLS_ctx.data.tech_stack))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (t),
                    ...{ class: "vd-chip vd-chip--tech" },
                });
                (t);
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-spread" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-socials" },
        });
        if (__VLS_ctx.data.socials.linkedin) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
                href: (__VLS_ctx.data.socials.linkedin),
                target: "_blank",
                rel: "noopener noreferrer",
                ...{ class: "vd-social" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "1.6",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
                x: "3",
                y: "3",
                width: "18",
                height: "18",
                rx: "2",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M7 9v8M7 7v.01M11 17v-5M11 17v-3a2 2 0 0 1 4 0v3M15 17v0",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        if (__VLS_ctx.data.socials.twitter) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
                href: (__VLS_ctx.data.socials.twitter),
                target: "_blank",
                rel: "noopener noreferrer",
                ...{ class: "vd-social" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "1.6",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M4 4l7 9-7 7h2l6-6 5 6h4l-8-9 7-7h-2l-5 5-4-5z",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        if (__VLS_ctx.data.socials.github) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
                href: (__VLS_ctx.data.socials.github),
                target: "_blank",
                rel: "noopener noreferrer",
                ...{ class: "vd-social" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "1.6",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M9 19c-4 1-4-2-6-2m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0c-2.4-1.6-3.5-1.3-3.5-1.3a4.2 4.2 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        if (__VLS_ctx.data.socials.youtube) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
                href: (__VLS_ctx.data.socials.youtube),
                target: "_blank",
                rel: "noopener noreferrer",
                ...{ class: "vd-social" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "1.6",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
                x: "2",
                y: "6",
                width: "20",
                height: "12",
                rx: "3",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "m10 9 5 3-5 3z",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        if (__VLS_ctx.data.socials.facebook) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
                href: (__VLS_ctx.data.socials.facebook),
                target: "_blank",
                rel: "noopener noreferrer",
                ...{ class: "vd-social" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "1.6",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        if (!__VLS_ctx.data.socials.linkedin && !__VLS_ctx.data.socials.twitter && !__VLS_ctx.data.socials.youtube && !__VLS_ctx.data.socials.facebook && !__VLS_ctx.data.socials.github) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-ink-mute text-sm" },
            });
        }
        if (__VLS_ctx.data.enrichment_gap.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-gap" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-center justify-between gap-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "eyebrow vd-gap__eyebrow" },
            });
            /** @type {[typeof EnrichmentBadge, ]} */ ;
            // @ts-ignore
            const __VLS_17 = __VLS_asFunctionalComponent(EnrichmentBadge, new EnrichmentBadge({
                gap: (__VLS_ctx.data.enrichment_gap),
                size: "normal",
                showLabel: (true),
            }));
            const __VLS_18 = __VLS_17({
                gap: (__VLS_ctx.data.enrichment_gap),
                size: "normal",
                showLabel: (true),
            }, ...__VLS_functionalComponentArgsRest(__VLS_17));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "vd-gap__body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-gap__chips" },
            });
            for (const [g] of __VLS_getVForSourceType((__VLS_ctx.data.enrichment_gap))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (g),
                    ...{ class: "vd-chip vd-chip--gap" },
                });
                (g);
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
            ...{ class: "vd-folio__margin" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({
            ...{ class: "vd-dl" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.data.registrar ?? '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.data.registrar_country ?? '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
            ...{ class: "num" },
        });
        (__VLS_ctx.data.domain_age_days != null ? `${__VLS_ctx.data.domain_age_days}d` : '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
            ...{ class: "num" },
        });
        (__VLS_ctx.data.first_seen_wayback ?? '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({
            ...{ class: "num" },
        });
        (__VLS_ctx.data.founded_year ?? '—');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow" },
        });
        if (__VLS_ctx.data.address && (__VLS_ctx.data.address.raw || __VLS_ctx.data.address.street || __VLS_ctx.data.address.city || __VLS_ctx.data.address.region || __VLS_ctx.data.address.country)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-addr" },
            });
            if (__VLS_ctx.data.address.street) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.data.address.street);
            }
            if (__VLS_ctx.data.address.city || __VLS_ctx.data.address.region) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "text-ink-2" },
                });
                ([__VLS_ctx.data.address.city, __VLS_ctx.data.address.region].filter(Boolean).join(', '));
            }
            if (__VLS_ctx.data.address.country) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "vd-addr__country" },
                });
                (__VLS_ctx.data.address.country);
                (__VLS_ctx.data.address.postal_code ?? '');
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "text-ink-mute text-sm" },
            });
        }
        if (__VLS_ctx.data.funding?.investors?.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-note" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "eyebrow" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-product-chips" },
            });
            for (const [inv] of __VLS_getVForSourceType((__VLS_ctx.data.funding.investors))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (inv),
                    ...{ class: "vd-chip" },
                });
                (inv);
            }
        }
    }
    else if (__VLS_ctx.tab === 'kontak') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "vd-contact" },
        });
        if (__VLS_ctx.data.contacts.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-contact__grid" },
            });
            for (const [c, idx] of __VLS_getVForSourceType((__VLS_ctx.data.contacts))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (`${c.type}-${idx}`),
                    ...{ class: "vd-contact__card" },
                    ...{ class: ({
                            'vd-contact__card--ok': c.verified === true,
                            'vd-contact__card--fail': c.verified === false,
                        }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "vd-contact__head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "vd-contact__type" },
                });
                if (c.type === 'email') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        width: "16",
                        height: "16",
                        viewBox: "0 0 14 14",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "1.6",
                        'stroke-linecap': "round",
                        'stroke-linejoin': "round",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
                        x: "2",
                        y: "3",
                        width: "10",
                        height: "8",
                        rx: "1.2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                        d: "m2 4 5 4 5-4",
                    });
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        width: "16",
                        height: "16",
                        viewBox: "0 0 14 14",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "1.6",
                        'stroke-linecap': "round",
                        'stroke-linejoin': "round",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                        d: "M3 2v10c0 .5.5 1 1 1h6c.5 0 1-.5 1-1V2c0-.5-.5-1-1-1H4c-.5 0-1 .5-1 1zM7 11h.01",
                    });
                }
                (c.type);
                if (c.verified === true) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "trace-verdict trace-verdict--ok" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        width: "9",
                        height: "9",
                        viewBox: "0 0 12 12",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                        'stroke-linecap': "round",
                        'stroke-linejoin': "round",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                        d: "m2 6 3 3 5-7",
                    });
                    (Math.round((c.verification_score ?? 0) * 100));
                }
                else if (c.verified === false) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "trace-verdict trace-verdict--crit" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        width: "9",
                        height: "9",
                        viewBox: "0 0 12 12",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                        'stroke-linecap': "round",
                        'stroke-linejoin': "round",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                        d: "m3 3 6 6M9 3l-6 6",
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "vd-contact__value num" },
                });
                (c.value);
                if (c.verification_signals) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "vd-contact__signals" },
                    });
                    if (c.verification_signals.mx_present) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "pill pill-ok" },
                        });
                    }
                    if (c.verification_signals.disposable) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "pill pill-crit" },
                        });
                    }
                    if (c.verification_signals.role_based) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "pill pill-warn" },
                        });
                    }
                    if (c.verification_signals.domain_matches_vendor) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "pill pill-amber" },
                        });
                    }
                }
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-empty" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "vd-empty__glyph" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "28",
                height: "28",
                viewBox: "0 0 14 14",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "1.5",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
                x: "2",
                y: "3",
                width: "10",
                height: "8",
                rx: "1.2",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "m2 4 5 4 5-4",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label label-mute mt-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-xs text-ink-mute mt-1" },
            });
        }
    }
    else if (__VLS_ctx.tab === 'katalog') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "vd-katalog" },
        });
        /** @type {[typeof VendorProductCatalog, ]} */ ;
        // @ts-ignore
        const __VLS_20 = __VLS_asFunctionalComponent(VendorProductCatalog, new VendorProductCatalog({
            ...{ 'onDeepen': {} },
            vendor: (__VLS_ctx.data),
        }));
        const __VLS_21 = __VLS_20({
            ...{ 'onDeepen': {} },
            vendor: (__VLS_ctx.data),
        }, ...__VLS_functionalComponentArgsRest(__VLS_20));
        let __VLS_23;
        let __VLS_24;
        let __VLS_25;
        const __VLS_26 = {
            onDeepen: (__VLS_ctx.onDeepenProducts)
        };
        var __VLS_22;
    }
    else if (__VLS_ctx.tab === 'json') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "vd-json" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "vd-json__head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "eyebrow" },
        });
        (__VLS_ctx.data.domain);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.copyJson) },
            ...{ class: "btn btn-ghost btn-sm" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "btn-icon-nest" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "11",
            height: "11",
            viewBox: "0 0 14 14",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
            x: "3",
            y: "3",
            width: "8",
            height: "8",
            rx: "1.5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
            ...{ class: "vd-json__body num" },
        });
        (__VLS_ctx.jsonView);
    }
}
if (__VLS_ctx.data) {
    /** @type {[typeof VendorEmailDraftModal, ]} */ ;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent(VendorEmailDraftModal, new VendorEmailDraftModal({
        ...{ 'onClose': {} },
        vendor: (__VLS_ctx.data),
        open: (__VLS_ctx.emailDraftOpen),
    }));
    const __VLS_28 = __VLS_27({
        ...{ 'onClose': {} },
        vendor: (__VLS_ctx.data),
        open: (__VLS_ctx.emailDraftOpen),
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    let __VLS_30;
    let __VLS_31;
    let __VLS_32;
    const __VLS_33 = {
        onClose: (...[$event]) => {
            if (!(__VLS_ctx.data))
                return;
            __VLS_ctx.emailDraftOpen = false;
        }
    };
    var __VLS_29;
}
/** @type {__VLS_StyleScopedClasses['vd-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-back']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-ticker']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-ticker__tag']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-ticker__msg']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-ticker__stamp']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-empty__pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-empty__glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['display-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-hero__layout']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-logo__corner']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-identity__body']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-name']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-domain']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-domain']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-domain--mute']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tagline']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tagline__mark']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tagline__mark']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-focus']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-description']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chips--industries']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-margin']} */ ;
/** @type {__VLS_StyleScopedClasses['fade-up']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__num']} */ ;
/** @type {__VLS_StyleScopedClasses['is-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['is-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['is-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__unit']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__bar-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['is-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['is-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__num']} */ ;
/** @type {__VLS_StyleScopedClasses['is-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__unit']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__num']} */ ;
/** @type {__VLS_StyleScopedClasses['is-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['is-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['is-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__unit']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-stat__bar-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['is-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['is-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['is-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-funding']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-funding__num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-funding__round']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-section-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__num']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__rule']} */ ;
/** @type {__VLS_StyleScopedClasses['atlas-section-mark__title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-tab--active']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-folio']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-folio__main']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-spread']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-product-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chip--product']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-spread']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo-list']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo__id']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo__label']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-expo__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-spread']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-product-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chip--tech']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-spread']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-socials']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-social']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-social']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-social']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-social']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-social']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-gap']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-gap__eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-gap__body']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-gap__chips']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chip--gap']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-folio__margin']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-note']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-dl']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-note']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-addr']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-addr__country']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-note']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-product-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__card']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__card--ok']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__card--fail']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__head']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__type']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict--ok']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-verdict--crit']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__value']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-contact__signals']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-empty__glyph']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-katalog']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-json']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-json__head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-nest']} */ ;
/** @type {__VLS_StyleScopedClasses['vd-json__body']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            VendorProductCatalog: VendorProductCatalog,
            VendorEmailDraftModal: VendorEmailDraftModal,
            GeoAvatar: GeoAvatar,
            TagBadge: TagBadge,
            EnrichmentBadge: EnrichmentBadge,
            deepening: deepening,
            downloadingPdf: downloadingPdf,
            emailDraftOpen: emailDraftOpen,
            data: data,
            isLoading: isLoading,
            isError: isError,
            deepenVendor: deepenVendor,
            onDownloadPdf: onDownloadPdf,
            onDeepenProducts: onDeepenProducts,
            logoFailed: logoFailed,
            showOriginal: showOriginal,
            isTranslated: isTranslated,
            displayDescription: displayDescription,
            displayTagline: displayTagline,
            displayProducts: displayProducts,
            displayIndustries: displayIndustries,
            tab: tab,
            TABS: TABS,
            formatDate: formatDate,
            jsonView: jsonView,
            copyJson: copyJson,
            GAP_TOTAL: GAP_TOTAL,
            completenessPct: completenessPct,
            completenessTone: completenessTone,
            scopePct: scopePct,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
