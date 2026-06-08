<script setup lang="ts">
import { computed, type Component } from 'vue'
import * as lucide from 'lucide-vue-next'

type IconSize = 12 | 14 | 16 | 18 | 20 | 22 | 24 | 28 | 32

const props = withDefaults(defineProps<{
  name: string
  size?: IconSize | number
  stroke?: number
  class?: string
}>(), {
  size: 16,
  stroke: 1.25,
})

/** kebab-case → PascalCase. e.g. "arrow-up-right" → "ArrowUpRight" */
function toPascal(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

const Resolved = computed<Component | null>(() => {
  const exact = (lucide as Record<string, unknown>)[props.name]
  if (exact && typeof exact === 'object') return exact as Component
  const pascal = toPascal(props.name)
  const found = (lucide as Record<string, unknown>)[pascal]
  if (found && typeof found === 'object') return found as Component
  return null
})
</script>

<template>
  <component
    v-if="Resolved"
    :is="Resolved"
    :size="size"
    :stroke-width="stroke"
    :class="$props.class"
    aria-hidden="true"
    focusable="false"
  />
  <svg
    v-else
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    aria-hidden="true"
    focusable="false"
    :class="$props.class"
  >
    <circle cx="12" cy="12" r="9" />
  </svg>
</template>
