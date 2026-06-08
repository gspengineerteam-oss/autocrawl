<script setup lang="ts">
import { computed } from 'vue'

// Industry categorical palette: 8 hand-picked editorial hues that read on
// both paper cream and warm navy. Mid-chroma, no SaaS purple/pink, no
// full-saturation. Static (not theme-aware) so an industry keeps its
// identity across themes.
const palette = [
  '#B5321A', // vermilion — aerospace/defense
  '#9E7C2E', // gold leaf — energy
  '#10302E', // deep teal — maritime
  '#6B7A2F', // sage olive — land
  '#94411E', // brick — munitions
  '#3D4D6A', // slate blue — cyber/IT
  '#5C3B5C', // plum ink — other
  '#3A342D', // ink soft — unspecified
]

const props = defineProps<{
  label: string
}>()

const color = computed(() => {
  let hash = 0
  for (const ch of props.label) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0
  }
  return palette[Math.abs(hash) % palette.length]
})
</script>

<template>
  <span
    class="hud-pill"
    :style="{
      borderColor: color + '55',
      backgroundColor: color + '15',
      color,
    }"
  >
    <span
      class="h-1.5 w-1.5 shrink-0 rounded-full"
      :style="{ backgroundColor: color }"
    />
    <span class="truncate">{{ label }}</span>
  </span>
</template>
