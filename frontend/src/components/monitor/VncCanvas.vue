<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
// @ts-expect-error @novnc/novnc ships JS without type declarations
import RFB from '@novnc/novnc'

/**
 * Thin Vue wrapper around the noVNC RFB client.
 *
 *   - Mounts a `<div>` target into which RFB injects its <canvas>.
 *   - Connects via WebSocket to `ws://host:port/websockify` — which is
 *     the standard endpoint exposed by `selenium/standalone-chrome`
 *     (port 7900 / 7901 in this project).
 *   - Default password = `secret` (Selenium docker default) but can
 *     be overridden via prop. Empty string = no password.
 *   - View-only by default — operator can watch without accidentally
 *     hijacking the agent's mouse/keyboard.
 *   - Emits state events (connecting / connected / disconnected /
 *     error) so the parent ChannelTile can render the status badge.
 */

const props = withDefaults(defineProps<{
  host: string
  port: number
  /** WebSocket path. Selenium VNC uses /websockify. */
  path?: string
  /** Use wss:// instead of ws:// (HTTPS deployments). */
  secure?: boolean
  password?: string
  viewOnly?: boolean
  /** Auto-scale canvas to container; otherwise renders at native size. */
  scaleViewport?: boolean
  /** When true, ask the server to resize to fit container. */
  resizeSession?: boolean
}>(), {
  path: 'websockify',
  secure: false,
  password: 'secret',
  viewOnly: true,
  scaleViewport: true,
  resizeSession: false,
})

const emit = defineEmits<{
  (e: 'connecting'): void
  (e: 'connected'): void
  (e: 'disconnect', reason?: string): void
  (e: 'error', message: string): void
}>()

const target = ref<HTMLDivElement | null>(null)
const rfb = ref<RFB | null>(null)
const state = ref<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
const errorMessage = ref<string>('')

defineExpose({ state, errorMessage })

function buildUrl(): string {
  /* Path starting with `/` = same-origin absolute path, ignore host/port
   * props and let the browser use the current page's host:port. This is
   * how we tunnel VNC through the frontend's nginx (/vnc-a/websockify). */
  if (props.path.startsWith('/')) {
    const pageProto = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    const proto = props.secure || pageProto === 'https:' ? 'wss' : 'ws'
    const host = typeof window !== 'undefined' ? window.location.host : `${props.host}:${props.port}`
    return `${proto}://${host}${props.path}`
  }
  const proto = props.secure ? 'wss' : 'ws'
  const path = props.path.replace(/^\/+/, '')
  return `${proto}://${props.host}:${props.port}/${path}`
}

function connect() {
  if (!target.value) return
  if (rfb.value) disconnect()

  state.value = 'connecting'
  emit('connecting')
  errorMessage.value = ''

  try {
    const client = new RFB(target.value, buildUrl(), {
      credentials: props.password ? { password: props.password } : undefined,
      shared: true,
      wsProtocols: ['binary'],
    })
    client.viewOnly = props.viewOnly
    client.scaleViewport = props.scaleViewport
    client.resizeSession = props.resizeSession
    client.background = '#0A1525'  /* match operator dark bg */
    client.showDotCursor = !props.viewOnly

    client.addEventListener('connect', () => {
      state.value = 'connected'
      emit('connected')
    })
    client.addEventListener('disconnect', (e: { detail?: { clean?: boolean; reason?: string } }) => {
      state.value = 'disconnected'
      const reason = e?.detail?.reason
      emit('disconnect', reason)
    })
    client.addEventListener('credentialsrequired', () => {
      /* Re-send the password if server asks again */
      if (props.password) client.sendCredentials({ password: props.password })
    })
    client.addEventListener('securityfailure', (e: { detail?: { reason?: string } }) => {
      state.value = 'error'
      const msg = e?.detail?.reason ?? 'security failure'
      errorMessage.value = msg
      emit('error', msg)
    })
    rfb.value = client
  } catch (err) {
    state.value = 'error'
    const msg = err instanceof Error ? err.message : String(err)
    errorMessage.value = msg
    emit('error', msg)
  }
}

function disconnect() {
  if (rfb.value) {
    try { rfb.value.disconnect() } catch { /* ignore */ }
    rfb.value = null
  }
  state.value = 'idle'
}

onMounted(() => connect())
onBeforeUnmount(() => disconnect())

/* If host/port change reactively (e.g. operator switches channels),
 * tear down and reconnect cleanly. */
watch(() => [props.host, props.port, props.path, props.secure], () => {
  disconnect()
  connect()
})
watch(() => props.viewOnly, (v) => {
  if (rfb.value) rfb.value.viewOnly = v
})
</script>

<template>
  <div class="vnc-canvas relative w-full h-full bg-bg overflow-hidden">
    <div ref="target" class="absolute inset-0" />

    <!-- Connection status overlay (visible when not connected) -->
    <div
      v-if="state !== 'connected'"
      class="absolute inset-0 flex items-center justify-center pointer-events-none bg-bg/80 backdrop-blur-sm"
    >
      <div class="flex flex-col items-center gap-2.5 text-center px-4">
        <span
          v-if="state === 'connecting'"
          class="dot dot-amber dot-glow pulse-amber"
          style="width:10px;height:10px"
        ></span>
        <span
          v-else-if="state === 'error'"
          class="dot dot-crit dot-glow"
          style="width:10px;height:10px"
        ></span>
        <span
          v-else
          class="dot dot-mute"
          style="width:10px;height:10px"
        ></span>
        <span class="label label-mute">
          {{
            state === 'connecting' ? 'Menyambungkan…' :
            state === 'error'      ? 'Gagal koneksi' :
            state === 'disconnected' ? 'Terputus' : '—'
          }}
        </span>
        <span v-if="errorMessage" class="num-display text-[10.5px] text-crit max-w-[260px] truncate">
          {{ errorMessage }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The canvas noVNC injects can ignore parent styling — force fit */
.vnc-canvas :deep(canvas) {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain;
}
</style>
