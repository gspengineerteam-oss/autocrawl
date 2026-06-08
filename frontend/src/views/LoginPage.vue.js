/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import GlobeBackdrop from '@/components/GlobeBackdrop.vue';
/**
 * Login — globe-anchored editorial console access.
 *
 * Struktural focal: rotating globe (Lottie sphere) di tengah kiri,
 * cinema-scale wordmark overlay sebagian, vertical stencil di tepi.
 * Auth panel di kanan minim 34%, dossier-minor treatment.
 *
 * Gold = locked accent <=10% screen, terkonsentrasi di wordmark + ring
 * pada submit button hover. Globe di-overlay tint warm via blend mode.
 */
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const username = ref('');
const password = ref('');
const error = ref(null);
const submitting = ref(false);
const shake = ref(false);
const now = ref(Date.now());
let clockTimer = null;
const dateStamp = computed(() => {
    const d = new Date(now.value);
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const yr = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return { date: `${dd}.${mo}.${yr}`, time: `${hh}:${mi}:${ss}` };
});
async function handleSubmit() {
    if (submitting.value)
        return;
    error.value = null;
    submitting.value = true;
    const result = await auth.login(username.value, password.value);
    submitting.value = false;
    if (!result.ok) {
        error.value = result.error ?? 'Kombinasi nama dan kata sandi tidak cocok.';
        shake.value = false;
        requestAnimationFrame(() => { shake.value = true; });
        setTimeout(() => { shake.value = false; }, 380);
        return;
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect);
}
onMounted(() => {
    clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
    if (auth.isAuthenticated) {
        const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
        router.replace(redirect);
    }
});
onBeforeUnmount(() => {
    if (clockTimer)
        clearInterval(clockTimer);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['login__globe']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe-tint']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe-tint']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['is-shaking']} */ ;
/** @type {__VLS_StyleScopedClasses['login__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['login__wordmark-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['login__field']} */ ;
/** @type {__VLS_StyleScopedClasses['login__input']} */ ;
/** @type {__VLS_StyleScopedClasses['login__input']} */ ;
/** @type {__VLS_StyleScopedClasses['login__input']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit']} */ ;
/** @type {__VLS_StyleScopedClasses['login__spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['login__foot-row']} */ ;
/** @type {__VLS_StyleScopedClasses['login']} */ ;
/** @type {__VLS_StyleScopedClasses['login__canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['login__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['login__wordmark-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['login__corner-pair']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "login__canvas" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__stencil" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "login__header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__stamp num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.dateStamp.date);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__stamp-sep" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.dateStamp.time);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__globe-stage" },
    'aria-hidden': "true",
});
/** @type {[typeof GlobeBackdrop, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(GlobeBackdrop, new GlobeBackdrop({
    ...{ class: "login__globe" },
    speed: (0.45),
}));
const __VLS_1 = __VLS_0({
    ...{ class: "login__globe" },
    speed: (0.45),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "login__globe-veil" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "login__globe-tint" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__wordmark-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute login__caption" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "login__wordmark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "login__tagline" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__corner-pair" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__corner-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__corner-mark login__corner-mark--mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "login__panel" },
    ...{ class: ({ 'is-shaking': __VLS_ctx.shake }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__panel-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "login__panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "login__panel-sub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
    ...{ onSubmit: (__VLS_ctx.handleSubmit) },
    ...{ class: "login__form" },
    novalidate: true,
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "login__field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    value: (__VLS_ctx.username),
    type: "text",
    name: "username",
    autocomplete: "username",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    ...{ class: "login__input login__input--mono" },
    disabled: (__VLS_ctx.submitting),
    required: true,
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "login__field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "password",
    name: "password",
    autocomplete: "current-password",
    ...{ class: "login__input login__input--mono" },
    disabled: (__VLS_ctx.submitting),
    required: true,
});
(__VLS_ctx.password);
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "login__error" },
        role: "alert",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "login__error-mark" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.error);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    type: "submit",
    ...{ class: "login__submit" },
    disabled: (__VLS_ctx.submitting || !__VLS_ctx.username || !__VLS_ctx.password),
});
if (!__VLS_ctx.submitting) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "login__submit-label" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "login__submit-label" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "login__submit-icon" },
    'aria-hidden': "true",
});
if (!__VLS_ctx.submitting) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.8",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M3 7h8M7 3l4 4-4 4",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        ...{ class: "login__spinner" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "7",
        cy: "7",
        r: "5",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "1.8",
        'stroke-dasharray': "22",
        'stroke-dashoffset': "14",
        'stroke-linecap': "round",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__panel-foot" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "login__rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__foot-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login__foot-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num" },
});
/** @type {__VLS_StyleScopedClasses['login']} */ ;
/** @type {__VLS_StyleScopedClasses['login__canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['login__stencil']} */ ;
/** @type {__VLS_StyleScopedClasses['login__header']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['login__stamp']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['login__stamp-sep']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe-veil']} */ ;
/** @type {__VLS_StyleScopedClasses['login__globe-tint']} */ ;
/** @type {__VLS_StyleScopedClasses['login__wordmark-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['login__caption']} */ ;
/** @type {__VLS_StyleScopedClasses['login__wordmark']} */ ;
/** @type {__VLS_StyleScopedClasses['login__tagline']} */ ;
/** @type {__VLS_StyleScopedClasses['login__corner-pair']} */ ;
/** @type {__VLS_StyleScopedClasses['login__corner-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['login__corner-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['login__corner-mark--mute']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['is-shaking']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['login__form']} */ ;
/** @type {__VLS_StyleScopedClasses['login__field']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['login__input']} */ ;
/** @type {__VLS_StyleScopedClasses['login__input--mono']} */ ;
/** @type {__VLS_StyleScopedClasses['login__field']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['login__input']} */ ;
/** @type {__VLS_StyleScopedClasses['login__input--mono']} */ ;
/** @type {__VLS_StyleScopedClasses['login__error']} */ ;
/** @type {__VLS_StyleScopedClasses['login__error-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit-label']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit-label']} */ ;
/** @type {__VLS_StyleScopedClasses['login__submit-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['login__spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['login__panel-foot']} */ ;
/** @type {__VLS_StyleScopedClasses['login__rule']} */ ;
/** @type {__VLS_StyleScopedClasses['login__foot-row']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['login__foot-row']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            GlobeBackdrop: GlobeBackdrop,
            username: username,
            password: password,
            error: error,
            submitting: submitting,
            shake: shake,
            dateStamp: dateStamp,
            handleSubmit: handleSubmit,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
