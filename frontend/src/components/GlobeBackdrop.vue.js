/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onBeforeUnmount, onMounted, ref } from 'vue';
import lottie from 'lottie-web';
const props = withDefaults(defineProps(), { src: '/globe.json', speed: 0.55, loop: true });
const root = ref(null);
let anim = null;
onMounted(() => {
    if (!root.value)
        return;
    anim = lottie.loadAnimation({
        container: root.value,
        renderer: 'svg',
        loop: props.loop,
        autoplay: true,
        path: props.src,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
        },
    });
    anim.setSpeed(props.speed);
});
onBeforeUnmount(() => {
    if (anim) {
        anim.destroy();
        anim = null;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ src: '/globe.json', speed: 0.55, loop: true });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['globe-backdrop']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ref: "root",
    ...{ class: "globe-backdrop" },
    'aria-hidden': "true",
});
/** @type {typeof __VLS_ctx.root} */ ;
/** @type {__VLS_StyleScopedClasses['globe-backdrop']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            root: root,
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
