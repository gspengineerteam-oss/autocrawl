<script setup lang="ts">
import { computed } from 'vue'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const props = withDefaults(
  defineProps<{
    code: string
    label: string
    value: string | number
    unit?: string
    delta?: number
    deltaLabel?: string
    sparkline?: number[]
    sparkType?: 'bar' | 'line'
    icon?: string
    tone?: 'default' | 'accent' | 'ok' | 'warn' | 'crit' | 'info'
  }>(),
  { tone: 'default', sparkType: 'line' },
)

const toneColor = computed(() => {
  switch (props.tone) {
    case 'accent':
      return 'rgb(var(--amber))'
    case 'ok':
      return 'rgb(var(--ok))'
    case 'warn':
      return 'rgb(var(--warn))'
    case 'crit':
      return 'rgb(var(--crit))'
    case 'info':
      return 'rgb(var(--cyan))'
    default:
      return 'rgb(var(--amber))'
  }
})

const deltaTone = computed(() => {
  if (props.delta === undefined || props.delta === null) return 'muted'
  if (props.delta > 0) return 'ok'
  if (props.delta < 0) return 'crit'
  return 'muted'
})

const deltaText = computed(() => {
  if (props.delta === undefined || props.delta === null) return ''
  const sign = props.delta > 0 ? '+' : ''
  return `${sign}${props.delta}${props.deltaLabel ? ' ' + props.deltaLabel : ''}`
})
</script>

<template>
  <div class="hud-panel relative flex flex-col">
    <div class="flex items-center justify-between border-b border-base-200 bg-base-50 px-3 py-1.5 dark:border-base-700 dark:bg-base-800">
      <div class="flex items-center gap-2">
        <span class="font-mono text-2xs font-medium uppercase tracking-ops text-base-400 dark:text-base-500">
          {{ code }}
        </span>
        <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
          {{ label }}
        </span>
      </div>
      <FaIcon
        v-if="icon"
        :icon="['fas', icon]"
        class="text-2xs text-base-400 dark:text-base-500"
      />
    </div>

    <div class="flex flex-col gap-1 p-3">
      <div class="flex items-baseline gap-1.5">
        <span
          class="hud-mono-num text-3xl font-semibold leading-none tracking-tight"
          :style="{ color: toneColor }"
        >
          {{ value }}
        </span>
        <span v-if="unit" class="font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500">
          {{ unit }}
        </span>
      </div>

      <div class="flex h-3 items-center gap-1.5">
        <span
          v-if="deltaText"
          class="font-mono text-2xs uppercase tracking-ops"
          :class="{
            'text-ok-600 dark:text-ok-400': deltaTone === 'ok',
            'text-crit-600 dark:text-crit-400': deltaTone === 'crit',
            'text-base-400 dark:text-base-500': deltaTone === 'muted',
          }"
        >
          {{ deltaText }}
        </span>
      </div>
    </div>

    <div v-if="sparkline && sparkline.length > 0" class="px-2 pb-2">
      <SparklineChart :data="sparkline" :color="toneColor" :type="sparkType" />
    </div>
  </div>
</template>
