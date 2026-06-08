<script setup lang="ts">
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { tactical, tooltipDefaults, axisDefaults } from './chart-theme'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  data: { country: string; count: number }[]
  loading?: boolean
}>()

const { isDark } = useTheme()

const option = computed(() => {
  const sorted = [...props.data].sort((a, b) => a.count - b.count)
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
  }
})
</script>

<template>
  <BaseChart :option="option" :loading="loading" height="h-80" />
</template>
