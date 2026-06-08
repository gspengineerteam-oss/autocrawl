/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import BaseChart from './BaseChart.vue';
import { tactical, tooltipDefaults, axisDefaults } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const showAll = ref(false);
const sorted = computed(() => [...props.data].sort((a, b) => b.count - a.count));
const chartData = computed(() => {
    if (showAll.value)
        return sorted.value;
    const limit = props.topN ?? 12;
    if (sorted.value.length <= limit)
        return sorted.value;
    const top = sorted.value.slice(0, limit);
    const rest = sorted.value.slice(limit);
    const restCount = rest.reduce((sum, item) => sum + item.count, 0);
    return [...top, { tag: 'Lainnya', count: restCount }];
});
const option = computed(() => {
    const items = [...chartData.value].reverse();
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
            data: items.map((d) => d.tag),
            ...axisDefaults(isDark.value),
            splitLine: { show: false },
            axisLabel: {
                ...axisDefaults(isDark.value).axisLabel,
                fontSize: 10,
                formatter: (value) => (value.length > 22 ? value.slice(0, 21) + '…' : value),
            },
        },
        series: [
            {
                type: 'bar',
                data: items.map((d, i) => ({
                    value: d.count,
                    itemStyle: {
                        color: d.tag === 'Lainnya' ? '#5C6878' : tactical.series[i % tactical.series.length],
                    },
                })),
                barWidth: 14,
                label: {
                    show: true,
                    position: 'right',
                    color: isDark.value ? tactical.text.primary.dark : tactical.text.primary.light,
                    fontSize: 10,
                    fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
                    formatter: '{c}',
                },
            },
        ],
        dataZoom: showAll.value
            ? [
                {
                    type: 'inside',
                    yAxisIndex: 0,
                    startValue: items.length - 12,
                    endValue: items.length - 1,
                    zoomOnMouseWheel: true,
                },
            ]
            : [],
    };
});
const chartHeight = computed(() => {
    const rows = chartData.value.length;
    if (showAll.value)
        return 'h-[420px]';
    if (rows >= 12)
        return 'h-[380px]';
    if (rows >= 8)
        return 'h-[320px]';
    return 'h-[260px]';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-end gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.showAll = false;
        } },
    ...{ class: "hud-btn-ghost h-6 px-2 text-2xs" },
    ...{ class: (!__VLS_ctx.showAll ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-300' : '') },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.showAll = true;
        } },
    ...{ class: "hud-btn-ghost h-6 px-2 text-2xs" },
    ...{ class: (__VLS_ctx.showAll ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-300' : '') },
});
/** @type {[typeof BaseChart, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(BaseChart, new BaseChart({
    option: (__VLS_ctx.option),
    height: (__VLS_ctx.chartHeight),
}));
const __VLS_1 = __VLS_0({
    option: (__VLS_ctx.option),
    height: (__VLS_ctx.chartHeight),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
/** @type {__VLS_StyleScopedClasses['hud-btn-ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xs']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            BaseChart: BaseChart,
            showAll: showAll,
            option: option,
            chartHeight: chartHeight,
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
