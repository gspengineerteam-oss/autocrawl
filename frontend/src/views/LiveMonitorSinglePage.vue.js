/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api/client';
import VncCanvas from '@/components/monitor/VncCanvas.vue';
/**
 * Single-channel fullscreen VNC view. Rendered without AppShell -
 * meant to be opened in a new browser tab from the main /pemantauan
 * page. The operator can have one tab per agent and arrange them
 * across multiple monitors.
 *
 * Chrome auto-hides after 3 seconds of mouse inactivity to maximize
 * canvas real estate. Move the mouse to bring it back.
 */
const route = useRoute();
const router = useRouter();
const VNC_HOST = import.meta.env.VITE_VNC_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
const VNC_PASSWORD = import.meta.env.VITE_VNC_PASSWORD || 'secret';
const port = computed(() => {
    const p = Number(route.params.port);
    return Number.isFinite(p) && p > 0 ? p : 7900;
});
const channelCode = computed(() => {
    if (port.value === 7900)
        return 'CH-A';
    if (port.value === 7901)
        return 'CH-B';
    return `CH-${port.value}`;
});
const channelName = computed(() => {
    if (port.value === 7900)
        return 'agentic-a · primary';
    if (port.value === 7901)
        return 'agentic-b · backup';
    return `port ${port.value}`;
});
/* Map port -> nginx-proxied path. Same-origin keeps us behind gsp:8090
 * (and tomorrow's HTTPS) without exposing 7900/7901 over the network. */
const wsPath = computed(() => {
    if (port.value === 7900)
        return '/vnc-a/websockify';
    if (port.value === 7901)
        return '/vnc-b/websockify';
    return 'websockify';
});
const vncBase = computed(() => {
    if (port.value === 7900)
        return '/vnc-a/';
    if (port.value === 7901)
        return '/vnc-b/';
    return '';
});
const canvasState = ref('idle');
function onState(s) {
    if (s === 'connecting')
        canvasState.value = 'connecting';
    else if (s === 'connected')
        canvasState.value = 'connected';
    else if (s === 'disconnect')
        canvasState.value = 'disconnected';
    else
        canvasState.value = 'error';
}
/* Live caption from /orchestrator/current — best-effort signal of
 * what the agent is actually doing right now. Shown in the chrome bar. */
const currentQ = useQuery({
    queryKey: ['orchestrator', 'current', 'single'],
    queryFn: api.orchestrator.current,
    refetchInterval: 3000,
});
const captions = computed(() => {
    const stages = currentQ.data.value?.stages ?? [];
    return stages.filter((s) => s.in_flight_label).map((s) => s.in_flight_label).slice(0, 3);
});
/* Auto-hide chrome after inactivity */
const chromeVisible = ref(true);
let hideTimer = 0;
function bumpChrome() {
    chromeVisible.value = true;
    if (hideTimer)
        window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { chromeVisible.value = false; }, 3000);
}
onMounted(() => {
    bumpChrome();
    window.addEventListener('mousemove', bumpChrome);
    window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
    if (hideTimer)
        window.clearTimeout(hideTimer);
    window.removeEventListener('mousemove', bumpChrome);
    window.removeEventListener('keydown', onKey);
});
function onKey(e) {
    /* When interactive, Esc releases control instead of closing the page —
     * priorities the in-flight session over navigation away. */
    if (e.key === 'Escape') {
        if (interactive.value) {
            releaseControl();
            return;
        }
        closeView();
        return;
    }
    if (e.key === 'f' || e.key === 'F')
        toggleFullscreen();
    if (e.key === 'c' || e.key === 'C')
        toggleInteractive();
}
/* In-place interactive toggle (preferred — keeps operator-dark UI).
 * View-only flips off; mouse/keyboard go to the agent's Chromium. */
const interactive = ref(false);
function toggleInteractive() { interactive.value = !interactive.value; }
function releaseControl() { interactive.value = false; }
function openNativeTab() {
    const params = new URLSearchParams({
        autoconnect: 'true',
        password: VNC_PASSWORD,
        resize: 'scale',
    });
    const url = vncBase.value
        ? `${vncBase.value}vnc.html?${params.toString()}`
        : `http://${VNC_HOST}:${port.value}/vnc.html?${params.toString()}`;
    window.open(url, '_blank', 'noopener');
}
function closeView() {
    /* Try window.close() first (works if opened via target=_blank);
     * if blocked, fallback to nav back to /pemantauan. */
    try {
        window.close();
    }
    catch { /* ignore */ }
    setTimeout(() => {
        if (!window.closed)
            router.push('/pemantauan');
    }, 200);
}
const fullscreen = ref(false);
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => { });
        fullscreen.value = true;
    }
    else {
        document.exitFullscreen?.();
        fullscreen.value = false;
    }
}
const stateLabel = computed(() => {
    switch (canvasState.value) {
        case 'connected': return 'LIVE';
        case 'connecting': return 'SYNC';
        case 'error': return 'FAIL';
        case 'disconnected': return 'DOWN';
        default: return 'IDLE';
    }
});
const stateTone = computed(() => {
    switch (canvasState.value) {
        case 'connected': return 'amber';
        case 'connecting': return 'amber';
        case 'error':
        case 'disconnected': return 'crit';
        default: return 'mute';
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "fixed inset-0 bg-bg flex flex-col z-[1] overflow-hidden" },
});
const __VLS_0 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    enterActiveClass: "transition-opacity duration-200",
    leaveActiveClass: "transition-opacity duration-300",
    enterFromClass: "opacity-0",
    leaveToClass: "opacity-0",
    persisted: true,
}));
const __VLS_2 = __VLS_1({
    enterActiveClass: "transition-opacity duration-200",
    leaveActiveClass: "transition-opacity duration-300",
    enterFromClass: "opacity-0",
    leaveToClass: "opacity-0",
    persisted: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-3 px-5 py-3 bg-gradient-to-b from-bg via-bg/90 to-transparent" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.chromeVisible) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex h-8 w-8 items-center justify-center bg-amber rounded-[3px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-bold text-[12px] text-bg leading-none" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col leading-[1.05]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-baseline gap-2.5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display num-amber text-[14px] tracking-[0.18em] font-bold" },
});
(__VLS_ctx.channelCode);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-[13px] text-ink font-medium" },
});
(__VLS_ctx.channelName);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[10.5px] text-ink-mute" },
});
(__VLS_ctx.VNC_HOST);
(__VLS_ctx.port);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute mt-0.5" },
});
if (__VLS_ctx.captions.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex-1 mx-6 truncate text-center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "num-display text-[11px] text-ink-mute mr-2 uppercase tracking-[0.14em]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[13px] text-ink truncate" },
    });
    (__VLS_ctx.captions.join(' · '));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2 px-3 py-1.5 rule rounded-[6px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-glow" },
    ...{ class: ([
            `dot-${__VLS_ctx.stateTone}`,
            __VLS_ctx.stateTone === 'amber' && __VLS_ctx.canvasState === 'connected' ? 'pulse-amber' : '',
        ]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[10px] font-bold tracking-[0.18em]" },
    ...{ class: ({
            'text-amber': __VLS_ctx.stateTone === 'amber',
            'text-crit': __VLS_ctx.stateTone === 'crit',
            'text-ink-mute': __VLS_ctx.stateTone === 'mute',
        }) },
});
(__VLS_ctx.stateLabel);
if (!__VLS_ctx.interactive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.toggleInteractive) },
        ...{ class: "btn btn-amber h-9" },
        title: "Ambil kontrol di sini (C)",
    });
    const __VLS_4 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        icon: (['fas', 'hand-pointer']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_6 = __VLS_5({
        icon: (['fas', 'hand-pointer']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.releaseControl) },
        ...{ class: "btn btn-danger h-9" },
        title: "Lepas kontrol (Esc)",
    });
    const __VLS_8 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_10 = __VLS_9({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openNativeTab) },
    ...{ class: "btn btn-ghost h-9" },
    title: "Buka native noVNC di tab baru",
});
const __VLS_12 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    icon: (['fas', 'browser']),
    ...{ class: "text-[10px]" },
}));
const __VLS_14 = __VLS_13({
    icon: (['fas', 'browser']),
    ...{ class: "text-[10px]" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggleFullscreen) },
    ...{ class: "btn btn-ghost h-9" },
    title: (__VLS_ctx.fullscreen ? 'Keluar fullscreen (F)' : 'Fullscreen (F)'),
});
const __VLS_16 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    icon: (['fas', __VLS_ctx.fullscreen ? 'down-left-and-up-right-to-center' : 'up-right-and-down-left-from-center']),
    ...{ class: "text-[10px]" },
}));
const __VLS_18 = __VLS_17({
    icon: (['fas', __VLS_ctx.fullscreen ? 'down-left-and-up-right-to-center' : 'up-right-and-down-left-from-center']),
    ...{ class: "text-[10px]" },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.closeView) },
    ...{ class: "btn btn-danger h-9" },
    title: "Tutup (Esc)",
});
const __VLS_20 = {}.FaIcon;
/** @type {[typeof __VLS_components.FaIcon, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    icon: (['fas', 'xmark']),
    ...{ class: "text-[10px]" },
}));
const __VLS_22 = __VLS_21({
    icon: (['fas', 'xmark']),
    ...{ class: "text-[10px]" },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex-1 relative" },
});
/** @type {[typeof VncCanvas, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(VncCanvas, new VncCanvas({
    ...{ 'onConnecting': {} },
    ...{ 'onConnected': {} },
    ...{ 'onDisconnect': {} },
    ...{ 'onError': {} },
    host: (__VLS_ctx.VNC_HOST),
    port: (__VLS_ctx.port),
    path: (__VLS_ctx.wsPath),
    password: (__VLS_ctx.VNC_PASSWORD),
    viewOnly: (!__VLS_ctx.interactive),
    scaleViewport: (true),
}));
const __VLS_25 = __VLS_24({
    ...{ 'onConnecting': {} },
    ...{ 'onConnected': {} },
    ...{ 'onDisconnect': {} },
    ...{ 'onError': {} },
    host: (__VLS_ctx.VNC_HOST),
    port: (__VLS_ctx.port),
    path: (__VLS_ctx.wsPath),
    password: (__VLS_ctx.VNC_PASSWORD),
    viewOnly: (!__VLS_ctx.interactive),
    scaleViewport: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
let __VLS_27;
let __VLS_28;
let __VLS_29;
const __VLS_30 = {
    onConnecting: (...[$event]) => {
        __VLS_ctx.onState('connecting');
    }
};
const __VLS_31 = {
    onConnected: (...[$event]) => {
        __VLS_ctx.onState('connected');
    }
};
const __VLS_32 = {
    onDisconnect: (...[$event]) => {
        __VLS_ctx.onState('disconnect');
    }
};
const __VLS_33 = {
    onError: (...[$event]) => {
        __VLS_ctx.onState('error');
    }
};
var __VLS_26;
const __VLS_34 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
    enterActiveClass: "transition duration-200",
    leaveActiveClass: "transition duration-200",
    enterFromClass: "opacity-0 -translate-y-2",
    leaveToClass: "opacity-0 -translate-y-2",
}));
const __VLS_36 = __VLS_35({
    enterActiveClass: "transition duration-200",
    leaveActiveClass: "transition duration-200",
    enterFromClass: "opacity-0 -translate-y-2",
    leaveToClass: "opacity-0 -translate-y-2",
}, ...__VLS_functionalComponentArgsRest(__VLS_35));
__VLS_37.slots.default;
if (__VLS_ctx.interactive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-[6px] bg-amber/95 backdrop-blur-sm shadow-[0_0_28px_rgba(255,184,64,0.55)] pointer-events-none" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dot blink" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[12px] font-bold tracking-[0.18em] text-bg uppercase" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[11px] tracking-[0.10em] text-bg/85 font-mono" },
    });
}
var __VLS_37;
const __VLS_38 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(__VLS_38, new __VLS_38({
    enterActiveClass: "transition-opacity duration-200",
    leaveActiveClass: "transition-opacity duration-300",
    enterFromClass: "opacity-0",
    leaveToClass: "opacity-0",
    persisted: true,
}));
const __VLS_40 = __VLS_39({
    enterActiveClass: "transition-opacity duration-200",
    leaveActiveClass: "transition-opacity duration-300",
    enterFromClass: "opacity-0",
    leaveToClass: "opacity-0",
    persisted: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
__VLS_41.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-surface/85 backdrop-blur-sm rule rounded-[6px] flex items-center gap-3" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.chromeVisible) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
(__VLS_ctx.interactive ? 'Esc lepas kontrol' : 'Esc tutup');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-ink-mute" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
var __VLS_41;
/** @type {__VLS_StyleScopedClasses['fixed']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['z-[1]']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['top-0']} */ ;
/** @type {__VLS_StyleScopedClasses['left-0']} */ ;
/** @type {__VLS_StyleScopedClasses['right-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['px-5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-b']} */ ;
/** @type {__VLS_StyleScopedClasses['from-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['via-bg/90']} */ ;
/** @type {__VLS_StyleScopedClasses['to-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['w-8']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[3px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-[1.05]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-baseline']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['num-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[14px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-6']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-2']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.14em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[13px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['h-9']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['top-4']} */ ;
/** @type {__VLS_StyleScopedClasses['left-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['-translate-x-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['z-20']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber/95']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-[0_0_28px_rgba(255,184,64,0.55)]']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['blink']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[12px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.10em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bg/85']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-3']} */ ;
/** @type {__VLS_StyleScopedClasses['left-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['-translate-x-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface/85']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['rule']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[6px]']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            VncCanvas: VncCanvas,
            VNC_HOST: VNC_HOST,
            VNC_PASSWORD: VNC_PASSWORD,
            port: port,
            channelCode: channelCode,
            channelName: channelName,
            wsPath: wsPath,
            canvasState: canvasState,
            onState: onState,
            captions: captions,
            chromeVisible: chromeVisible,
            interactive: interactive,
            toggleInteractive: toggleInteractive,
            releaseControl: releaseControl,
            openNativeTab: openNativeTab,
            closeView: closeView,
            fullscreen: fullscreen,
            toggleFullscreen: toggleFullscreen,
            stateLabel: stateLabel,
            stateTone: stateTone,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
