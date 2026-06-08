<script setup lang="ts">
import { computed } from 'vue'
import { resolveCountry } from '@/data/country_resolver'

/**
 * CountryDisc — a 14×14 grayscale stipple disc representing a country.
 *
 * Replaces emoji flags throughout the app for visual cohesion with the
 * AtlasMap. The "stipple" is a deterministic dot field seeded by the
 * ISO2 so it is stable across renders. ISO2 letters are overlaid in
 * Newsreader small caps on top.
 *
 * It is intentionally non-photographic — flags as engraving plates.
 */

const props = defineProps<{
  country?: string | null
  iso2?: string | null
  size?: number
}>()

const size = computed(() => props.size ?? 16)

const code = computed(() => {
  if (props.iso2) return props.iso2.toUpperCase()
  if (!props.country) return '··'
  const rec = resolveCountry(props.country)
  return rec?.cca2 ?? props.country.slice(0, 2).toUpperCase()
})

function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const dots = computed(() => {
  const seed = code.value.charCodeAt(0) * 256 + (code.value.charCodeAt(1) || 65)
  const r = rng(seed)
  const points: { cx: number; cy: number; rad: number; opacity: number }[] = []
  const grid = 1.6
  const radius = size.value / 2 - 0.5
  const cx0 = size.value / 2
  const cy0 = size.value / 2
  for (let y = 0; y < size.value; y += grid) {
    for (let x = 0; x < size.value; x += grid) {
      const dx = x - cx0
      const dy = y - cy0
      if (dx * dx + dy * dy > radius * radius) continue
      if (r() > 0.55) continue
      points.push({
        cx: x + (r() - 0.5) * 0.6,
        cy: y + (r() - 0.5) * 0.6,
        rad: 0.35 + r() * 0.3,
        opacity: 0.5 + r() * 0.4,
      })
    }
  }
  return points
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 align-middle">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      aria-hidden="true"
      class="inline-block"
    >
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="size / 2 - 0.5"
        fill="rgb(var(--paper))"
        stroke="rgb(var(--ink) / 0.32)"
        stroke-width="0.6"
      />
      <circle
        v-for="(d, i) in dots"
        :key="i"
        :cx="d.cx"
        :cy="d.cy"
        :r="d.rad"
        :fill="`rgb(var(--ink) / ${d.opacity.toFixed(2)})`"
      />
    </svg>
    <slot>
      <span class="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-2">{{ code }}</span>
    </slot>
  </span>
</template>
