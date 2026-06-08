<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  BarChart,
  EffectScatterChart,
  GaugeChart,
  LineChart,
  PieChart,
  ScatterChart,
} from 'echarts/charts'
import {
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import VChart, { THEME_KEY } from 'vue-echarts'
import { computed, provide } from 'vue'
import { useTheme } from '@/composables/useTheme'

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  LineChart,
  GaugeChart,
  ScatterChart,
  EffectScatterChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DatasetComponent,
  DataZoomComponent,
  GraphicComponent,
  MarkLineComponent,
])

const { isDark } = useTheme()
const themeKey = computed(() => (isDark.value ? 'dark' : 'light'))
provide(THEME_KEY, themeKey)

defineProps<{
  option: Record<string, unknown>
  loading?: boolean
  height?: string
}>()

// Theme-aware loading-overlay options (paper vs ink-dark).
const loadingOptions = computed(() =>
  isDark.value
    ? {
        text: 'MEMUAT',
        color: '#FFB840',
        textColor: '#F0E8D5',
        maskColor: 'rgba(10, 21, 37, 0.7)',
        fontFamily: 'Geist Mono Variable, Geist Mono, monospace',
        fontSize: 11,
        fontWeight: 500,
      }
    : {
        text: 'MEMUAT',
        color: '#10302E',
        textColor: '#141210',
        maskColor: 'rgba(244, 239, 230, 0.7)',
        fontFamily: 'Geist Mono Variable, Geist Mono, monospace',
        fontSize: 11,
        fontWeight: 500,
      },
)
</script>

<template>
  <div :class="['relative w-full', height ?? 'h-72']">
    <!-- Keying on themeKey forces re-instantiation when paper/ink-dark toggles,
         so chart-theme literals (axis, tooltip, series palette) follow the theme. -->
    <VChart
      :key="themeKey"
      :option="option"
      :loading="loading"
      autoresize
      :loading-options="loadingOptions"
    />
  </div>
</template>
