<script setup lang="ts">
import { computed } from 'vue'

// Six critical fields whose ABSENCE is what enrichment_gap signals.
// Backend stores these as JSONB array entries via VendorORM.enrichment_gap.
// Denominator is locked at 6 so the bar segment math is consistent across
// every vendor card / row / detail page.
const CRITICAL = ['email', 'products', 'industries', 'description', 'address', 'contacts']

const props = defineProps<{
  gap: string[] | null | undefined
  size?: 'compact' | 'normal'
  showLabel?: boolean
}>()

const completeness = computed(() => {
  const missing = new Set((props.gap ?? []).map((g) => g.toLowerCase()))
  const present = CRITICAL.filter((f) => !missing.has(f)).length
  return present / CRITICAL.length
})

const segments = computed(() => {
  // Three-segment bar — paper / ink / gold. Each segment is filled
  // independently so the visual reads as discrete progress rather than
  // a smooth value, which matches the editorial register better than
  // a gradient bar.
  const pct = completeness.value
  return [
    pct >= 0.34 ? 'on' : 'off',
    pct >= 0.67 ? 'on' : 'off',
    pct >= 0.99 ? 'on' : 'off',
  ]
})

const tone = computed(() => {
  if (completeness.value >= 0.99) return 'full'
  if (completeness.value >= 0.5) return 'partial'
  return 'thin'
})

const label = computed(() => {
  if (tone.value === 'full') return 'Lengkap'
  if (tone.value === 'partial') return 'Sebagian'
  return 'Tipis'
})
</script>

<template>
  <div class="enrichment-badge" :data-size="size ?? 'normal'" :data-tone="tone">
    <div class="enrichment-badge__bar">
      <span
        v-for="(state, idx) in segments"
        :key="idx"
        class="enrichment-badge__seg"
        :data-state="state"
      />
    </div>
    <span v-if="showLabel ?? true" class="enrichment-badge__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.enrichment-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
}

.enrichment-badge__bar {
  display: inline-flex;
  gap: 2px;
  align-items: stretch;
}

.enrichment-badge__seg {
  display: block;
  width: 14px;
  height: 6px;
  background: rgb(var(--surface-3));
  border-radius: 1px;
  transition: background var(--dur-160) var(--ease-out);
}

.enrichment-badge[data-size='compact'] .enrichment-badge__seg {
  width: 10px;
  height: 4px;
}

.enrichment-badge__seg[data-state='on'] {
  background: rgb(var(--ink));
}

.enrichment-badge[data-tone='full'] .enrichment-badge__seg[data-state='on'] {
  background: rgb(var(--accent));
}

.enrichment-badge__label {
  font-family: var(--font-sans);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-stencil);
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}

.enrichment-badge[data-tone='full'] .enrichment-badge__label {
  color: rgb(var(--accent));
}

.enrichment-badge[data-size='compact'] .enrichment-badge__label {
  font-size: 10px;
}
</style>
