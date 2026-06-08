/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import BaseChart from './BaseChart.vue';
import { tactical, tooltipDefaults, axisDefaults } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const colorMap = {
    dev: '#06B6D4',
    normal: '#FFB800',
    aggressive: '#EF4444',
};
const option = computed(() => ({
    backgroundColor: tactical.bg,
    grid: { left: 8, right: 16, top: 16, bottom: 24, containLabel: true },
    tooltip: {
        ...tooltipDefaults(isDark.value),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
    },
    xAxis: {
        type: 'category',
        data: props.data.map((d) => d.mode.toUpperCase()),
        ...axisDefaults(isDark.value),
        splitLine: { show: false },
    },
    yAxis: {
        type: 'value',
        ...axisDefaults(isDark.value),
        splitNumber: 4,
    },
    series: [
        {
            type: 'bar',
            barWidth: '50%',
            data: props.data.map((d) => ({
                value: d.count,
                itemStyle: { color: colorMap[d.mode] ?? '#8F99A8' },
            })),
            label: {
                show: true,
                position: 'top',
                color: isDark.value ? tactical.text.primary.dark : tactical.text.primary.light,
                fontSize: 10,
                fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
            },
        },
    ],
}));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof BaseChart, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(BaseChart, new BaseChart({
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    height: "h-56",
}));
const __VLS_1 = __VLS_0({
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    height: "h-56",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
var __VLS_2;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            BaseChart: BaseChart,
            option: option,
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
