<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  body?: string
  countdown?: number
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'accent'
}>(), {
  title: 'Konfirmasi',
  body: '',
  countdown: 3,
  confirmLabel: 'Setuju',
  cancelLabel: 'Batal',
  tone: 'danger',
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:open', value: boolean): void
}>()

const remaining = ref(props.countdown)
let timer: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startCountdown() {
  clearTimer()
  remaining.value = props.countdown
  timer = setInterval(() => {
    if (remaining.value > 0) {
      remaining.value -= 1
    }
    if (remaining.value <= 0) {
      clearTimer()
    }
  }, 1000)
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      startCountdown()
      window.addEventListener('keydown', onKey)
    } else {
      clearTimer()
      window.removeEventListener('keydown', onKey)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearTimer()
  window.removeEventListener('keydown', onKey)
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    onCancel()
  }
}

const ready = computed(() => remaining.value <= 0)
const buttonLabel = computed(() => (ready.value ? props.confirmLabel : `Tunggu ${remaining.value}..`))

function onConfirm() {
  if (!ready.value) return
  emit('confirm')
  emit('update:open', false)
}

function onCancel() {
  emit('cancel')
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <!-- Modal scrim: theme-neutral darken, no glass blur (decorative).
         The destructive affordance comes from the crit border, accent-strong typography,
         and forced countdown wait, not from a glass-mortified background. -->
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style="background: rgb(0 0 0 / 0.40);"
      @click.self="onCancel"
    >
      <div
        class="card w-full max-w-md overflow-hidden"
        :class="tone === 'danger' ? 'is-danger' : 'card-glow'"
      >
        <header class="card-head">
          <div class="flex items-center gap-2">
            <!-- Status dot: crit for danger, amber for accent. No decorative dot-glow ring. -->
            <span class="dot" :class="tone === 'danger' ? 'dot-crit pulse-amber' : 'dot-amber pulse-amber'"></span>
            <span class="label" :class="tone === 'danger' ? 'text-crit' : 'label-amber'">{{ title }}</span>
          </div>
          <span class="num-display text-[11px] tracking-[0.18em] text-ink-mute font-bold">!!</span>
        </header>
        <div class="card-body">
          <p class="text-[13px] text-ink leading-relaxed" style="white-space: pre-line">{{ body }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button class="btn btn-ghost h-9" type="button" @click="onCancel">
              <FaIcon :icon="['fas', 'xmark']" class="text-[10px]" />
              {{ cancelLabel }}
            </button>
            <button
              :class="[
                'btn h-9',
                tone === 'danger' ? 'btn-danger' : 'btn-amber',
                !ready ? 'opacity-50 cursor-not-allowed' : '',
              ]"
              type="button"
              :disabled="!ready"
              @click="onConfirm"
            >
              <FaIcon v-if="!ready" :icon="['fas', 'circle-notch']" class="animate-spin text-[10px]" />
              <FaIcon v-else :icon="['fas', 'check']" class="text-[10px]" />
              {{ buttonLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Danger affordance: crit border at strong alpha plus the shadow scale (no neon glow).
   Reads as "this action is dangerous" through saturation of the border, the countdown
   gate, and the danger-toned button, not through a glow halo. */
.is-danger {
  border-color: rgb(var(--crit) / 0.50);
  box-shadow:
    0 0 0 1px rgb(var(--crit) / 0.30),
    var(--shadow-card-hover);
}
</style>
