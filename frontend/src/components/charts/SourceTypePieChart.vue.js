/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import BaseChart from './BaseChart.vue';
import { tactical, tooltipDefaults } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const colorMap = {
    pdf: '#EF4444',
    aggregator: '#06B6D4',
    search: '#FFB800',
    manual: '#8F99A8',
};
const labelMap = {
    pdf: 'PDF',
    aggregator: 'Agregator',
    search: 'Pencarian',
    manual: 'Manual',
};
const option = computed(() => ({
    backgroundColor: tactical.bg,
    tooltip: {
        ...tooltipDefaults(isDark.value),
        trigger: 'item',
        formatter: (p) => `<span style="font-family:Geist Mono Variable,monospace">${p.name.toUpperCase()}: <b>${p.value}</b> (${p.percent}%)</span>`,
    },
    legend: {
        orient: 'vertical',
        right: 8,
        top: 'middle',
        icon: 'rect',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 10,
        textStyle: {
            color: isDark.value ? tactical.text.secondary.dark : tactical.text.secondary.light,
            fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
            fontSize: 10,
        },
        formatter: (name) => (labelMap[name] ?? name).toUpperCase(),
    },
    series: [
        {
            name: 'Sumber',
            type: 'pie',
            radius: ['58%', '82%'],
            center: ['38%', '50%'],
            itemStyle: {
                borderColor: isDark.value ? '#0A1525' : '#F4EFE6',
                borderWidth: 2,
            },
            label: {
                show: true,
                position: 'inside',
                color: isDark.value ? '#0A1525' : '#141210',
                fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
                fontSize: 10,
                fontWeight: 600,
                formatter: '{d}%',
            },
            labelLine: { show: false },
            data: props.data.map((d) => ({
                name: d.type,
                value: d.count,
                itemStyle: { color: colorMap[d.type] ?? '#71717a' },
            })),
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
    height: "h-64",
}));
const __VLS_1 = __VLS_0({
    option: (__VLS_ctx.option),
    loading: (__VLS_ctx.loading),
    height: "h-64",
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
