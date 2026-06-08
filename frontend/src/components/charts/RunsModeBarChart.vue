<script setup lang="ts">
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { tactical, tooltipDefaults, axisDefaults } from './chart-theme'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  data: { mode: string; count: number }[]
  loading?: boolean
}>()

const { isDark } = useTheme()

const colorMap: Record<string, string> = {
  dev: '#06B6D4',
  normal: '#FFB800',
  aggressive: '#EF4444',
}

const option = computed(() => ({
  backgroundColor: tactical.bg,
  grid: { left: 8, right: 16, top: 16, bottom: 24, containLabel: true },
  tooltip: {
    ...tooltipDefaults(isDark.value),
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  xAxis: {
    type: 'category',
    data: props.data.map((d) => d.mode.toUpperCase()),
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
      type: 'bar',
      barWidth: '50%',
      data: props.data.map((d) => ({
        value: d.count,
        itemStyle: { color: colorMap[d.mode] ?? '#8F99A8' },
      })),
      label: {
        show: true,
        position: 'top',
        color: isDark.value ? tactical.text.primary.dark : tactical.text.primary.light,
        fontSize: 10,
        fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
      },
    },
  ],
}))
</script>

<template>
  <BaseChart :option="option" :loading="loading" height="h-56" />
</template>
