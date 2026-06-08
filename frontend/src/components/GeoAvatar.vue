<script setup lang="ts">
import { computed } from 'vue'

/**
 * GeoAvatar — deterministic visual marker using DiceBear Shapes HTTP API.
 *
 * One reusable identity tile for vendor, expo, PDF, etc. Same seed always
 * renders the same shape, so the operator builds visual memory across
 * pages without ever seeing initials-on-tinted-square again.
 *
 * Background uses our gold gradient palette; foreground is the deterministic
 * geometric shape. Falls back to gradient mark + first letter on network
 * error.
 */

const props = defineProps<{
  seed: string
  size?: number
  fallback?: string
}>()

const size = computed(() => props.size ?? 56)
const seedSafe = computed(() => encodeURIComponent(props.seed || 'autocrawl'))

// DiceBear Shapes — geometric abstract shapes that read as logos.
// Background gradient uses our gold palette (hex without #).
const url = computed(() =>
  `https://api.dicebear.com/9.x/shapes/svg?seed=${seedSafe.value}` +
  `&backgroundType=gradientLinear` +
  `&backgroundColor=b8893a,9a6f26,d4a250` +
  `&shape1Color=ffffff,faf6ee,ebe4d7` +
  `&shape2Color=09090b,3f3f46,c81212` +
  `&shape3Color=f25f4c,38bdf8,9a6f26` +
  `&radius=22`,
)

const fallbackMark = computed(() => {
  const s = props.fallback ?? props.seed
  return (s ?? '?').toString().trim().charAt(0).toUpperCase() || '?'
})
</script>

<template>
  <span
    class="geo-avatar"
    :style="{ width: size + 'px', height: size + 'px' }"
  >
    <img
      :src="url"
      :alt="`shape-${seed}`"
      loading="lazy"
      referrerpolicy="no-referrer"
      class="geo-avatar__img"
    />
    <span class="geo-avatar__fallback" aria-hidden="true">{{ fallbackMark }}</span>
  </span>
</template>

<style scoped>
.geo-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, rgb(var(--accent-hot)) 0%, rgb(var(--accent)) 60%, rgb(var(--accent-glow, var(--accent))) 100%);
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  flex-shrink: 0;
}
.geo-avatar__img {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.geo-avatar__fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-weight: 700;
  font-size: 50%;
  letter-spacing: -0.04em;
  color: white;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
}
</style>
