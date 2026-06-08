<script setup lang="ts">
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { tactical, tooltipDefaults } from './chart-theme'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  data: { type: string; count: number }[]
  loading?: boolean
}>()

const { isDark } = useTheme()

const colorMap: Record<string, string> = {
  pdf: '#EF4444',
  aggregator: '#06B6D4',
  search: '#FFB800',
  manual: '#8F99A8',
}

const labelMap: Record<string, string> = {
  pdf: 'PDF',
  aggregator: 'Agregator',
  search: 'Pencarian',
  manual: 'Manual',
}

const option = computed(() => ({
  backgroundColor: tactical.bg,
  tooltip: {
    ...tooltipDefaults(isDark.value),
    trigger: 'item',
    formatter: (p: { name: string; value: number; percent: number }) =>
      `<span style="font-family:Geist Mono Variable,monospace">${p.name.toUpperCase()}: <b>${p.value}</b> (${p.percent}%)</span>`,
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
    formatter: (name: string) => (labelMap[name] ?? name).toUpperCase(),
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
}))
</script>

<template>
  <BaseChart :option="option" :loading="loading" height="h-64" />
</template>
