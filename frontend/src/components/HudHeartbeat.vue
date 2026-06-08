<script setup lang="ts">
import { computed } from 'vue'
import HudStatusPill from './HudStatusPill.vue'
import { useApiHealth } from '@/composables/useApiHealth'

const { status, dbStatus } = useApiHealth()

const apiTone = computed<'ok' | 'warn' | 'crit'>(() => {
  if (status.value === 'down') return 'crit'
  if (status.value === 'degraded' || status.value === 'unknown') return 'warn'
  return 'ok'
})

const dbTone = computed<'ok' | 'warn' | 'crit'>(() => {
  if (dbStatus.value === 'down') return 'crit'
  if (dbStatus.value === 'unknown') return 'warn'
  return 'ok'
})

const apiLabel = computed(() => {
  switch (apiTone.value) {
    case 'crit':
      return 'API OFFLINE'
    case 'warn':
      return 'API CHECK'
    default:
      return 'API ONLINE'
  }
})

const dbLabel = computed(() => {
  switch (dbTone.value) {
    case 'crit':
      return 'DB OFFLINE'
    case 'warn':
      return 'DB CHECK'
    default:
      return 'DB ONLINE'
  }
})
</script>

<template>
  <div class="flex items-center gap-2">
    <HudStatusPill :tone="apiTone" :label="apiLabel" :pulse="apiTone === 'ok'" />
    <HudStatusPill :tone="dbTone" :label="dbLabel" :pulse="dbTone === 'ok'" />
  </div>
</template>
