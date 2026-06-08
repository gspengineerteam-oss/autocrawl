<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import lottie from 'lottie-web'
import type { AnimationItem } from 'lottie-web'

/**
 * GlobeBackdrop — renders /globe.json (Lottie sphere animation) sebagai
 * decorative focal di LoginPage. SVG renderer untuk crispness di any
 * resolution. Looping continuous; konsumen bisa override speed via prop.
 *
 * The Lottie source punya original colors; we tint via CSS filter di
 * caller (mix-blend / hue-rotate / opacity) supaya tidak mengubah JSON.
 */

const props = withDefaults(
  defineProps<{
    src?: string
    speed?: number
    loop?: boolean
  }>(),
  { src: '/globe.json', speed: 0.55, loop: true },
)

const root = ref<HTMLDivElement | null>(null)
let anim: AnimationItem | null = null

onMounted(() => {
  if (!root.value) return
  anim = lottie.loadAnimation({
    container: root.value,
    renderer: 'svg',
    loop: props.loop,
    autoplay: true,
    path: props.src,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet',
      progressiveLoad: true,
    },
  })
  anim.setSpeed(props.speed)
})

onBeforeUnmount(() => {
  if (anim) {
    anim.destroy()
    anim = null
  }
})
</script>

<template>
  <div ref="root" class="globe-backdrop" aria-hidden="true" />
</template>

<style scoped>
.globe-backdrop {
  width: 100%;
  height: 100%;
  display: block;
}
.globe-backdrop :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
</style>
