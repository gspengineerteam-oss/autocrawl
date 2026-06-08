import { computed, onBeforeUnmount, ref, watch } from 'vue';
const props = withDefaults(defineProps(), {
    title: 'Konfirmasi',
    body: '',
    countdown: 3,
    confirmLabel: 'Setuju',
    cancelLabel: 'Batal',
    tone: 'danger',
});
const emit = defineEmits();
const remaining = ref(props.countdown);
let timer = null;
function clearTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
function startCountdown() {
    clearTimer();
    remaining.value = props.countdown;
    timer = setInterval(() => {
        if (remaining.value > 0) {
            remaining.value -= 1;
        }
        if (remaining.value <= 0) {
            clearTimer();
        }
    }, 1000);
}
watch(() => props.open, (val) => {
    if (val) {
        startCountdown();
        window.addEventListener('keydown', onKey);
    }
    else {
        clearTimer();
        window.removeEventListener('keydown', onKey);
    }
}, { immediate: true });
onBeforeUnmount(() => {
    clearTimer();
    window.removeEventListener('keydown', onKey);
});
function onKey(e) {
    if (e.key === 'Escape') {
        onCancel();
    }
}
const ready = computed(() => remaining.value <= 0);
const buttonLabel = computed(() => (ready.value ? props.confirmLabel : `Tunggu ${remaining.value}..`));
function onConfirm() {
    if (!ready.value)
        return;
    emit('confirm');
    emit('update:open', false);
}
function onCancel() {
    emit('cancel');
    emit('update:open', false);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    title: 'Konfirmasi',
    body: '',
    countdown: 3,
    confirmLabel: 'Setuju',
    cancelLabel: 'Batal',
    tone: 'danger',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.onCancel) },
        ...{ class: "fixed inset-0 z-[100] flex items-center justify-center p-4" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card w-full max-w-md overflow-hidden" },
        ...{ class: (__VLS_ctx.tone === 'danger' ? 'is-danger' : 'card-glow') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "card-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dot" },
        ...{ class: (__VLS_ctx.tone === 'danger' ? 'dot-crit pulse-amber' : 'dot-amber pulse-amber') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label" },
        ...{ class: (__VLS_ctx.tone === 'danger' ? 'text-crit' : 'label-amber') },
    });
    (__VLS_ctx.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display text-[11px] tracking-[0.18em] text-ink-mute font-bold" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-[13px] text-ink leading-relaxed" },
        ...{ style: {} },
    });
    (__VLS_ctx.body);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mt-5 flex justify-end gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.onCancel) },
        ...{ class: "btn btn-ghost h-9" },
        type: "button",
    });
    const __VLS_4 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_6 = __VLS_5({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    (__VLS_ctx.cancelLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.onConfirm) },
        ...{ class: ([
                'btn h-9',
                __VLS_ctx.tone === 'danger' ? 'btn-danger' : 'btn-amber',
                !__VLS_ctx.ready ? 'opacity-50 cursor-not-allowed' : '',
            ]) },
        type: "button",
        disabled: (!__VLS_ctx.ready),
    });
    if (!__VLS_ctx.ready) {
        const __VLS_8 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            icon: (['fas', 'circle-notch']),
            ...{ class: "animate-spin text-[10px]" },
        }));
        const __VLS_10 = __VLS_9({
            icon: (['fas', 'circle-notch']),
            ...{ class: "animate-spin text-[10px]" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
    else {
        const __VLS_12 = {}.FaIcon;
        /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            icon: (['fas', 'check']),
            ...{ class: "text-[10px]" },
        }));
        const __VLS_14 = __VLS_13({
            icon: (['fas', 'check']),
            ...{ class: "text-[10px]" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    }
    (__VLS_ctx.buttonLabel);
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['fixed']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[100]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-spin']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ready: ready,
            buttonLabel: buttonLabel,
            onConfirm: onConfirm,
            onCancel: onCancel,
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
