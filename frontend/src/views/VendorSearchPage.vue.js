/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/client';
import EnrichmentBadge from '@/components/EnrichmentBadge.vue';
import GeoAvatar from '@/components/GeoAvatar.vue';
import { resolveCountry, flagEmoji } from '@/data/country_resolver';
const q = ref('');
const items = ref([]);
const mode = ref(null);
const degraded = ref(false);
const loading = ref(false);
const focusedId = ref(null);
const hasSearched = ref(false);
const inputRef = ref(null);
let debounceHandle = null;
let inflight = null;
function run() {
    if (!q.value || q.value.trim().length < 2) {
        items.value = [];
        mode.value = null;
        degraded.value = false;
        hasSearched.value = false;
        return;
    }
    if (inflight)
        inflight.abort();
    inflight = new AbortController();
    loading.value = true;
    api
        .vendorsSemantic(q.value.trim(), 30)
        .then((res) => {
        items.value = res.items;
        mode.value = res.mode;
        degraded.value = res.degraded;
        hasSearched.value = true;
    })
        .catch(() => {
        items.value = [];
        hasSearched.value = true;
    })
        .finally(() => {
        loading.value = false;
    });
}
watch(q, () => {
    if (debounceHandle)
        clearTimeout(debounceHandle);
    debounceHandle = setTimeout(run, 220);
});
onMounted(() => {
    nextTick(() => inputRef.value?.focus());
});
function selectHit(h) {
    focusedId.value = h.vendor_id;
}
const focused = computed(() => {
    if (!focusedId.value)
        return null;
    return items.value.find((h) => h.vendor_id === focusedId.value) ?? null;
});
function similarityBars(s) {
    // Map similarity (cosine 0..1) to bar count 1..6. Returns 0 when null
    // (lexical fallback row).
    if (s === null || Number.isNaN(s))
        return 0;
    const clipped = Math.max(0, Math.min(1, s));
    return Math.max(1, Math.ceil(clipped * 6));
}
function thicknessFor(s, idx) {
    // Vertical gold-leaf rule renders as 6 stacked segments per row.
    // Thickness varies with similarity instead of showing a number.
    if (s === null)
        return 1;
    const bars = similarityBars(s);
    return idx < bars ? 1 + (bars - idx) * 0.35 : 0.5;
}
function placeholderHints() {
    return q.value
        ? ''
        : 'Coba "biometrik perbatasan", "OT security Eropa", "drone counter UAS"';
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['search-stage__input']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__input']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__bar-input']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-list']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-list']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__split']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "search-stage" },
    'data-has-result': (__VLS_ctx.items.length > 0),
});
if (!__VLS_ctx.items.length && !__VLS_ctx.hasSearched) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-stage__hero" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-stage__aurora" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "search-stage__masthead" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-amber" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "search-stage__title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "search-stage__title-gold" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "search-stage__lede" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-stage__input-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ref: "inputRef",
        value: (__VLS_ctx.q),
        type: "text",
        ...{ class: "search-stage__input" },
        placeholder: "Ajukan pertanyaanmu di sini",
        spellcheck: "false",
        autocomplete: "off",
    });
    /** @type {typeof __VLS_ctx.inputRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-stage__hint" },
    });
    (__VLS_ctx.placeholderHints());
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-stage__split" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "search-stage__master" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "search-stage__bar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ref: "inputRef",
        value: (__VLS_ctx.q),
        type: "text",
        ...{ class: "search-stage__bar-input" },
        placeholder: "Ajukan pertanyaan lain",
        spellcheck: "false",
        autocomplete: "off",
    });
    /** @type {typeof __VLS_ctx.inputRef} */ ;
    if (__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-amber" },
        });
    }
    else if (__VLS_ctx.degraded) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "search-stage__chip" },
        });
    }
    else if (__VLS_ctx.mode === 'semantic_empty_fallback') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "search-stage__chip" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-amber" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ol, __VLS_intrinsicElements.ol)({
        ...{ class: "search-stage__results" },
    });
    for (const [hit] of __VLS_getVForSourceType((__VLS_ctx.items))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.items.length && !__VLS_ctx.hasSearched))
                        return;
                    __VLS_ctx.selectHit(hit);
                } },
            key: (hit.vendor_id),
            ...{ class: "search-stage__row" },
            'data-active': (__VLS_ctx.focusedId === hit.vendor_id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "search-stage__rule" },
            'aria-hidden': "true",
        });
        for (const [i] of __VLS_getVForSourceType((6))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
                key: (i),
                ...{ class: "search-stage__rule-seg" },
                ...{ style: ({ '--thick': __VLS_ctx.thicknessFor(hit.similarity, i - 1) }) },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "search-stage__row-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "search-stage__row-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "search-stage__row-name" },
        });
        (hit.company_name);
        if (hit.address?.country) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "search-stage__row-country" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-[12px]" },
            });
            (__VLS_ctx.flagEmoji(__VLS_ctx.resolveCountry(hit.address.country)?.cca2 ?? ''));
            (hit.address.country);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "search-stage__row-meta" },
        });
        if (hit.domain) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "num-display" },
            });
            (hit.domain);
        }
        /** @type {[typeof EnrichmentBadge, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(EnrichmentBadge, new EnrichmentBadge({
            gap: (hit.enrichment_gap),
            size: "compact",
            showLabel: (false),
        }));
        const __VLS_1 = __VLS_0({
            gap: (hit.enrichment_gap),
            size: "compact",
            showLabel: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        if (hit.similarity !== null) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "search-stage__sim" },
            });
            (Math.round((hit.similarity ?? 0) * 100));
        }
        if (hit.description) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "search-stage__row-desc" },
            });
            (hit.description.slice(0, 220));
        }
    }
    if (!__VLS_ctx.items.length && __VLS_ctx.hasSearched && !__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            ...{ class: "search-stage__empty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-ink-mute text-[13px]" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "search-stage__detail" },
    });
    if (__VLS_ctx.focused) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "search-stage__detail-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "search-stage__detail-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "search-stage__detail-avatar" },
        });
        if (__VLS_ctx.focused.logo_url) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                src: (__VLS_ctx.focused.logo_url),
                alt: (__VLS_ctx.focused.company_name),
                referrerpolicy: "no-referrer",
            });
        }
        else {
            /** @type {[typeof GeoAvatar, ]} */ ;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent(GeoAvatar, new GeoAvatar({
                seed: (__VLS_ctx.focused.vendor_id || __VLS_ctx.focused.domain || __VLS_ctx.focused.company_name),
                fallback: (__VLS_ctx.focused.company_name),
                size: (56),
            }));
            const __VLS_4 = __VLS_3({
                seed: (__VLS_ctx.focused.vendor_id || __VLS_ctx.focused.domain || __VLS_ctx.focused.company_name),
                fallback: (__VLS_ctx.focused.company_name),
                size: (56),
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            ...{ class: "search-stage__detail-name" },
        });
        (__VLS_ctx.focused.company_name);
        if (__VLS_ctx.focused.domain) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "num-display text-ink-2" },
            });
            (__VLS_ctx.focused.domain);
        }
        /** @type {[typeof EnrichmentBadge, ]} */ ;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent(EnrichmentBadge, new EnrichmentBadge({
            gap: (__VLS_ctx.focused.enrichment_gap),
        }));
        const __VLS_7 = __VLS_6({
            gap: (__VLS_ctx.focused.enrichment_gap),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        if (__VLS_ctx.focused.description) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "search-stage__detail-desc" },
            });
            (__VLS_ctx.focused.description);
        }
        if (__VLS_ctx.focused.products?.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "search-stage__detail-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label label-mute" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
                ...{ class: "search-stage__detail-list" },
            });
            for (const [p] of __VLS_getVForSourceType((__VLS_ctx.focused.products.slice(0, 10)))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                    key: (p),
                });
                (p);
            }
        }
        if (__VLS_ctx.focused.industries?.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "search-stage__detail-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label label-mute" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex flex-wrap gap-1.5" },
            });
            for (const [ind] of __VLS_getVForSourceType((__VLS_ctx.focused.industries))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    key: (ind),
                    ...{ class: "pill" },
                });
                (ind);
            }
        }
        const __VLS_9 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
        // @ts-ignore
        const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
            to: (`/vendors/${__VLS_ctx.focused.vendor_id || __VLS_ctx.focused.domain}`),
            ...{ class: "btn btn-primary" },
        }));
        const __VLS_11 = __VLS_10({
            to: (`/vendors/${__VLS_ctx.focused.vendor_id || __VLS_ctx.focused.domain}`),
            ...{ class: "btn btn-primary" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
        __VLS_12.slots.default;
        var __VLS_12;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "search-stage__detail-empty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "label label-mute" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-ink-mute text-[13px]" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['search-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__hero']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__aurora']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__masthead']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__title']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__title-gold']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__lede']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__input-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__input']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__hint']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__split']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__master']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__bar-input']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__chip']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__chip']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__results']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__rule']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__rule-seg']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row-body']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row-head']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row-name']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row-country']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__sim']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__row-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-body']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-head']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-name']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-2']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-block']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-list']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-block']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['search-stage__detail-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            EnrichmentBadge: EnrichmentBadge,
            GeoAvatar: GeoAvatar,
            resolveCountry: resolveCountry,
            flagEmoji: flagEmoji,
            q: q,
            items: items,
            mode: mode,
            degraded: degraded,
            loading: loading,
            focusedId: focusedId,
            hasSearched: hasSearched,
            inputRef: inputRef,
            selectHit: selectHit,
            focused: focused,
            thicknessFor: thicknessFor,
            placeholderHints: placeholderHints,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
