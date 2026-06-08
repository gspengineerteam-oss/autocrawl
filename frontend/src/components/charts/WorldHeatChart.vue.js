/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import BaseChart from './BaseChart.vue';
import { tactical, tooltipDefaults } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const option = computed(() => {
    const sorted = [...props.data].sort((a, b) => b.count - a.count).slice(0, 30);
    const grid = [];
    const cols = 6;
    sorted.forEach((d, i) => {
        grid.push({ name: d.country, count: d.count, col: i % cols, row: Math.floor(i / cols) });
    });
    const max = Math.max(1, ...sorted.map((d) => d.count));
    return {
        backgroundColor: tactical.bg,
        tooltip: {
            ...tooltipDefaults(isDark.value),
            trigger: 'item',
            formatter: (p) => `<span style="font-family:Geist Mono Variable,monospace"><b>${p.data.name.toUpperCase()}</b><br/>${p.data.value[2]} vendor</span>`,
        },
        grid: { left: 16, right: 16, top: 8, bottom: 8, containLabel: false },
        xAxis: { type: 'value', show: false, min: -0.5, max: cols - 0.5 },
        yAxis: {
            type: 'value',
            show: false,
            min: -0.5,
            max: Math.max(0, Math.ceil(grid.length / cols)) - 0.5,
            inverse: true,
        },
        series: [
            {
                type: 'scatter',
                symbol: 'circle',
                symbolSize: (val) => 16 + (val[2] / max) * 32,
                data: grid.map((g) => ({
                    name: g.name,
                    value: [g.col, g.row, g.count],
                    itemStyle: {
                        color: tactical.accent,
                        opacity: 0.2 + (g.count / max) * 0.7,
                        borderColor: tactical.accent,
                        borderWidth: 1,
                    },
                    label: {
                        show: true,
                        formatter: (p) => `${p.data.value[2]}`,
                        color: isDark.value ? '#0E1218' : '#0E1218',
                        fontWeight: 600,
                        fontSize: 10,
                        fontFamily: '"Geist Variable", "Geist", monospace',
                    },
                })),
            },
            {
                type: 'scatter',
                symbol: 'rect',
                symbolSize: 0,
                data: grid.map((g) => ({
                    name: g.name,
                    value: [g.col, g.row + 0.45, g.count],
                    label: {
                        show: true,
                        formatter: g.name.length > 14 ? g.name.slice(0, 13).toUpperCase() + '..' : g.name.toUpperCase(),
                        color: isDark.value ? tactical.text.muted.dark : tactical.text.muted.light,
                        fontSize: 9,
                        fontFamily: '"Geist Variable", "Geist", monospace',
                    },
                })),
                silent: true,
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
    height: "h-72",
}));
const __VLS_1 = __VLS_0({
    option: (__VLS_ctx.option),
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
