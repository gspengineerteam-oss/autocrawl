/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import BaseChart from './BaseChart.vue';
import { tactical } from './chart-theme';
import { useTheme } from '@/composables/useTheme';
const props = defineProps();
const { isDark } = useTheme();
const option = computed(() => {
    const pct = props.threshold > 0 ? Math.min(100, (props.current / props.threshold) * 100) : 0;
    const tickColor = isDark.value ? '#5C6878' : '#8F99A8';
    const subText = isDark.value ? '#8F99A8' : '#5C6878';
    return {
        backgroundColor: tactical.bg,
        series: [
            {
                type: 'gauge',
                startAngle: 200,
                endAngle: -20,
                radius: '92%',
                center: ['50%', '60%'],
                min: 0,
                max: 100,
                splitNumber: 5,
                axisLine: {
                    lineStyle: {
                        width: 12,
                        color: [
                            [0.4, '#EF4444'],
                            [0.7, '#F59E0B'],
                            [1, '#22C55E'],
                        ],
                    },
                },
                pointer: {
                    width: 3,
                    length: '70%',
                    itemStyle: { color: '#FFB800' },
                },
                axisTick: {
                    distance: -18,
                    length: 5,
                    lineStyle: { color: tickColor, width: 1 },
                },
                splitLine: {
                    distance: -22,
                    length: 10,
                    lineStyle: { color: tickColor, width: 1.5 },
                },
                axisLabel: {
                    color: subText,
                    distance: 4,
                    fontSize: 9,
                    fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
                },
                title: {
                    offsetCenter: [0, '38%'],
                    color: subText,
                    fontSize: 11,
                    fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
                    fontWeight: 500,
                },
                detail: {
                    show: false,
                },
                data: [
                    {
                        value: Math.round(pct),
                        name: `${props.current} / ${props.threshold}`,
                    },
                ],
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
