<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import VncCanvas from '@/components/monitor/VncCanvas.vue'

/**
 * Single-channel fullscreen VNC view. Rendered without AppShell -
 * meant to be opened in a new browser tab from the main /pemantauan
 * page. The operator can have one tab per agent and arrange them
 * across multiple monitors.
 *
 * Chrome auto-hides after 3 seconds of mouse inactivity to maximize
 * canvas real estate. Move the mouse to bring it back.
 */

const route = useRoute()
const router = useRouter()

const VNC_HOST = (import.meta.env.VITE_VNC_HOST as string) || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')
const VNC_PASSWORD = (import.meta.env.VITE_VNC_PASSWORD as string) || 'secret'

const port = computed(() => {
  const p = Number(route.params.port)
  return Number.isFinite(p) && p > 0 ? p : 7900
})

const channelCode = computed(() => {
  if (port.value === 7900) return 'CH-A'
  if (port.value === 7901) return 'CH-B'
  return `CH-${port.value}`
})
const channelName = computed(() => {
  if (port.value === 7900) return 'agentic-a · primary'
  if (port.value === 7901) return 'agentic-b · backup'
  return `port ${port.value}`
})

/* Map port -> nginx-proxied path. Same-origin keeps us behind gsp:8090
 * (and tomorrow's HTTPS) without exposing 7900/7901 over the network. */
const wsPath = computed(() => {
  if (port.value === 7900) return '/vnc-a/websockify'
  if (port.value === 7901) return '/vnc-b/websockify'
  return 'websockify'
})
const vncBase = computed(() => {
  if (port.value === 7900) return '/vnc-a/'
  if (port.value === 7901) return '/vnc-b/'
  return ''
})

const canvasState = ref<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
function onState(s: 'connecting' | 'connected' | 'disconnect' | 'error') {
  if (s === 'connecting') canvasState.value = 'connecting'
  else if (s === 'connected') canvasState.value = 'connected'
  else if (s === 'disconnect') canvasState.value = 'disconnected'
  else canvasState.value = 'error'
}

/* Live caption from /orchestrator/current — best-effort signal of
 * what the agent is actually doing right now. Shown in the chrome bar. */
const currentQ = useQuery({
  queryKey: ['orchestrator', 'current', 'single'],
  queryFn: api.orchestrator.current,
  refetchInterval: 3000,
})
const captions = computed(() => {
  const stages = currentQ.data.value?.stages ?? []
  return stages.filter((s) => s.in_flight_label).map((s) => s.in_flight_label).slice(0, 3)
})

/* Auto-hide chrome after inactivity */
const chromeVisible = ref(true)
let hideTimer = 0
function bumpChrome() {
  chromeVisible.value = true
  if (hideTimer) window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => { chromeVisible.value = false }, 3000)
}
onMounted(() => {
  bumpChrome()
  window.addEventListener('mousemove', bumpChrome)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  if (hideTimer) window.clearTimeout(hideTimer)
  window.removeEventListener('mousemove', bumpChrome)
  window.removeEventListener('keydown', onKey)
})

function onKey(e: KeyboardEvent) {
  /* When interactive, Esc releases control instead of closing the page —
   * priorities the in-flight session over navigation away. */
  if (e.key === 'Escape') {
    if (interactive.value) { releaseControl(); return }
    closeView()
    return
  }
  if (e.key === 'f' || e.key === 'F') toggleFullscreen()
  if (e.key === 'c' || e.key === 'C') toggleInteractive()
}

/* In-place interactive toggle (preferred — keeps operator-dark UI).
 * View-only flips off; mouse/keyboard go to the agent's Chromium. */
const interactive = ref(false)
function toggleInteractive() { interactive.value = !interactive.value }
function releaseControl() { interactive.value = false }

function openNativeTab() {
  const params = new URLSearchParams({
    autoconnect: 'true',
    password: VNC_PASSWORD,
    resize: 'scale',
  })
  const url = vncBase.value
    ? `${vncBase.value}vnc.html?${params.toString()}`
    : `http://${VNC_HOST}:${port.value}/vnc.html?${params.toString()}`
  window.open(url, '_blank', 'noopener')
}

function closeView() {
  /* Try window.close() first (works if opened via target=_blank);
   * if blocked, fallback to nav back to /pemantauan. */
  try { window.close() } catch { /* ignore */ }
  setTimeout(() => {
    if (!window.closed) router.push('/pemantauan')
  }, 200)
}

const fullscreen = ref(false)
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => { /* ignore */ })
    fullscreen.value = true
  } else {
    document.exitFullscreen?.()
    fullscreen.value = false
  }
}

const stateLabel = computed(() => {
  switch (canvasState.value) {
    case 'connected': return 'LIVE'
    case 'connecting': return 'SYNC'
    case 'error': return 'FAIL'
    case 'disconnected': return 'DOWN'
    default: return 'IDLE'
  }
})
const stateTone = computed(() => {
  switch (canvasState.value) {
    case 'connected': return 'amber'
    case 'connecting': return 'amber'
    case 'error':
    case 'disconnected': return 'crit'
    default: return 'mute'
  }
})
</script>

<template>
  <div class="fixed inset-0 bg-bg flex flex-col z-[1] overflow-hidden">
    <!-- Floating chrome bar - auto-hides after inactivity -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <header
        v-show="chromeVisible"
        class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-3 px-5 py-3 bg-gradient-to-b from-bg via-bg/90 to-transparent"
      >
        <!-- Brand + channel identity -->
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center bg-amber rounded-[3px]">
            <span class="font-bold text-[12px] text-bg leading-none" style="letter-spacing:-0.04em">AC</span>
          </div>
          <div class="flex flex-col leading-[1.05]">
            <div class="flex items-baseline gap-2.5">
              <span class="num-display num-amber text-[14px] tracking-[0.18em] font-bold">{{ channelCode }}</span>
              <span class="text-[13px] text-ink font-medium">{{ channelName }}</span>
              <span class="num-display text-[10.5px] text-ink-mute">{{ VNC_HOST }}:{{ port }}</span>
            </div>
            <span class="label label-mute mt-0.5">Pemantauan single-channel · view-only</span>
          </div>
        </div>

        <!-- Live caption (current activity) -->
        <div v-if="captions.length > 0" class="flex-1 mx-6 truncate text-center">
          <span class="num-display text-[11px] text-ink-mute mr-2 uppercase tracking-[0.14em]">In-flight</span>
          <span class="text-[13px] text-ink truncate">{{ captions.join(' · ') }}</span>
        </div>

        <!-- Status + actions -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 px-3 py-1.5 rule rounded-[6px]">
            <span
              class="dot dot-glow"
              :class="[
                `dot-${stateTone}`,
                stateTone === 'amber' && canvasState === 'connected' ? 'pulse-amber' : '',
              ]"
            ></span>
            <span
              class="num-display text-[10px] font-bold tracking-[0.18em]"
              :class="{
                'text-amber': stateTone === 'amber',
                'text-crit':  stateTone === 'crit',
                'text-ink-mute': stateTone === 'mute',
              }"
            >
              {{ stateLabel }}
            </span>
          </div>
          <button
            v-if="!interactive"
            class="btn btn-amber h-9"
            title="Ambil kontrol di sini (C)"
            @click="toggleInteractive"
          >
            <FaIcon :icon="['fas', 'hand-pointer']" class="text-[10px]" />
            Ambil Kontrol
          </button>
          <button
            v-else
            class="btn btn-danger h-9"
            title="Lepas kontrol (Esc)"
            @click="releaseControl"
          >
            <FaIcon :icon="['fas', 'xmark']" class="text-[10px]" />
            Lepas Kontrol
          </button>
          <button
            class="btn btn-ghost h-9"
            title="Buka native noVNC di tab baru"
            @click="openNativeTab"
          >
            <FaIcon :icon="['fas', 'browser']" class="text-[10px]" />
          </button>
          <button
            class="btn btn-ghost h-9"
            :title="fullscreen ? 'Keluar fullscreen (F)' : 'Fullscreen (F)'"
            @click="toggleFullscreen"
          >
            <FaIcon
              :icon="['fas', fullscreen ? 'down-left-and-up-right-to-center' : 'up-right-and-down-left-from-center']"
              class="text-[10px]"
            />
          </button>
          <button
            class="btn btn-danger h-9"
            title="Tutup (Esc)"
            @click="closeView"
          >
            <FaIcon :icon="['fas', 'xmark']" class="text-[10px]" />
            Tutup
          </button>
        </div>
      </header>
    </Transition>

    <!-- VNC canvas filling everything -->
    <div class="flex-1 relative">
      <VncCanvas
        :host="VNC_HOST"
        :port="port"
        :path="wsPath"
        :password="VNC_PASSWORD"
        :view-only="!interactive"
        :scale-viewport="true"
        @connecting="onState('connecting')"
        @connected="onState('connected')"
        @disconnect="onState('disconnect')"
        @error="onState('error')"
      />

      <!-- Interactive banner — center-top, big, can't miss -->
      <Transition
        enter-active-class="transition duration-200"
        leave-active-class="transition duration-200"
        enter-from-class="opacity-0 -translate-y-2"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="interactive"
          class="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-[6px] bg-amber/95 backdrop-blur-sm shadow-[0_0_28px_rgba(255,184,64,0.55)] pointer-events-none"
        >
          <span class="dot blink" style="background: #0A1525; width: 8px; height: 8px"></span>
          <span class="text-[12px] font-bold tracking-[0.18em] text-bg uppercase">Kontrol Aktif</span>
          <span class="text-[11px] tracking-[0.10em] text-bg/85 font-mono">Esc lepas</span>
        </div>
      </Transition>
    </div>

    <!-- Bottom hint strip - shows briefly on first load + stays during chrome visible -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-show="chromeVisible"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-surface/85 backdrop-blur-sm rule rounded-[6px] flex items-center gap-3"
      >
        <span class="label label-mute">{{ interactive ? 'Esc lepas kontrol' : 'Esc tutup' }}</span>
        <span class="text-ink-mute">·</span>
        <span class="label label-mute">F fullscreen</span>
        <span class="text-ink-mute">·</span>
        <span class="label label-mute">C toggle kontrol</span>
      </div>
    </Transition>
  </div>
</template>
