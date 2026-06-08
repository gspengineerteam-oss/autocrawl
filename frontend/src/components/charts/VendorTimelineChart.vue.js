/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import BaseChart from './BaseChart.vue';
import { tactical, tooltipDefaults, axisDefaults } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const option = computed(() => {
    let cumulative = 0;
    const cum = props.data.map((d) => {
        cumulative += d.vendors_added;
        return cumulative;
    });
    const labels = props.data.map((d) => {
        if (d.date.length >= 10)
            return d.date.slice(5);
        return d.date;
    });
    return {
        backgroundColor: tactical.bg,
        grid: { left: 8, right: 32, top: 32, bottom: 24, containLabel: true },
        tooltip: {
            ...tooltipDefaults(isDark.value),
            trigger: 'axis',
            axisPointer: { type: 'line', lineStyle: { color: tactical.accent, type: 'dashed' } },
        },
        legend: {
            top: 0,
            right: 0,
            icon: 'rect',
            itemWidth: 10,
            itemHeight: 8,
            itemGap: 12,
            textStyle: {
                color: isDark.value ? tactical.text.secondary.dark : tactical.text.secondary.light,
                fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
                fontSize: 10,
            },
        },
        xAxis: {
            type: 'category',
            data: labels,
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
                name: 'PER HARI',
                type: 'bar',
                data: props.data.map((d) => d.vendors_added),
                itemStyle: { color: tactical.accent },
                barWidth: '40%',
            },
            {
                name: 'KUMULATIF',
                type: 'line',
                smooth: false,
                symbol: 'circle',
                symbolSize: 4,
                data: cum,
                lineStyle: { width: 2, color: tactical.info },
                itemStyle: { color: tactical.info, borderColor: isDark.value ? '#0A1525' : '#F4EFE6', borderWidth: 1 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(6, 182, 212, 0.25)' },
                            { offset: 1, color: 'rgba(6, 182, 212, 0)' },
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
    loading: (__VLS_ctx.loading),
    height: "h-72",
}));
const __VLS_1 = __VLS_0({
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    height: "h-72",
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
