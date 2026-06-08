<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  score: number
  showLabel?: boolean
}>()

const pct = computed(() => Math.max(0, Math.min(100, Math.round(props.score * 100))))

// Tone returns a CSS var reference so the bar follows the theme.
const tone = computed(() => {
  if (pct.value >= 75) return 'rgb(var(--ok))'
  if (pct.value >= 40) return 'rgb(var(--amber))'
  return 'rgb(var(--crit))'
})

const segments = computed(() => {
  const total = 20
  const filled = Math.round((pct.value / 100) * total)
  return Array.from({ length: total }, (_, i) => i < filled)
})
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex h-3 flex-1 items-center gap-[2px]">
      <span
        v-for="(on, i) in segments"
        :key="i"
        class="h-3 flex-1 transition-colors"
        :style="{
          backgroundColor: on ? tone : 'transparent',
          border: on ? `1px solid ${tone}` : '1px solid currentColor',
          opacity: on ? 1 : 0.25,
        }"
      />
    </div>
    <span
      v-if="showLabel"
      class="hud-mono-num w-10 text-right font-mono text-2xs uppercase tracking-ops"
      :style="{ color: tone }"
    >
      {{ pct }}%
    </span>
  </div>
</template>
