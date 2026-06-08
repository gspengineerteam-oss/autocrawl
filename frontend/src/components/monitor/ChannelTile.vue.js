/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import VncCanvas from './VncCanvas.vue';
const props = withDefaults(defineProps(), {
    path: 'websockify',
    vncBase: '',
    active: true,
    viewOnly: true,
    password: 'secret',
    secure: false,
});
/* Interactive control state — when true, this tile sends mouse/
 * keyboard events to the agent's Chromium. Hover overlay hidden so
 * the cursor isn't intercepted; press Esc (handled at window level
 * when interactive) to release back to view-only. */
const interactive = ref(false);
function toggleInteractive() {
    interactive.value = !interactive.value;
}
function releaseControl() {
    interactive.value = false;
}
/** Open the native noVNC interactive web UI in a new tab.
 *  Useful for multi-monitor setups where operator wants the agent
 *  on a separate window. */
function openNewTab() {
    const params = new URLSearchParams({
        autoconnect: 'true',
        password: props.password,
        resize: 'scale',
    });
    let url;
    if (props.vncBase && props.vncBase.startsWith('/')) {
        /* Same-origin proxy mode: open /vnc-a/vnc.html under current host. */
        url = `${props.vncBase}vnc.html?${params.toString()}`;
    }
    else {
        const proto = props.secure ? 'https' : 'http';
        url = `${proto}://${props.host}:${props.port}/vnc.html?${params.toString()}`;
    }
    window.open(url, '_blank', 'noopener');
}
/* Esc anywhere when this tile is interactive releases control */
function onKey(e) {
    if (interactive.value && e.key === 'Escape') {
        e.preventDefault();
        releaseControl();
    }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
const fullscreen = ref(false);
const tileRef = ref(null);
const canvasState = ref('idle');
function onState(state) {
    if (state === 'connecting')
        canvasState.value = 'connecting';
    else if (state === 'connected')
        canvasState.value = 'connected';
    else if (state === 'disconnect')
        canvasState.value = 'disconnected';
    else
        canvasState.value = 'error';
}
function toggleFullscreen() {
    if (!tileRef.value)
        return;
    if (!document.fullscreenElement) {
        tileRef.value.requestFullscreen?.().catch(() => { });
        fullscreen.value = true;
    }
    else {
        document.exitFullscreen?.();
        fullscreen.value = false;
    }
}
const stateLabel = computed(() => {
    if (!props.active)
        return 'OFF';
    switch (canvasState.value) {
        case 'connected': return 'LIVE';
        case 'connecting': return 'SYNC';
        case 'error': return 'FAIL';
        case 'disconnected': return 'DOWN';
        default: return 'IDLE';
    }
});
const stateTone = computed(() => {
    if (!props.active)
        return 'mute';
    switch (canvasState.value) {
        case 'connected': return 'amber';
        case 'connecting': return 'amber';
        case 'error':
        case 'disconnected': return 'crit';
        default: return 'mute';
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    path: 'websockify',
    vncBase: '',
    active: true,
    viewOnly: true,
    password: 'secret',
    secure: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ch-ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-ctrl-take']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-release-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ onDblclick: (__VLS_ctx.toggleFullscreen) },
    ref: "tileRef",
    ...{ class: "ch-tile card overflow-hidden flex flex-col group" },
    ...{ class: ([
            !__VLS_ctx.active ? 'opacity-50' : '',
            __VLS_ctx.interactive ? 'is-interactive' : '',
        ]) },
});
/** @type {typeof __VLS_ctx.tileRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ch-tile-head flex items-center justify-between px-3 py-2 rule-b shrink-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2 min-w-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[10.5px] tracking-[0.18em] text-amber font-bold" },
});
(__VLS_ctx.code);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute truncate" },
});
(__VLS_ctx.name);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2 shrink-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-glow" },
    ...{ class: ([
            `dot-${__VLS_ctx.stateTone}`,
            __VLS_ctx.stateTone === 'amber' && __VLS_ctx.canvasState === 'connected' ? 'pulse-amber' : '',
        ]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[9.5px] font-bold tracking-[0.18em]" },
    ...{ class: ({
            'text-amber': __VLS_ctx.stateTone === 'amber',
            'text-crit': __VLS_ctx.stateTone === 'crit',
            'text-ink-mute': __VLS_ctx.stateTone === 'mute',
        }) },
});
(__VLS_ctx.stateLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex-1 relative bg-bg min-h-[180px]" },
});
if (__VLS_ctx.active) {
    /** @type {[typeof VncCanvas, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(VncCanvas, new VncCanvas({
        ...{ 'onConnecting': {} },
        ...{ 'onConnected': {} },
        ...{ 'onDisconnect': {} },
        ...{ 'onError': {} },
        host: (__VLS_ctx.host),
        port: (__VLS_ctx.port),
        path: (__VLS_ctx.path),
        password: (__VLS_ctx.password),
        viewOnly: (__VLS_ctx.viewOnly && !__VLS_ctx.interactive),
        scaleViewport: (true),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onConnecting': {} },
        ...{ 'onConnected': {} },
        ...{ 'onDisconnect': {} },
        ...{ 'onError': {} },
        host: (__VLS_ctx.host),
        port: (__VLS_ctx.port),
        path: (__VLS_ctx.path),
        password: (__VLS_ctx.password),
        viewOnly: (__VLS_ctx.viewOnly && !__VLS_ctx.interactive),
        scaleViewport: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onConnecting: (...[$event]) => {
            if (!(__VLS_ctx.active))
                return;
            __VLS_ctx.onState('connecting');
        }
    };
    const __VLS_7 = {
        onConnected: (...[$event]) => {
            if (!(__VLS_ctx.active))
                return;
            __VLS_ctx.onState('connected');
        }
    };
    const __VLS_8 = {
        onDisconnect: (...[$event]) => {
            if (!(__VLS_ctx.active))
                return;
            __VLS_ctx.onState('disconnect');
        }
    };
    const __VLS_9 = {
        onError: (...[$event]) => {
            if (!(__VLS_ctx.active))
                return;
            __VLS_ctx.onState('error');
        }
    };
    var __VLS_2;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute inset-0 flex items-center justify-center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col items-center gap-2" },
    });
    const __VLS_10 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
        icon: (['fas', 'tower-broadcast']),
        ...{ class: "text-[24px] text-ink-mute" },
    }));
    const __VLS_12 = __VLS_11({
        icon: (['fas', 'tower-broadcast']),
        ...{ class: "text-[24px] text-ink-mute" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
}
if (__VLS_ctx.interactive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute left-2 top-2 z-10 flex items-center gap-2 px-2.5 py-1 rounded-[4px] bg-amber pointer-events-none" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dot blink" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[10.5px] font-bold tracking-[0.18em] text-bg uppercase" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[10px] tracking-[0.10em] text-bg/80 font-mono" },
    });
}
if (!__VLS_ctx.interactive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.toggleInteractive) },
        ...{ class: "ch-ctrl-btn ch-ctrl-take" },
        title: "Ambil kontrol di sini (toggle interaktif)",
    });
    const __VLS_14 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
        icon: (['fas', 'hand-pointer']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_16 = __VLS_15({
        icon: (['fas', 'hand-pointer']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[10px] font-bold tracking-[0.10em] uppercase ml-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        ...{ onClick: () => { } },
        href: (`/pemantauan/single/${__VLS_ctx.port}`),
        target: "_blank",
        rel: "noopener",
        ...{ class: "ch-ctrl-btn" },
        title: "Buka pasif di tab baru",
    });
    const __VLS_18 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
        icon: (['fas', 'arrow-up-right-from-square']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_20 = __VLS_19({
        icon: (['fas', 'arrow-up-right-from-square']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openNewTab) },
        ...{ class: "ch-ctrl-btn" },
        title: "Buka native noVNC di tab baru",
    });
    const __VLS_22 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
        icon: (['fas', 'browser']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_24 = __VLS_23({
        icon: (['fas', 'browser']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.toggleFullscreen) },
        ...{ class: "ch-ctrl-btn" },
        title: (__VLS_ctx.fullscreen ? 'Keluar fullscreen' : 'Fullscreen'),
    });
    const __VLS_26 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
        icon: (['fas', __VLS_ctx.fullscreen ? 'down-left-and-up-right-to-center' : 'up-right-and-down-left-from-center']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_28 = __VLS_27({
        icon: (['fas', __VLS_ctx.fullscreen ? 'down-left-and-up-right-to-center' : 'up-right-and-down-left-from-center']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
}
if (__VLS_ctx.interactive) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.releaseControl) },
        ...{ class: "absolute right-2 top-2 z-10 ch-release-btn" },
        title: "Lepas kontrol (Esc)",
    });
    const __VLS_30 = {}.FaIcon;
    /** @type {[typeof __VLS_components.FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }));
    const __VLS_32 = __VLS_31({
        icon: (['fas', 'xmark']),
        ...{ class: "text-[10px]" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-[10px] font-bold tracking-[0.10em] uppercase ml-1" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ch-tile-caption flex items-center gap-2 px-3 py-1.5 rule-t shrink-0 bg-bg" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dot dot-amber" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "num-display text-[11px] text-ink truncate flex-1" },
});
(__VLS_ctx.caption || '—');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "label label-mute" },
});
(__VLS_ctx.host);
(__VLS_ctx.port);
/** @type {__VLS_StyleScopedClasses['ch-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-tile-head']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-b']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-[180px]']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[24px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['left-2']} */ ;
/** @type {__VLS_StyleScopedClasses['top-2']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[4px]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['blink']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.10em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bg/80']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['right-2']} */ ;
/** @type {__VLS_StyleScopedClasses['top-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['opacity-0']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:opacity-100']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-opacity']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-ctrl-take']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.10em]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-1']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-ctrl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['right-2']} */ ;
/** @type {__VLS_StyleScopedClasses['top-2']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-release-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.10em]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-1']} */ ;
/** @type {__VLS_StyleScopedClasses['ch-tile-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-t']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-ink']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            VncCanvas: VncCanvas,
            interactive: interactive,
            toggleInteractive: toggleInteractive,
            releaseControl: releaseControl,
            openNewTab: openNewTab,
            fullscreen: fullscreen,
            tileRef: tileRef,
            canvasState: canvasState,
            onState: onState,
            toggleFullscreen: toggleFullscreen,
            stateLabel: stateLabel,
            stateTone: stateTone,
        };
    },
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
