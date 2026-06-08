/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import BaseChart from './BaseChart.vue';
import { tooltipDefaults } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const option = computed(() => {
    const color = props.color ?? '#FFB800';
    const isBar = (props.type ?? 'line') === 'bar';
    return {
        backgroundColor: 'transparent',
        grid: { left: 0, right: 0, top: 2, bottom: 0 },
        tooltip: {
            ...tooltipDefaults(isDark.value),
            trigger: 'axis',
            formatter: (params) => {
                const p = params[0];
                const label = props.labels?.[p.dataIndex] ?? p.dataIndex;
                return `<span style="font-family:Geist Mono Variable,monospace">${label}: <b>${p.value}</b></span>`;
            },
        },
        xAxis: {
            type: 'category',
            data: props.labels ?? props.data.map((_, i) => i),
            show: false,
        },
        yAxis: { type: 'value', show: false },
        series: [
            isBar
                ? {
                    type: 'bar',
                    data: props.data,
                    barWidth: '70%',
                    itemStyle: { color },
                }
                : {
                    type: 'line',
                    data: props.data,
                    symbol: 'none',
                    smooth: false,
                    lineStyle: { color, width: 1.5 },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: color + '40' },
                                { offset: 1, color: color + '00' },
                            ],
                        },
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
    height: "h-12",
}));
const __VLS_1 = __VLS_0({
    option: (__VLS_ctx.option),
    height: "h-12",
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
