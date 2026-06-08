<script setup lang="ts">
import { computed } from 'vue'

type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'accent' | 'muted'

const props = withDefaults(
  defineProps<{
    tone?: Tone
    label: string
    pulse?: boolean
  }>(),
  { tone: 'muted', pulse: false },
)

const pillClass = computed(() => {
  switch (props.tone) {
    case 'ok':
      return 'hud-pill-ok'
    case 'warn':
      return 'hud-pill-warn'
    case 'crit':
      return 'hud-pill-crit'
    case 'info':
      return 'hud-pill-info'
    case 'accent':
      return 'hud-pill-accent'
    default:
      return 'hud-pill-muted'
  }
})

const ledClass = computed(() => {
  switch (props.tone) {
    case 'ok':
      return 'hud-led-ok'
    case 'warn':
      return 'hud-led-warn'
    case 'crit':
      return 'hud-led-crit'
    case 'info':
      return 'hud-led-ok'
    case 'accent':
      return 'hud-led-accent'
    default:
      return 'hud-led-muted'
  }
})
</script>

<template>
  <span :class="pillClass">
    <span :class="[ledClass, pulse ? 'animate-pulse-led' : '']" />
    <span>{{ label }}</span>
  </span>
</template>
