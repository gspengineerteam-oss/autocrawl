/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, EffectScatterChart, GaugeChart, LineChart, PieChart, ScatterChart, } from 'echarts/charts';
import { DataZoomComponent, DatasetComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent, } from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { computed, provide } from 'vue';
import { useTheme } from '@/composables/useTheme';
use([
    CanvasRenderer,
    BarChart,
    PieChart,
    LineChart,
    GaugeChart,
    ScatterChart,
    EffectScatterChart,
    GridComponent,
    TooltipComponent,
    TitleComponent,
    LegendComponent,
    DatasetComponent,
    DataZoomComponent,
    GraphicComponent,
    MarkLineComponent,
]);
const { isDark } = useTheme();
const themeKey = computed(() => (isDark.value ? 'dark' : 'light'));
provide(THEME_KEY, themeKey);
const __VLS_props = defineProps();
// Theme-aware loading-overlay options (paper vs ink-dark).
const loadingOptions = computed(() => isDark.value
    ? {
        text: 'MEMUAT',
        color: '#FFB840',
        textColor: '#F0E8D5',
        maskColor: 'rgba(10, 21, 37, 0.7)',
        fontFamily: 'Geist Mono Variable, Geist Mono, monospace',
        fontSize: 11,
        fontWeight: 500,
    }
    : {
        text: 'MEMUAT',
        color: '#10302E',
        textColor: '#141210',
        maskColor: 'rgba(244, 239, 230, 0.7)',
        fontFamily: 'Geist Mono Variable, Geist Mono, monospace',
        fontSize: 11,
        fontWeight: 500,
    });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: (['relative w-full', __VLS_ctx.height ?? 'h-72']) },
});
const __VLS_0 = {}.VChart;
/** @type {[typeof __VLS_components.VChart, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    key: (__VLS_ctx.themeKey),
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    autoresize: true,
    loadingOptions: (__VLS_ctx.loadingOptions),
}));
const __VLS_2 = __VLS_1({
    key: (__VLS_ctx.themeKey),
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    autoresize: true,
    loadingOptions: (__VLS_ctx.loadingOptions),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            VChart: VChart,
            themeKey: themeKey,
            loadingOptions: loadingOptions,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
