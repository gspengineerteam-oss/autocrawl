<script setup lang="ts">
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { tooltipDefaults } from './chart-theme'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  data: number[]
  labels?: string[]
  color?: string
  type?: 'bar' | 'line'
}>()

const { isDark } = useTheme()

const option = computed(() => {
  const color = props.color ?? '#FFB800'
  const isBar = (props.type ?? 'line') === 'bar'
  return {
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 2, bottom: 0 },
    tooltip: {
      ...tooltipDefaults(isDark.value),
      trigger: 'axis',
      formatter: (params: { dataIndex: number; value: number }[]) => {
        const p = params[0]
        const label = props.labels?.[p.dataIndex] ?? p.dataIndex
        return `<span style="font-family:Geist Mono Variable,monospace">${label}: <b>${p.value}</b></span>`
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
  }
})
</script>

<template>
  <BaseChart :option="option" height="h-12" />
</template>
