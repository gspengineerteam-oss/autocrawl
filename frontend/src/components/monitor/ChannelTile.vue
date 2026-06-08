<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import VncCanvas from './VncCanvas.vue'

/**
 * One TV channel tile - hosts a VncCanvas wrapped with editorial chrome:
 * channel chip top-left, LIVE pulse top-right, hover-revealed control bar
 * at the bottom (mute/expand/reconnect), caption strip with the current
 * activity. Double-click toggles fullscreen for the tile.
 */

const props = withDefaults(defineProps<{
  code: string                /* e.g. CH-A */
  name: string                /* e.g. agentic-a · DISCOVERY */
  caption?: string            /* current vendor / expo being processed */
  host: string
  port: number
  /** WS path. Absolute (`/vnc-a/websockify`) = same-origin proxy mode.
   *  Relative (`websockify`) = direct ws://host:port/websockify. */
  path?: string
  /** Base path for the native noVNC web UI (vnc.html lives here).
   *  Same-origin proxy: `/vnc-a/`. Direct: empty (use host:port root). */
  vncBase?: string
  active?: boolean            /* if false, tile is paused (show "OFF" state) */
  password?: string
  viewOnly?: boolean
  /** WS protocol — defaults to ws (set true for wss). */
  secure?: boolean
}>(), {
  path: 'websockify',
  vncBase: '',
  active: true,
  viewOnly: true,
  password: 'secret',
  secure: false,
})

/* Interactive control state — when true, this tile sends mouse/
 * keyboard events to the agent's Chromium. Hover overlay hidden so
 * the cursor isn't intercepted; press Esc (handled at window level
 * when interactive) to release back to view-only. */
const interactive = ref(false)

function toggleInteractive() {
  interactive.value = !interactive.value
}

function releaseControl() {
  interactive.value = false
}

/** Open the native noVNC interactive web UI in a new tab.
 *  Useful for multi-monitor setups where operator wants the agent
 *  on a separate window. */
function openNewTab() {
  const params = new URLSearchParams({
    autoconnect: 'true',
    password: props.password,
    resize: 'scale',
  })
  let url: string
  if (props.vncBase && props.vncBase.startsWith('/')) {
    /* Same-origin proxy mode: open /vnc-a/vnc.html under current host. */
    url = `${props.vncBase}vnc.html?${params.toString()}`
  } else {
    const proto = props.secure ? 'https' : 'http'
    url = `${proto}://${props.host}:${props.port}/vnc.html?${params.toString()}`
  }
  window.open(url, '_blank', 'noopener')
}

/* Esc anywhere when this tile is interactive releases control */
function onKey(e: KeyboardEvent) {
  if (interactive.value && e.key === 'Escape') {
    e.preventDefault()
    releaseControl()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const fullscreen = ref(false)
const tileRef = ref<HTMLElement | null>(null)
const canvasState = ref<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')

function onState(state: 'connecting' | 'connected' | 'disconnect' | 'error') {
  if (state === 'connecting') canvasState.value = 'connecting'
  else if (state === 'connected') canvasState.value = 'connected'
  else if (state === 'disconnect') canvasState.value = 'disconnected'
  else canvasState.value = 'error'
}

function toggleFullscreen() {
  if (!tileRef.value) return
  if (!document.fullscreenElement) {
    tileRef.value.requestFullscreen?.().catch(() => { /* ignore */ })
    fullscreen.value = true
  } else {
    document.exitFullscreen?.()
    fullscreen.value = false
  }
}

const stateLabel = computed(() => {
  if (!props.active) return 'OFF'
  switch (canvasState.value) {
    case 'connected': return 'LIVE'
    case 'connecting': return 'SYNC'
    case 'error': return 'FAIL'
    case 'disconnected': return 'DOWN'
    default: return 'IDLE'
  }
})

const stateTone = computed(() => {
  if (!props.active) return 'mute'
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
  <article
    ref="tileRef"
    class="ch-tile card overflow-hidden flex flex-col group"
    :class="[
      !active ? 'opacity-50' : '',
      interactive ? 'is-interactive' : '',
    ]"
    @dblclick="toggleFullscreen"
  >
    <!-- Channel header chip -->
    <div class="ch-tile-head flex items-center justify-between px-3 py-2 rule-b shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <span class="num-display text-[10.5px] tracking-[0.18em] text-amber font-bold">{{ code }}</span>
        <span class="label label-mute truncate">{{ name }}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span
          class="dot dot-glow"
          :class="[
            `dot-${stateTone}`,
            stateTone === 'amber' && canvasState === 'connected' ? 'pulse-amber' : '',
          ]"
        ></span>
        <span
          class="num-display text-[9.5px] font-bold tracking-[0.18em]"
          :class="{
            'text-amber': stateTone === 'amber',
            'text-crit':  stateTone === 'crit',
            'text-ink-mute': stateTone === 'mute',
          }"
        >
          {{ stateLabel }}
        </span>
      </div>
    </div>

    <!-- VNC canvas area (flex-1 fills tile) -->
    <div class="flex-1 relative bg-bg min-h-[180px]">
      <VncCanvas
        v-if="active"
        :host="host"
        :port="port"
        :path="path"
        :password="password"
        :view-only="viewOnly && !interactive"
        :scale-viewport="true"
        @connecting="onState('connecting')"
        @connected="onState('connected')"
        @disconnect="onState('disconnect')"
        @error="onState('error')"
      />
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-2">
          <FaIcon :icon="['fas', 'tower-broadcast']" class="text-[24px] text-ink-mute" />
          <span class="label label-mute">Channel paused</span>
        </div>
      </div>

      <!-- Interactive mode banner: top-left, ALWAYS visible when active.
           Operator selalu tahu state-nya tanpa harus hover.
           Flat accent fill, no glass blur, no decorative glow. -->
      <div
        v-if="interactive"
        class="absolute left-2 top-2 z-10 flex items-center gap-2 px-2.5 py-1 rounded-[4px] bg-amber pointer-events-none"
      >
        <span class="dot blink" style="background: rgb(var(--bg))"></span>
        <span class="text-[10.5px] font-bold tracking-[0.18em] text-bg uppercase">Kontrol Aktif</span>
        <span class="text-[10px] tracking-[0.10em] text-bg/80 font-mono">Esc lepas</span>
      </div>

      <!-- Hover overlay control bar - HIDDEN during interactive so cursor
           events go to VNC canvas without intercept. Release button stays. -->
      <div
        v-if="!interactive"
        class="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          class="ch-ctrl-btn ch-ctrl-take"
          title="Ambil kontrol di sini (toggle interaktif)"
          @click.stop="toggleInteractive"
        >
          <FaIcon :icon="['fas', 'hand-pointer']" class="text-[10px]" />
          <span class="text-[10px] font-bold tracking-[0.10em] uppercase ml-1">Kontrol</span>
        </button>
        <a
          :href="`/pemantauan/single/${port}`"
          target="_blank"
          rel="noopener"
          class="ch-ctrl-btn"
          title="Buka pasif di tab baru"
          @click.stop
        >
          <FaIcon :icon="['fas', 'arrow-up-right-from-square']" class="text-[10px]" />
        </a>
        <button
          class="ch-ctrl-btn"
          title="Buka native noVNC di tab baru"
          @click.stop="openNewTab"
        >
          <FaIcon :icon="['fas', 'browser']" class="text-[10px]" />
        </button>
        <button
          class="ch-ctrl-btn"
          :title="fullscreen ? 'Keluar fullscreen' : 'Fullscreen'"
          @click.stop="toggleFullscreen"
        >
          <FaIcon
            :icon="['fas', fullscreen ? 'down-left-and-up-right-to-center' : 'up-right-and-down-left-from-center']"
            class="text-[10px]"
          />
        </button>
      </div>

      <!-- Release button (always visible during interactive, top-right) -->
      <button
        v-if="interactive"
        class="absolute right-2 top-2 z-10 ch-release-btn"
        title="Lepas kontrol (Esc)"
        @click.stop="releaseControl"
      >
        <FaIcon :icon="['fas', 'xmark']" class="text-[10px]" />
        <span class="text-[10px] font-bold tracking-[0.10em] uppercase ml-1">Lepas</span>
      </button>
    </div>

    <!-- Caption strip - real activity from /orchestrator -->
    <div class="ch-tile-caption flex items-center gap-2 px-3 py-1.5 rule-t shrink-0 bg-bg">
      <span class="dot dot-amber"></span>
      <span class="num-display text-[11px] text-ink truncate flex-1">
        {{ caption || '—' }}
      </span>
      <span class="label label-mute">{{ host }}:{{ port }}</span>
    </div>
  </article>
</template>

<style scoped>
/* Control button: flat surface, hairline border, no backdrop-filter blur.
   Glass blur was decorative and triggered the AI-slop tell on paper theme. */
.ch-ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 8px;
  min-width: 26px;
  border-radius: var(--radius-xs);
  background: rgb(var(--surface));
  color: rgb(var(--ink-2));
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  transition: background 160ms var(--ease-out), color 160ms var(--ease-out), border-color 160ms var(--ease-out);
  cursor: pointer;
}
.ch-ctrl-btn:hover {
  background: rgb(var(--amber));
  color: rgb(var(--bg));
  border-color: rgb(var(--amber));
}
/* Take-control button: accent-outlined at rest, fills on hover. No neon. */
.ch-ctrl-take {
  border-color: rgb(var(--amber));
  color: rgb(var(--amber));
}
.ch-ctrl-take:hover {
  background: rgb(var(--amber));
  color: rgb(var(--bg));
}

/* Release button: solid crit fill, no decorative glow.
   Affordance comes from the saturated fill plus icon plus copy, not from glow. */
.ch-release-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-xs);
  background: rgb(var(--crit));
  color: rgb(var(--bg));
  border: 1px solid rgb(var(--crit));
  cursor: pointer;
  font-weight: bold;
  transition: filter 160ms var(--ease-out);
}
.ch-release-btn:hover { filter: brightness(1.08); }

/* Interactive state: 1 pixel accent ring with alpha pulse.
   No glow expansion (decorative); just the ring alpha breathing between two values.
   Reduce-motion stops the animation via the global override in main.css. */
.ch-tile.is-interactive {
  border-color: rgb(var(--amber)) !important;
  box-shadow: 0 0 0 1px rgb(var(--amber) / 0.6);
  animation: ch-ring-pulse 1.6s var(--ease-out) infinite;
}
@keyframes ch-ring-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgb(var(--amber) / 0.5); }
  50%      { box-shadow: 0 0 0 1px rgb(var(--amber) / 0.95); }
}
</style>
