/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
// @ts-expect-error @novnc/novnc ships JS without type declarations
import RFB from '@novnc/novnc';
const props = withDefaults(defineProps(), {
    path: 'websockify',
    secure: false,
    password: 'secret',
    viewOnly: true,
    scaleViewport: true,
    resizeSession: false,
});
const emit = defineEmits();
const target = ref(null);
const rfb = ref(null);
const state = ref('idle');
const errorMessage = ref('');
const __VLS_exposed = { state, errorMessage };
defineExpose(__VLS_exposed);
function buildUrl() {
    /* Path starting with `/` = same-origin absolute path, ignore host/port
     * props and let the browser use the current page's host:port. This is
     * how we tunnel VNC through the frontend's nginx (/vnc-a/websockify). */
    if (props.path.startsWith('/')) {
        const pageProto = typeof window !== 'undefined' ? window.location.protocol : 'http:';
        const proto = props.secure || pageProto === 'https:' ? 'wss' : 'ws';
        const host = typeof window !== 'undefined' ? window.location.host : `${props.host}:${props.port}`;
        return `${proto}://${host}${props.path}`;
    }
    const proto = props.secure ? 'wss' : 'ws';
    const path = props.path.replace(/^\/+/, '');
    return `${proto}://${props.host}:${props.port}/${path}`;
}
function connect() {
    if (!target.value)
        return;
    if (rfb.value)
        disconnect();
    state.value = 'connecting';
    emit('connecting');
    errorMessage.value = '';
    try {
        const client = new RFB(target.value, buildUrl(), {
            credentials: props.password ? { password: props.password } : undefined,
            shared: true,
            wsProtocols: ['binary'],
        });
        client.viewOnly = props.viewOnly;
        client.scaleViewport = props.scaleViewport;
        client.resizeSession = props.resizeSession;
        client.background = '#0A1525'; /* match operator dark bg */
        client.showDotCursor = !props.viewOnly;
        client.addEventListener('connect', () => {
            state.value = 'connected';
            emit('connected');
        });
        client.addEventListener('disconnect', (e) => {
            state.value = 'disconnected';
            const reason = e?.detail?.reason;
            emit('disconnect', reason);
        });
        client.addEventListener('credentialsrequired', () => {
            /* Re-send the password if server asks again */
            if (props.password)
                client.sendCredentials({ password: props.password });
        });
        client.addEventListener('securityfailure', (e) => {
            state.value = 'error';
            const msg = e?.detail?.reason ?? 'security failure';
            errorMessage.value = msg;
            emit('error', msg);
        });
        rfb.value = client;
    }
    catch (err) {
        state.value = 'error';
        const msg = err instanceof Error ? err.message : String(err);
        errorMessage.value = msg;
        emit('error', msg);
    }
}
function disconnect() {
    if (rfb.value) {
        try {
            rfb.value.disconnect();
        }
        catch { /* ignore */ }
        rfb.value = null;
    }
    state.value = 'idle';
}
onMounted(() => connect());
onBeforeUnmount(() => disconnect());
/* If host/port change reactively (e.g. operator switches channels),
 * tear down and reconnect cleanly. */
watch(() => [props.host, props.port, props.path, props.secure], () => {
    disconnect();
    connect();
});
watch(() => props.viewOnly, (v) => {
    if (rfb.value)
        rfb.value.viewOnly = v;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    path: 'websockify',
    secure: false,
    password: 'secret',
    viewOnly: true,
    scaleViewport: true,
    resizeSession: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "vnc-canvas relative w-full h-full bg-bg overflow-hidden" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ref: "target",
    ...{ class: "absolute inset-0" },
});
/** @type {typeof __VLS_ctx.target} */ ;
if (__VLS_ctx.state !== 'connected') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "absolute inset-0 flex items-center justify-center pointer-events-none bg-bg/80 backdrop-blur-sm" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col items-center gap-2.5 text-center px-4" },
    });
    if (__VLS_ctx.state === 'connecting') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dot dot-amber dot-glow pulse-amber" },
            ...{ style: {} },
        });
    }
    else if (__VLS_ctx.state === 'error') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dot dot-crit dot-glow" },
            ...{ style: {} },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dot dot-mute" },
            ...{ style: {} },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "label label-mute" },
    });
    (__VLS_ctx.state === 'connecting' ? 'Menyambungkan…' :
        __VLS_ctx.state === 'error' ? 'Gagal koneksi' :
            __VLS_ctx.state === 'disconnected' ? 'Terputus' : '—');
    if (__VLS_ctx.errorMessage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "num-display text-[10.5px] text-crit max-w-[260px] truncate" },
        });
        (__VLS_ctx.errorMessage);
    }
}
/** @type {__VLS_StyleScopedClasses['vnc-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['pointer-events-none']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-bg/80']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['pulse-amber']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-glow']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['dot-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label-mute']} */ ;
/** @type {__VLS_StyleScopedClasses['num-display']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10.5px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-crit']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-[260px]']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            target: target,
            state: state,
            errorMessage: errorMessage,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
