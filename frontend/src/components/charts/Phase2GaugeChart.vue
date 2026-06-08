<script setup lang="ts">
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { tactical } from './chart-theme'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  current: number
  threshold: number
  loading?: boolean
}>()

const { isDark } = useTheme()

const option = computed(() => {
  const pct = props.threshold > 0 ? Math.min(100, (props.current / props.threshold) * 100) : 0
  const tickColor = isDark.value ? '#5C6878' : '#8F99A8'
  const subText = isDark.value ? '#8F99A8' : '#5C6878'
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
  }
})
</script>

<template>
  <BaseChart :option="option" :loading="loading" height="h-64" />
</template>
