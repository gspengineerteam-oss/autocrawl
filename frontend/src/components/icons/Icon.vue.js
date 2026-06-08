/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import * as lucide from 'lucide-vue-next';
const props = withDefaults(defineProps(), {
    size: 16,
    stroke: 1.25,
});
/** kebab-case → PascalCase. e.g. "arrow-up-right" → "ArrowUpRight" */
function toPascal(name) {
    return name
        .split(/[-_]/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
}
const Resolved = computed(() => {
    const exact = lucide[props.name];
    if (exact && typeof exact === 'object')
        return exact;
    const pascal = toPascal(props.name);
    const found = lucide[pascal];
    if (found && typeof found === 'object')
        return found;
    return null;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    size: 16,
    stroke: 1.25,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (__VLS_ctx.Resolved) {
    const __VLS_0 = ((__VLS_ctx.Resolved));
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        size: (__VLS_ctx.size),
        strokeWidth: (__VLS_ctx.stroke),
        ...{ class: (__VLS_ctx.$props.class) },
        'aria-hidden': "true",
        focusable: "false",
    }));
    const __VLS_2 = __VLS_1({
        size: (__VLS_ctx.size),
        strokeWidth: (__VLS_ctx.stroke),
        ...{ class: (__VLS_ctx.$props.class) },
        'aria-hidden': "true",
        focusable: "false",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_4 = {};
    var __VLS_3;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: (__VLS_ctx.size),
        height: (__VLS_ctx.size),
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': (__VLS_ctx.stroke),
        'aria-hidden': "true",
        focusable: "false",
        ...{ class: (__VLS_ctx.$props.class) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "12",
        cy: "12",
        r: "9",
    });
}
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Resolved: Resolved,
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
