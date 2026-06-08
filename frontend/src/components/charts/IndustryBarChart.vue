<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseChart from './BaseChart.vue'
import { tactical, tooltipDefaults, axisDefaults } from './chart-theme'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  data: { tag: string; count: number }[]
  topN?: number
}>()

const { isDark } = useTheme()
const showAll = ref(false)

const sorted = computed(() => [...props.data].sort((a, b) => b.count - a.count))

const chartData = computed(() => {
  if (showAll.value) return sorted.value
  const limit = props.topN ?? 12
  if (sorted.value.length <= limit) return sorted.value
  const top = sorted.value.slice(0, limit)
  const rest = sorted.value.slice(limit)
  const restCount = rest.reduce((sum, item) => sum + item.count, 0)
  return [...top, { tag: 'Lainnya', count: restCount }]
})

const option = computed(() => {
  const items = [...chartData.value].reverse()
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
        formatter: (value: string) => (value.length > 22 ? value.slice(0, 21) + '…' : value),
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
  }
})

const chartHeight = computed(() => {
  const rows = chartData.value.length
  if (showAll.value) return 'h-[420px]'
  if (rows >= 12) return 'h-[380px]'
  if (rows >= 8) return 'h-[320px]'
  return 'h-[260px]'
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-end gap-2">
      <button
        class="hud-btn-ghost h-6 px-2 text-2xs"
        :class="!showAll ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-300' : ''"
        @click="showAll = false"
      >
        Top 12
      </button>
      <button
        class="hud-btn-ghost h-6 px-2 text-2xs"
        :class="showAll ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-300' : ''"
        @click="showAll = true"
      >
        Semua
      </button>
    </div>
    <BaseChart :option="option" :height="chartHeight" />
  </div>
</template>
