import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import GeoAvatar from '@/components/GeoAvatar.vue';
import TagBadge from '@/components/TagBadge.vue';
import EnrichmentBadge from '@/components/EnrichmentBadge.vue';
import { resolveCountry, flagEmoji } from '@/data/country_resolver';
const props = withDefaults(defineProps(), {
    size: 'row',
    selected: false,
    showEnrichment: true,
    industryLimit: 3,
});
const emit = defineEmits();
const avatarSize = computed(() => {
    if (props.size === 'compact')
        return 28;
    if (props.size === 'tile')
        return 44;
    return 36;
});
const industriesShown = computed(() => (props.vendor.industries ?? []).slice(0, props.industryLimit));
const industriesExtra = computed(() => {
    const total = props.vendor.industries?.length ?? 0;
    return Math.max(0, total - industriesShown.value.length);
});
const countryFlag = computed(() => {
    if (!props.vendor.country)
        return '';
    const rec = resolveCountry(props.vendor.country);
    return rec ? flagEmoji(rec.cca2) : '';
});
const seed = computed(() => props.vendor.vendor_id || props.vendor.domain || props.vendor.company_name);
function handleClick(event) {
    if (props.to)
        return;
    event.preventDefault();
    emit('click', props.vendor);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    size: 'row',
    selected: false,
    showEnrichment: true,
    industryLimit: 3,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['vc']} */ ;
/** @type {__VLS_StyleScopedClasses['vc--tile']} */ ;
/** @type {__VLS_StyleScopedClasses['vc--compact']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__name']} */ ;
/** @type {__VLS_StyleScopedClasses['vc--row']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__name']} */ ;
/** @type {__VLS_StyleScopedClasses['vc--tile']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__name']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__sim-tick']} */ ;
/** @type {__VLS_StyleScopedClasses['vc--tile']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__enrich']} */ ;
/** @type {__VLS_StyleScopedClasses['vc--compact']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__industries']} */ ;
/** @type {__VLS_StyleScopedClasses['vc--compact']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__meta']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = ((__VLS_ctx.to ? __VLS_ctx.RouterLink : 'button'));
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    to: (__VLS_ctx.to),
    type: (__VLS_ctx.to ? undefined : 'button'),
    ...{ class: (['vc', `vc--${__VLS_ctx.size}`, __VLS_ctx.selected ? 'vc--selected' : '']) },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    to: (__VLS_ctx.to),
    type: (__VLS_ctx.to ? undefined : 'button'),
    ...{ class: (['vc', `vc--${__VLS_ctx.size}`, __VLS_ctx.selected ? 'vc--selected' : '']) },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.handleClick)
};
var __VLS_8 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "vc__avatar" },
    ...{ style: ({ width: `${__VLS_ctx.avatarSize}px`, height: `${__VLS_ctx.avatarSize}px` }) },
});
if (__VLS_ctx.vendor.logo_url) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        ...{ onError: (...[$event]) => {
                if (!(__VLS_ctx.vendor.logo_url))
                    return;
                $event.target.style.display = 'none';
            } },
        src: (__VLS_ctx.vendor.logo_url),
        alt: (__VLS_ctx.vendor.company_name),
        ...{ class: "vc__logo" },
        referrerpolicy: "no-referrer",
    });
}
else {
    /** @type {[typeof GeoAvatar, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(GeoAvatar, new GeoAvatar({
        seed: (__VLS_ctx.seed),
        fallback: (__VLS_ctx.vendor.company_name),
        size: (__VLS_ctx.avatarSize),
    }));
    const __VLS_10 = __VLS_9({
        seed: (__VLS_ctx.seed),
        fallback: (__VLS_ctx.vendor.company_name),
        size: (__VLS_ctx.avatarSize),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "vc__body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "vc__head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "vc__name" },
});
(__VLS_ctx.vendor.company_name);
if (typeof __VLS_ctx.vendor.similarity === 'number') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vc__sim" },
        title: (`Similaritas ${(__VLS_ctx.vendor.similarity * 100).toFixed(0)} persen`),
    });
    for (const [i] of __VLS_getVForSourceType((5))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
            ...{ class: "vc__sim-tick" },
            key: (i),
            'data-on': (__VLS_ctx.vendor.similarity >= i / 5 ? 'true' : 'false'),
        });
    }
}
if (__VLS_ctx.vendor.domain || __VLS_ctx.countryFlag) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vc__meta" },
    });
    if (__VLS_ctx.vendor.domain) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vc__domain num-display" },
        });
        (__VLS_ctx.vendor.domain);
    }
    if (__VLS_ctx.vendor.domain && __VLS_ctx.countryFlag) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vc__dot" },
            'aria-hidden': "true",
        });
    }
    if (__VLS_ctx.countryFlag) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vc__country" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vc__flag" },
        });
        (__VLS_ctx.countryFlag);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vc__country-name" },
        });
        (__VLS_ctx.vendor.country);
    }
}
if (__VLS_ctx.industriesShown.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vc__industries" },
    });
    for (const [ind] of __VLS_getVForSourceType((__VLS_ctx.industriesShown))) {
        /** @type {[typeof TagBadge, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(TagBadge, new TagBadge({
            key: (ind),
            raw: (ind),
            size: "xs",
        }));
        const __VLS_13 = __VLS_12({
            key: (ind),
            raw: (ind),
            size: "xs",
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    }
    if (__VLS_ctx.industriesExtra > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "vc__more" },
        });
        (__VLS_ctx.industriesExtra);
    }
}
if (__VLS_ctx.showEnrichment && __VLS_ctx.vendor.enrichment_gap) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "vc__enrich" },
    });
    /** @type {[typeof EnrichmentBadge, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(EnrichmentBadge, new EnrichmentBadge({
        gap: (__VLS_ctx.vendor.enrichment_gap),
        size: (__VLS_ctx.size === 'compact' ? 'compact' : 'normal'),
        showLabel: (__VLS_ctx.size !== 'compact'),
    }));
    const __VLS_16 = __VLS_15({
        gap: (__VLS_ctx.vendor.enrichment_gap),
        size: (__VLS_ctx.size === 'compact' ? 'compact' : 'normal'),
        showLabel: (__VLS_ctx.size !== 'compact'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['vc']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__logo']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__body']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__head']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__name']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__sim']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__sim-tick']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__domain']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__country']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__flag']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__country-name']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__industries']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__more']} */ ;
/** @type {__VLS_StyleScopedClasses['vc__enrich']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            GeoAvatar: GeoAvatar,
            TagBadge: TagBadge,
            EnrichmentBadge: EnrichmentBadge,
            avatarSize: avatarSize,
            industriesShown: industriesShown,
            industriesExtra: industriesExtra,
            countryFlag: countryFlag,
            seed: seed,
            handleClick: handleClick,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
