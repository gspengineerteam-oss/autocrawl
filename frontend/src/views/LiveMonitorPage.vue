<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import ChannelTile from '@/components/monitor/ChannelTile.vue'
import NowCrawling from '@/components/atlas/NowCrawling.vue'
import SystemOverview from '@/components/atlas/SystemOverview.vue'
import AgentTracePanel from '@/components/monitor/AgentTracePanel.vue'

/**
 * Pemantauan — Theater Morph archetype.
 *
 * Layout intent: ALL channels render simultaneously inside ONE positioned
 * theater container. One is the hero (large, left), the rest are thumbs
 * (column, right). Clicking Switch swaps roles; CSS transitions positions
 * over 700ms with Apple cubic-bezier, so the channels visually MORPH
 * between hero and thumbnail without unmount/remount. ChannelTile keeps
 * its websocket alive across the transition (no reconnect flicker).
 *
 * Caption block lives INSIDE the hero frame (bottom-left, gradient veil)
 * so the focus and label are anchored together as a single composition.
 *
 * Real data: /orchestrator/current + /orchestrator/throughput.
 */

const VNC_HOST = (import.meta.env.VITE_VNC_HOST as string) || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')
const VNC_PASSWORD = (import.meta.env.VITE_VNC_PASSWORD as string) || 'secret'

interface Channel {
  code: string
  name: string
  port: number
  wsPath: string
  vncBase: string
  active: boolean
}

const channels = ref<Channel[]>([
  { code: 'CH-A', name: 'agentic-a · primary', port: 7900, wsPath: '/vnc-a/websockify', vncBase: '/vnc-a/', active: true },
  { code: 'CH-B', name: 'agentic-b · backup',  port: 7901, wsPath: '/vnc-b/websockify', vncBase: '/vnc-b/', active: true },
])

const heroIndex = ref(0)
const heroChannel = computed(() => channels.value[heroIndex.value])

const switching = ref(false)
function switchHero() {
  if (channels.value.length < 2) return
  switching.value = true
  // Rotate hero to the next channel; CSS transitions handle the morph.
  heroIndex.value = (heroIndex.value + 1) % channels.value.length
  setTimeout(() => { switching.value = false }, 750)
}
function selectHero(idx: number) {
  if (idx === heroIndex.value) return
  switching.value = true
  heroIndex.value = idx
  setTimeout(() => { switching.value = false }, 750)
}

/* Position calc: hero takes the big slot; thumbs stack on the right rail. */
const tilePosition = (idx: number) => {
  if (idx === heroIndex.value) {
    return { role: 'hero', thumbOrder: -1 }
  }
  // Compute thumb order: channels before hero keep their idx, channels after
  // hero shift down by one. So thumbs are always a sequential 0..n-1 list.
  let order = 0
  for (let i = 0; i < channels.value.length; i++) {
    if (i === heroIndex.value) continue
    if (i === idx) break
    order += 1
  }
  return { role: 'thumb', thumbOrder: order }
}

const currentQ = useQuery({
  queryKey: ['orchestrator', 'current', 'monitor'],
  queryFn: api.orchestrator.current,
  refetchInterval: 3000,
})
const throughputQ = useQuery({
  queryKey: ['orchestrator', 'throughput', 'monitor'],
  queryFn: () => api.orchestrator.throughput(60),
  refetchInterval: 3000,
})

const captions = computed(() => {
  const stages = currentQ.data.value?.stages ?? []
  const live = stages.filter((s) => s.in_flight_label)
  return channels.value.map((_ch, i) => {
    const stage = live[i % Math.max(1, live.length)]
    return stage?.in_flight_label ?? 'menunggu telemetri'
  })
})

const activeChannels = computed(() => channels.value.filter((c) => c.active))
const eventsPerMin = computed(() => Math.round((throughputQ.data.value?.events_per_minute ?? 0) * 10) / 10)
const workers = computed(() => throughputQ.data.value?.active_workers_total ?? 0)
const heroCaption = computed(() => captions.value[heroIndex.value] || 'menunggu telemetri')

function toggleChannel(idx: number) {
  channels.value[idx].active = !channels.value[idx].active
}

function buildControlUrl(ch: Channel): string {
  const params = new URLSearchParams({
    autoconnect: 'true',
    password: VNC_PASSWORD,
    resize: 'scale',
  })
  return `${ch.vncBase}vnc.html?${params.toString()}`
}
function takeControl() {
  window.open(buildControlUrl(heroChannel.value), '_blank', 'noopener')
}

const formatNum = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('id-ID').format(n)
}
</script>

<template>
  <div class="mon-canvas">
    <!-- ============================================================== -->
    <!-- HERO STAGE — Theater Morph                                       -->
    <!-- ============================================================== -->
    <section class="mon-hero">
      <!-- Top ticker -->
      <div class="mon-ticker fade-up" style="animation-delay: 0ms">
        <span class="dot dot-amber dot-glow" />
        <span class="mon-ticker__tag">UPLINK</span>
        <span class="mon-ticker__msg">
          {{ heroChannel.code }} &middot; {{ heroChannel.name.toUpperCase() }} &middot;
          {{ heroCaption.toUpperCase() }}
        </span>
        <span class="mon-ticker__stamp">
          {{ activeChannels.length }}/{{ channels.length }} AKTIF
        </span>
      </div>

      <!-- THE THEATER — all channels morph between hero and thumb here -->
      <div class="mon-theater" :class="{ 'mon-theater--switching': switching }">
        <!-- Each ChannelTile stays mounted; only its position class changes.
             CSS transitions do the morph. WS stays connected across switch. -->
        <div
          v-for="(ch, idx) in channels"
          :key="ch.code"
          :class="[
            'mon-tile',
            tilePosition(idx).role === 'hero' ? 'mon-tile--hero' : 'mon-tile--thumb',
          ]"
          :style="{
            '--thumb-order': tilePosition(idx).thumbOrder,
          }"
        >
          <div class="mon-tile__frame">
            <ChannelTile
              :code="ch.code"
              :name="ch.name"
              :host="VNC_HOST"
              :port="ch.port"
              :path="ch.wsPath"
              :vnc-base="ch.vncBase"
              :password="VNC_PASSWORD"
              :active="ch.active"
              :caption="captions[idx]"
              :view-only="true"
            />
          </div>

          <!-- Thumbnail badge (visible when tile is a thumb) -->
          <button
            v-if="tilePosition(idx).role === 'thumb'"
            class="mon-tile__swap"
            type="button"
            @click="selectHero(idx)"
            :aria-label="`Tukar ke ${ch.code}`"
          >
            <span class="mon-tile__swap-tag">
              <span class="num">{{ ch.code }}</span>
              <span class="mon-tile__swap-name">{{ ch.name.split('·')[0] }}</span>
            </span>
            <span class="mon-tile__swap-cta">
              TUKAR
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3 7h8M7 3l4 4-4 4" />
              </svg>
            </span>
          </button>
        </div>

        <!-- HERO CAPTION — pinned inside hero frame bottom-left.
             Sits in the theater grid so it stays anchored on switch. -->
        <div class="mon-caption" :key="heroChannel.code">
          <div class="mon-caption__veil" aria-hidden="true" />
          <div class="mon-caption__body">
            <span class="eyebrow eyebrow-accent">
              <span class="live-dot" />
              {{ heroChannel.code }} &middot; PRIMARY UPLINK
            </span>
            <h1 class="mon-caption__num">
              <span class="num">{{ formatNum(eventsPerMin) }}</span>
              <span class="mon-caption__num-unit">event/menit</span>
            </h1>
            <p class="mon-caption__sub">
              {{ heroCaption }}
            </p>
            <div class="mon-caption__cta">
              <button class="btn btn-amber" @click="takeControl">
                <span>Ambil Kontrol</span>
                <span class="btn-icon-nest">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M3 7h8M7 3l4 4-4 4" />
                  </svg>
                </span>
              </button>
              <button class="btn" @click="switchHero" :disabled="channels.length < 2">
                <span>Tukar Channel</span>
                <span class="btn-icon-nest">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M3 4h7M3 4l3-3M3 4l3 3M11 10H4M11 10l-3-3M11 10l-3 3" />
                  </svg>
                </span>
              </button>
              <span class="pill">{{ workers }} worker</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Channel activation list — below theater, compact horizontal -->
      <div class="mon-activation fade-up" style="animation-delay: 200ms">
        <span class="eyebrow">// AKTIVASI</span>
        <div class="mon-activation__list">
          <button
            v-for="(ch, i) in channels"
            :key="ch.code"
            type="button"
            class="mon-activate"
            :class="{ 'mon-activate--on': ch.active, 'mon-activate--hero': i === heroIndex }"
            @click="toggleChannel(i)"
          >
            <span class="mon-activate__box" :class="{ 'mon-activate__box--on': ch.active }" />
            <span class="mon-activate__code num">{{ ch.code }}</span>
            <span class="mon-activate__name">{{ ch.name }}</span>
            <span class="mon-activate__port num">:{{ ch.port }}</span>
            <span class="mon-activate__state num">{{ ch.active ? 'ON' : 'OFF' }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- TELEMETRY BAND                                                   -->
    <!-- ============================================================== -->
    <section class="atlas-section-mark">
      <span class="atlas-section-mark__num">02</span>
      <div class="atlas-section-mark__rule" />
      <div class="atlas-section-mark__title">
        <span class="eyebrow">// AGENT TELEMETRY</span>
        <h2 class="display-hero">Trace Hidup</h2>
      </div>
    </section>

    <section class="mon-band">
      <div class="mon-band__cell mon-band__cell--trace">
        <AgentTracePanel />
      </div>
      <div class="mon-band__cell">
        <NowCrawling :compact="false" />
      </div>
      <div class="mon-band__cell">
        <SystemOverview />
      </div>
    </section>
  </div>
</template>

<style scoped>
.mon-canvas { position: relative; min-height: 100dvh; }

/* HERO */
.mon-hero {
  position: relative;
  padding: 12px 28px 24px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
}

.mon-ticker {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 8px 18px;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-2));
}
.mon-ticker__tag { color: rgb(var(--accent)); font-weight: 600; }
.mon-ticker__msg {
  flex: 1;
  color: rgb(var(--ink));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mon-ticker__stamp { color: rgb(var(--ink-mute)); }

/* THEATER — the morph container.
 *
 * Tiles use absolute positioning with target geometry computed from
 * --thumb-order. Switching the hero just toggles classes; CSS transition
 * on top/left/right/width/height/transform handles the morph. ChannelTile
 * stays mounted so its websocket survives the swap. */
.mon-theater {
  position: relative;
  width: 100%;
  height: min(64dvh, 700px);
  min-height: 460px;
  border-radius: 28px;
  background: rgb(var(--shell) / 0.6);
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  box-shadow: var(--shadow-card);
  padding: 8px;
  overflow: hidden;
  isolation: isolate;
}

.mon-tile {
  position: absolute;
  border-radius: 20px;
  overflow: hidden;
  transition:
    top 700ms cubic-bezier(0.32, 0.72, 0, 1),
    left 700ms cubic-bezier(0.32, 0.72, 0, 1),
    right 700ms cubic-bezier(0.32, 0.72, 0, 1),
    bottom 700ms cubic-bezier(0.32, 0.72, 0, 1),
    width 700ms cubic-bezier(0.32, 0.72, 0, 1),
    height 700ms cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 500ms cubic-bezier(0.32, 0.72, 0, 1);
  background: rgb(var(--surface-2));
}
.mon-tile__frame {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
}
.mon-tile__frame > :first-child {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

/* HERO slot: left, takes most of theater, leaves 320px on the right for thumbs */
.mon-tile--hero {
  top: 8px;
  left: 8px;
  right: 332px;
  bottom: 8px;
  z-index: 1;
  box-shadow:
    0 0 0 1px rgb(var(--accent) / 0.35),
    0 24px 60px -20px rgb(var(--accent) / 0.25);
}

/* THUMB slot: stacked on the right rail.
 * Each thumb occupies a 320×178 box; --thumb-order shifts top. */
.mon-tile--thumb {
  top: calc(8px + var(--thumb-order, 0) * 196px);
  right: 8px;
  width: 320px;
  height: 180px;
  z-index: 2;
  box-shadow: var(--shadow-card);
  cursor: pointer;
}
.mon-tile--thumb:hover {
  box-shadow: var(--shadow-card-hover);
}

/* Thumb swap chip overlay */
.mon-tile__swap {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: rgb(var(--bg) / 0.78);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  cursor: pointer;
  transition: background-color var(--dur-240) var(--ease-out), transform var(--dur-240) var(--ease-out);
}
.mon-tile__swap:hover { background: rgb(var(--bg) / 0.95); transform: translateY(-1px); }
.mon-tile__swap-tag {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgb(var(--accent));
  font-weight: 600;
}
.mon-tile__swap-name {
  color: rgb(var(--ink-2));
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-size: 11px;
}
.mon-tile__swap-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  color: rgb(var(--ink));
  font-weight: 600;
}

/* CAPTION — pinned inside hero slot, bottom-left, with gradient veil.
 * Theater itself is the positioning context (not the tile) so the caption
 * stays in place during the morph and reads coherent with the active tile. */
.mon-caption {
  position: absolute;
  left: 36px;
  bottom: 32px;
  right: 360px;
  z-index: 4;
  pointer-events: none;
  animation: caption-pop 600ms cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes caption-pop {
  0%   { opacity: 0; transform: translateY(8px); filter: blur(8px); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0); }
}
.mon-caption__veil {
  position: absolute;
  inset: -28px -36px -36px -36px;
  z-index: 0;
  border-radius: 20px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgb(var(--bg) / 0.78) 60%,
    rgb(var(--bg) / 0.96) 100%
  );
  pointer-events: none;
}
.mon-caption__body {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  max-width: 540px;
}
.mon-caption__num {
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-weight: 700;
  font-size: clamp(3.5rem, 8vw, 7rem);
  line-height: 1.02;
  letter-spacing: -0.055em;
  padding-block: 0.04em;
  margin: 12px 0 6px;
  display: flex;
  align-items: baseline;
  gap: 18px;
  flex-wrap: wrap;
}
.mon-caption__num .num {
  background: linear-gradient(
    180deg,
    rgb(var(--accent-hot)) 0%,
    rgb(var(--accent)) 55%,
    rgb(var(--accent-glow, var(--accent))) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-variant-numeric: tabular-nums;
}
.mon-caption__num-unit {
  font-size: 0.32em;
  font-weight: 500;
  color: rgb(var(--ink-mute));
  letter-spacing: 0;
}
.mon-caption__sub {
  color: rgb(var(--ink-2));
  font-size: 13px;
  margin: 0 0 14px;
  max-width: 460px;
}
.mon-caption__cta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Switching state — subtle global brighten on the accent border of the hero
 * during the morph, plus a tiny scale-pop on the next-hero tile. */
.mon-theater--switching .mon-tile--hero {
  box-shadow:
    0 0 0 2px rgb(var(--accent) / 0.55),
    0 0 60px rgb(var(--accent) / 0.20),
    0 32px 80px -24px rgb(var(--accent) / 0.40);
}

/* ACTIVATION — horizontal compact strip below theater */
.mon-activation {
  margin-top: 18px;
  padding: 14px 14px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 18px;
  background: rgb(var(--surface));
  box-shadow: var(--shadow-card);
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.mon-activation > .eyebrow { flex-shrink: 0; }
.mon-activation__list {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}
.mon-activate {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 9999px;
  background: rgb(var(--surface));
  cursor: pointer;
  transition: all var(--dur-240) var(--ease-out);
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-size: 12px;
  color: rgb(var(--ink-2));
}
.mon-activate:hover {
  border-color: rgb(var(--rule) / var(--rule-strong-alpha));
  transform: translateY(-1px);
}
.mon-activate--hero {
  border-color: rgb(var(--accent) / 0.5);
  background: rgb(var(--accent) / 0.06);
}
.mon-activate__box {
  width: 14px; height: 14px;
  border-radius: 4px;
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  background: rgb(var(--surface-2));
  transition: all var(--dur-160) var(--ease-out);
}
.mon-activate__box--on {
  background: rgb(var(--accent));
  border-color: rgb(var(--accent));
  box-shadow: 0 0 8px rgb(var(--accent) / 0.5);
}
.mon-activate__code {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: rgb(var(--accent));
}
.mon-activate__name { color: rgb(var(--ink)); font-weight: 500; }
.mon-activate__port,
.mon-activate__state {
  font-size: 11px;
  color: rgb(var(--ink-mute));
}
.mon-activate__state {
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgb(var(--ink) / 0.04);
}
.mon-activate--on .mon-activate__state {
  color: rgb(var(--ok));
  background: rgb(var(--ok) / 0.10);
}

/* TELEMETRY BAND — row height locked so all three cells equal-height,
 * AgentTracePanel scrolls its trace list inside the cap. */
.mon-band {
  display: grid;
  grid-template-columns: 6fr 3fr 3fr;
  grid-auto-rows: 540px;
  gap: 20px;
  padding: 12px 28px 56px;
}
.mon-band__cell { min-width: 0; min-height: 0; overflow: hidden; }
.mon-band__cell > :first-child {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
}

/* MOBILE COLLAPSE */
@media (max-width: 1100px) {
  .mon-hero { padding: 8px 16px 18px; }
  .mon-theater { height: 80dvh; min-height: 0; padding: 6px; }
  .mon-tile--hero { top: 6px; left: 6px; right: 6px; bottom: calc(6px + (var(--thumb-count, 1) * 130px) + 16px); }
  .mon-tile--thumb {
    top: auto;
    bottom: calc(6px + var(--thumb-order, 0) * 130px);
    left: 6px;
    right: 6px;
    width: auto;
    height: 120px;
  }
  .mon-caption {
    left: 14px;
    right: 14px;
    bottom: calc(20% + 16px);
  }
  .mon-band { grid-template-columns: 1fr; padding: 12px 16px 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .mon-tile {
    transition: none;
  }
  .mon-caption {
    animation: none;
  }
}
</style>
