<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useUptime } from '@/composables/useUptime'
import { useApiHealth } from '@/composables/useApiHealth'

withDefaults(
  defineProps<{
    label?: string
  }>(),
  { label: 'UPTIME' },
)

const { query } = useApiHealth()
const reference = ref(0)
const { formatted, tick } = useUptime(reference)

watchEffect(() => {
  const data = query.data.value
  if (data && typeof data.uptime_seconds === 'number') {
    reference.value = data.uptime_seconds
    tick.value = 0
  }
})

const tone = computed(() => {
  if (query.isError.value) return 'crit'
  if (!query.data.value) return 'muted'
  return 'ok'
})
</script>

<template>
  <div class="flex items-center gap-2 font-mono text-2xs uppercase tracking-ops">
    <span class="text-base-400 dark:text-base-500">{{ label }}</span>
    <span
      class="hud-mono-num"
      :class="{
        'text-accent-600 dark:text-accent-300': tone === 'ok',
        'text-base-400 dark:text-base-500': tone === 'muted',
        'text-crit-600 dark:text-crit-400': tone === 'crit',
      }"
    >
      {{ formatted }}
    </span>
  </div>
</template>
