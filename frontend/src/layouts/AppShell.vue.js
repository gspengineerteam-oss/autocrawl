/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import Sidebar from '@/components/shell/Sidebar.vue';
import Topbar from '@/components/shell/Topbar.vue';
import KpiBand from '@/components/shell/KpiBand.vue';
import Footer from '@/components/shell/Footer.vue';
import EnrichProgressDisc from '@/components/EnrichProgressDisc.vue';
const route = useRoute();
/* KPI band is intentionally suppressed on the Atlas hero (route '/') —
 * the refined-cinematic hero owns its own headline figures and any
 * extra band above would steal vertical room from the map canvas. */
const showKpi = computed(() => false && route.path === '/');
/* Routes can opt out of the shell entirely by setting `meta.bare = true`.
 * Used for fullscreen / kiosk-like views (e.g. single-channel VNC) that
 * should fill the entire viewport without sidebar / topbar / footer. */
const bare = computed(() => Boolean(route.meta?.bare));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.bare) {
    const __VLS_0 = {}.RouterView;
    /** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.RouterView, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    {
        const { default: __VLS_thisSlot } = __VLS_3.slots;
        const [{ Component }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_4 = {}.Transition;
        /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            name: "op-fade",
            mode: "out-in",
        }));
        const __VLS_6 = __VLS_5({
            name: "op-fade",
            mode: "out-in",
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_7.slots.default;
        const __VLS_8 = ((Component));
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
        const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
        var __VLS_7;
        __VLS_3.slots['' /* empty slot name completion */];
    }
    var __VLS_3;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex h-full bg-bg text-ink" },
    });
    /** @type {[typeof Sidebar, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(Sidebar, new Sidebar({}));
    const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-1 flex-col overflow-hidden" },
    });
    /** @type {[typeof Topbar, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(Topbar, new Topbar({}));
    const __VLS_16 = __VLS_15({}, ...__VLS_functionalComponentArgsRest(__VLS_15));
    if (__VLS_ctx.showKpi) {
        /** @type {[typeof KpiBand, ]} */ ;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent(KpiBand, new KpiBand({}));
        const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "relative flex-1 overflow-y-auto bg-bg" },
    });
    const __VLS_21 = {}.RouterView;
    /** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.RouterView, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({}));
    const __VLS_23 = __VLS_22({}, ...__VLS_functionalComponentArgsRest(__VLS_22));
    {
        const { default: __VLS_thisSlot } = __VLS_24.slots;
        const [{ Component }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_25 = {}.Transition;
        /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
            name: "op-fade",
            mode: "out-in",
        }));
        const __VLS_27 = __VLS_26({
            name: "op-fade",
            mode: "out-in",
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        __VLS_28.slots.default;
        const __VLS_29 = ((Component));
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({}));
        const __VLS_31 = __VLS_30({}, ...__VLS_functionalComponentArgsRest(__VLS_30));
        var __VLS_28;
        __VLS_24.slots['' /* empty slot name completion */];
    }
    var __VLS_24;
    /** @type {[typeof Footer, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(Footer, new Footer({}));
    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
    /** @type {[typeof EnrichProgressDisc, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(EnrichProgressDisc, new EnrichProgressDisc({}));
    const __VLS_37 = __VLS_36({}, ...__VLS_functionalComponentArgsRest(__VLS_36));
}
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterView: RouterView,
            Sidebar: Sidebar,
            Topbar: Topbar,
            KpiBand: KpiBand,
            Footer: Footer,
            EnrichProgressDisc: EnrichProgressDisc,
            showKpi: showKpi,
            bare: bare,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
