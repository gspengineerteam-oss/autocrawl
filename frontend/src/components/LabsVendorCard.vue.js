/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import VendorCard from '@/components/VendorCard.vue';
const props = defineProps();
const emit = defineEmits();
const cardItem = computed(() => ({
    vendor_id: props.vendor.vendor_id,
    company_name: props.vendor.company_name,
    domain: props.vendor.domain,
    logo_url: props.vendor.logo_url,
    industries: props.vendor.industries,
    has_verified_email: props.vendor.has_verified_email,
    confidence_score: props.vendor.confidence_score,
    enrichment_gap: props.vendor.has_verified_email ? [] : ['email'],
}));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['labs-vc']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-vc__card']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-vc__deepen']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-vc__deepen']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('toggle', __VLS_ctx.vendor.vendor_id);
        } },
    ...{ class: ([
            'labs-vc',
            __VLS_ctx.selected ? 'labs-vc--selected' : '',
        ]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: ([
            'labs-vc__check',
            __VLS_ctx.selected ? 'labs-vc__check--on' : '',
        ]) },
    'aria-hidden': "true",
});
if (__VLS_ctx.selected) {
    const __VLS_0 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        icon: (['fas', 'check']),
        ...{ class: "text-[8px] text-bg" },
    }));
    const __VLS_2 = __VLS_1({
        icon: (['fas', 'check']),
        ...{ class: "text-[8px] text-bg" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
/** @type {[typeof VendorCard, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(VendorCard, new VendorCard({
    vendor: (__VLS_ctx.cardItem),
    size: "tile",
    selected: (__VLS_ctx.selected),
    showEnrichment: (false),
    industryLimit: (3),
    ...{ class: "labs-vc__card" },
}));
const __VLS_5 = __VLS_4({
    vendor: (__VLS_ctx.cardItem),
    size: "tile",
    selected: (__VLS_ctx.selected),
    showEnrichment: (false),
    industryLimit: (3),
    ...{ class: "labs-vc__card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "labs-vc__foot" },
});
if (__VLS_ctx.vendor.has_verified_email) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "pill pill-ok text-[9.5px]" },
    });
    const __VLS_7 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
        icon: (['fas', 'check']),
        ...{ class: "text-[8px]" },
    }));
    const __VLS_9 = __VLS_8({
        icon: (['fas', 'check']),
        ...{ class: "text-[8px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "pill text-[9.5px]" },
        ...{ style: {} },
    });
}
if (!__VLS_ctx.vendor.has_verified_email) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.vendor.has_verified_email))
                    return;
                __VLS_ctx.emit('deepen', __VLS_ctx.vendor.vendor_id);
            } },
        type: "button",
        disabled: (__VLS_ctx.busyDeepen),
        ...{ class: "labs-vc__deepen" },
    });
    (__VLS_ctx.busyDeepen ? 'Memuat' : 'Perdalam');
}
/** @type {__VLS_StyleScopedClasses['labs-vc']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-vc__check']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[8px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-vc__card']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-vc__foot']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill-ok']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[8px]']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['labs-vc__deepen']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            VendorCard: VendorCard,
            emit: emit,
            cardItem: cardItem,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
