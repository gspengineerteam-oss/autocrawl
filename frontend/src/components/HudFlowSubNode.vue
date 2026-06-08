<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  data: {
    label: string
    sub_label: string
    status: 'active' | 'ok' | 'crit' | 'idle'
    code: string
    payload_excerpt: string
  }
}>()

const tone = computed(() => {
  if (props.data.status === 'crit') return 'rgb(var(--crit))'
  if (props.data.status === 'active') return 'rgb(var(--amber))'
  if (props.data.status === 'ok') return 'rgb(var(--ok))'
  return 'rgb(var(--ink-mute))'
})
const toneAlpha = computed(() => {
  if (props.data.status === 'crit') return 'rgb(var(--crit) / 0.12)'
  if (props.data.status === 'active') return 'rgb(var(--amber) / 0.12)'
  if (props.data.status === 'ok') return 'rgb(var(--ok) / 0.12)'
  return 'rgb(var(--ink-mute) / 0.12)'
})

const ledClass = computed(() => {
  if (props.data.status === 'crit') return 'hud-led-crit animate-pulse-led'
  if (props.data.status === 'active') return 'hud-led-warn animate-pulse-led'
  if (props.data.status === 'ok') return 'hud-led-ok'
  return 'hud-led-muted'
})
</script>

<template>
  <div
    class="hud-flow-subnode group relative flex w-[150px] flex-col rounded-md border bg-white shadow-sm transition-all duration-200 dark:bg-base-900"
    :style="{ borderColor: tone, boxShadow: `0 0 0 1px ${toneAlpha}` }"
  >
    <Handle type="target" :position="Position.Left" class="!h-1.5 !w-1.5 !border !border-base-400 !bg-base-100 dark:!bg-base-800" />
    <Handle type="source" :position="Position.Right" class="!h-1.5 !w-1.5 !border !border-base-400 !bg-base-100 dark:!bg-base-800" />

    <div class="flex items-center gap-1 border-b border-base-200 bg-base-50 px-1.5 py-0.5 dark:border-base-700 dark:bg-base-800">
      <span :class="ledClass" />
      <span class="font-mono text-[9px] uppercase tracking-ops text-base-500 dark:text-base-400 truncate">
        {{ data.code }}
      </span>
    </div>

    <div class="flex flex-col px-1.5 py-1">
      <div
        class="font-mono text-2xs font-medium uppercase tracking-ops text-base-800 dark:text-base-100 truncate"
        :title="data.label"
      >
        {{ data.label }}
      </div>
      <div
        v-if="data.sub_label"
        class="font-mono text-[10px] text-base-500 dark:text-base-400 truncate"
        :title="data.sub_label"
      >
        {{ data.sub_label }}
      </div>
    </div>
  </div>
</template>
