/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import BaseChart from './BaseChart.vue';
import { tactical, tooltipDefaults, axisDefaults } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const option = computed(() => {
    const sorted = [...props.data].sort((a, b) => a.count - b.count);
    return {
        backgroundColor: tactical.bg,
        grid: { left: 8, right: 32, top: 8, bottom: 16, containLabel: true },
        tooltip: {
            ...tooltipDefaults(isDark.value),
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
        },
        xAxis: {
            type: 'value',
            ...axisDefaults(isDark.value),
            splitNumber: 4,
        },
        yAxis: {
            type: 'category',
            data: sorted.map((d) => d.country.toUpperCase()),
            ...axisDefaults(isDark.value),
            splitLine: { show: false },
        },
        series: [
            {
                type: 'bar',
                data: sorted.map((d) => d.count),
                barWidth: 14,
                itemStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 1,
                        y2: 0,
                        colorStops: [
                            { offset: 0, color: '#06B6D4' },
                            { offset: 1, color: '#FFB800' },
                        ],
                    },
                },
                label: {
                    show: true,
                    position: 'right',
                    color: isDark.value ? tactical.text.primary.dark : tactical.text.primary.light,
                    fontSize: 10,
                    fontFamily: '"Geist Variable", "Geist", monospace',
                },
            },
        ],
    };
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof BaseChart, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(BaseChart, new BaseChart({
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    height: "h-80",
}));
const __VLS_1 = __VLS_0({
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    height: "h-80",
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
