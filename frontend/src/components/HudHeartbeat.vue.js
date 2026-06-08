/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import HudStatusPill from './HudStatusPill.vue';
import { useApiHealth } from '@/composables/useApiHealth';
const { status, dbStatus } = useApiHealth();
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
const apiLabel = computed(() => {
    switch (apiTone.value) {
        case 'crit':
            return 'API OFFLINE';
        case 'warn':
            return 'API CHECK';
        default:
            return 'API ONLINE';
    }
});
const dbLabel = computed(() => {
    switch (dbTone.value) {
        case 'crit':
            return 'DB OFFLINE';
        case 'warn':
            return 'DB CHECK';
        default:
            return 'DB ONLINE';
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2" },
});
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.apiTone),
    label: (__VLS_ctx.apiLabel),
    pulse: (__VLS_ctx.apiTone === 'ok'),
}));
const __VLS_1 = __VLS_0({
    tone: (__VLS_ctx.apiTone),
    label: (__VLS_ctx.apiLabel),
    pulse: (__VLS_ctx.apiTone === 'ok'),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {[typeof HudStatusPill, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(HudStatusPill, new HudStatusPill({
    tone: (__VLS_ctx.dbTone),
    label: (__VLS_ctx.dbLabel),
    pulse: (__VLS_ctx.dbTone === 'ok'),
}));
const __VLS_4 = __VLS_3({
    tone: (__VLS_ctx.dbTone),
    label: (__VLS_ctx.dbLabel),
    pulse: (__VLS_ctx.dbTone === 'ok'),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            HudStatusPill: HudStatusPill,
            apiTone: apiTone,
            dbTone: dbTone,
            apiLabel: apiLabel,
            dbLabel: dbLabel,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
