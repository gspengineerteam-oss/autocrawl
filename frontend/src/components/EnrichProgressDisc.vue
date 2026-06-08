<script setup lang="ts">
// Bottom-right "CD" enrich progress disc. Compact rest state, expandable on
// hover/focus. All numbers come from /api/system/enrich-progress — no
// synthesized values. Transform-only animations (no filter/blur) to keep
// continuous CPU pressure off the main thread.
//
// Rest size: 72px disc + thin spin ring (military / total).
// Expanded:  panel with queue depth, throughput buckets, scope breakdown.

import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'

const expanded = ref(false)
function toggle() { expanded.value = !expanded.value }

const { data, isError } = useQuery({
  queryKey: ['system', 'enrich-progress'],
  queryFn: () => api.system.enrichProgress(),
  refetchInterval: 10_000,
  refetchOnWindowFocus: true,
  staleTime: 5_000,
})

const backlog = computed(() => data.value?.queue.backlog ?? null)
const inflight = computed(() => data.value?.queue.inflight ?? null)
const consumers = computed(() => data.value?.queue.consumers ?? null)
const consumedTotal = computed(() => data.value?.queue.consumed_total ?? null)
const last5m = computed(() => data.value?.throughput.classified_5m ?? null)
const last1h = computed(() => data.value?.throughput.classified_1h ?? null)
const today = computed(() => data.value?.throughput.classified_today ?? null)
const total = computed(() => data.value?.scope.total ?? null)
const military = computed(() => data.value?.scope.military_visible ?? null)
const hidden = computed(() => data.value?.scope.hidden_off_scope ?? null)

// Derive consumption rate between polls (per-second). Pin previous values
// in refs so we measure actual delta, not snapshot value.
const prevConsumed = ref<number | null>(null)
const prevTs = ref<number | null>(null)
const consumedDelta = ref(0)
const ratePerMin = ref(0)
watch(
  () => consumedTotal.value,
  (cur) => {
    if (cur == null) return
    const now = Date.now()
    if (prevConsumed.value != null && prevTs.value != null && now > prevTs.value) {
      const dt = (now - prevTs.value) / 1000
      const dCount = cur - prevConsumed.value
      consumedDelta.value = dCount
      ratePerMin.value = dt > 0 ? Math.round((dCount / dt) * 60) : 0
    }
    prevConsumed.value = cur
    prevTs.value = now
  },
  { immediate: true },
)

// Outer ring = military / total catalog. Snowglobe coverage indicator.
const militaryPct = computed(() => {
  const t = total.value
  const m = military.value
  if (!t || m == null) return 0
  return Math.min(100, Math.round((m / t) * 100))
})
// Inner ring = drain progress against backlog. If backlog > total, we just
// cap at 1 incoming wave (visualizes "how close to drained").
const drainPct = computed(() => {
  const t = total.value
  const b = backlog.value
  if (!t || b == null) return 100
  return Math.max(0, Math.min(100, Math.round(((t - b) / t) * 100)))
})

const RADIUS_OUTER = 32
const CIRC_OUTER = 2 * Math.PI * RADIUS_OUTER
const RADIUS_INNER = 22
const CIRC_INNER = 2 * Math.PI * RADIUS_INNER

const outerDash = computed(() => {
  const filled = (militaryPct.value / 100) * CIRC_OUTER
  return `${filled} ${CIRC_OUTER - filled}`
})
const innerDash = computed(() => {
  const filled = (drainPct.value / 100) * CIRC_INNER
  return `${filled} ${CIRC_INNER - filled}`
})

const headline = computed(() => {
  const b = backlog.value
  if (b == null) return '—'
  if (b >= 10_000) return `${(b / 1000).toFixed(0)}k`
  if (b >= 1_000) return `${(b / 1000).toFixed(1)}k`
  return String(b)
})

// "Live" = consumer group masih nyala. Activity is separate axis below.
const isLive = computed(() =>
  !isError.value && (consumers.value ?? 0) > 0,
)
const statusLabel = computed(() => {
  if (isError.value) return 'OFFLINE'
  if (consumedDelta.value > 0 || (last5m.value ?? 0) > 0) return 'ENRICHING'
  if ((backlog.value ?? 0) === 0) return 'IDLE'
  return 'QUEUED'
})

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}
</script>

<template>
  <div
    class="enrich-disc"
    :class="{ 'is-expanded': expanded, 'is-live': isLive, 'is-error': isError }"
    role="region"
    aria-label="Status enrich agentic"
  >
    <button
      type="button"
      class="enrich-disc__core"
      :title="`Backlog: ${fmt(backlog)} · ${ratePerMin}/menit · klik buat detail`"
      @click="toggle"
    >
      <svg
        viewBox="0 0 80 80"
        class="enrich-disc__svg"
        :class="{ 'is-spinning': isLive && !expanded }"
        aria-hidden="true"
      >
        <!-- CD groove backdrop -->
        <circle cx="40" cy="40" r="36" class="ring-track ring-track--outer" />
        <circle cx="40" cy="40" r="32" class="ring-track ring-track--mid" />
        <circle cx="40" cy="40" r="22" class="ring-track ring-track--inner" />
        <!-- Outer arc — % of catalog that's military (snowglobe coverage) -->
        <circle
          cx="40" cy="40" :r="RADIUS_OUTER"
          class="ring-arc ring-arc--outer"
          :stroke-dasharray="outerDash"
          stroke-dashoffset="0"
          transform="rotate(-90 40 40)"
        />
        <!-- Inner arc — drain progress (1 - queue_depth/total) -->
        <circle
          cx="40" cy="40" :r="RADIUS_INNER"
          class="ring-arc ring-arc--inner"
          :stroke-dasharray="innerDash"
          stroke-dashoffset="0"
          transform="rotate(-90 40 40)"
        />
        <!-- CD center hole -->
        <circle cx="40" cy="40" r="7" class="hub" />
        <circle cx="40" cy="40" r="2.5" class="hub-bore" />
      </svg>
      <span class="enrich-disc__num num-display">{{ headline }}</span>
      <span class="enrich-disc__pulse" :data-status="statusLabel"></span>
    </button>

    <Transition name="disc-panel">
      <div v-if="expanded" class="enrich-disc__panel">
        <header class="panel-head">
          <span class="label label-amber">Enrich Agentic</span>
          <button type="button" class="btn-close" aria-label="Tutup" @click="toggle">×</button>
        </header>

        <dl class="panel-grid">
          <div class="cell">
            <dt>Backlog</dt>
            <dd class="num-display">{{ fmt(backlog) }}</dd>
            <span class="sub">belum dibaca</span>
          </div>
          <div class="cell">
            <dt>Inflight</dt>
            <dd class="num-display">{{ fmt(inflight) }}</dd>
            <span class="sub">{{ fmt(consumers) }} consumer</span>
          </div>
          <div class="cell">
            <dt>Tarif</dt>
            <dd class="num-display">{{ ratePerMin }}</dd>
            <span class="sub">tugas / menit</span>
          </div>
          <div class="cell">
            <dt>Diproses</dt>
            <dd class="num-display">{{ fmt(consumedTotal) }}</dd>
            <span class="sub">total sejak start</span>
          </div>
        </dl>

        <div class="scope-bar">
          <div class="scope-bar__row">
            <span class="scope-bar__label">Militer terlihat</span>
            <span class="num-display scope-bar__val num-amber">{{ fmt(military) }}</span>
          </div>
          <div class="scope-bar__row">
            <span class="scope-bar__label">Disembunyikan off-scope</span>
            <span class="num-display scope-bar__val text-ink-mute">{{ fmt(hidden) }}</span>
          </div>
          <div class="scope-bar__row">
            <span class="scope-bar__label">Total katalog</span>
            <span class="num-display scope-bar__val">{{ fmt(total) }}</span>
          </div>
          <div class="scope-bar__row scope-bar__row--today">
            <span class="scope-bar__label">Klasifikasi 5 menit</span>
            <span class="num-display scope-bar__val">{{ fmt(last5m) }}</span>
          </div>
          <div class="scope-bar__row">
            <span class="scope-bar__label">Klasifikasi 1 jam</span>
            <span class="num-display scope-bar__val">{{ fmt(last1h) }}</span>
          </div>
          <div class="scope-bar__row">
            <span class="scope-bar__label">Klasifikasi hari ini</span>
            <span class="num-display scope-bar__val">{{ fmt(today) }}</span>
          </div>
        </div>

        <footer class="panel-foot">
          <RouterLink to="/diagnostik" class="btn btn-ghost btn-sm">
            Buka Diagnostik
          </RouterLink>
          <span class="status-pill" :data-status="statusLabel">
            <span class="status-pill__dot"></span>{{ statusLabel }}
          </span>
        </footer>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.enrich-disc {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 60;
  font-size: 11px;
  color: rgb(var(--ink));
  pointer-events: none;
}
.enrich-disc__core,
.enrich-disc__panel {
  pointer-events: auto;
}

.enrich-disc__core {
  position: relative;
  width: 80px;
  height: 80px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: block;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.22));
  transition: transform 220ms cubic-bezier(0.20, 0.60, 0.20, 1);
}
.enrich-disc__core:hover { transform: translateY(-2px); }
.enrich-disc__core:focus-visible {
  outline: 2px solid rgb(var(--amber));
  outline-offset: 4px;
  border-radius: 50%;
}

.enrich-disc__svg {
  width: 80px;
  height: 80px;
  display: block;
}
.enrich-disc__svg.is-spinning {
  transform-origin: 50% 50%;
  animation: disc-spin 28s linear infinite;
  will-change: transform;
}
@keyframes disc-spin {
  to { transform: rotate(360deg); }
}

.ring-track {
  fill: rgb(var(--surface));
  stroke: rgb(var(--rule));
  stroke-width: 0.6;
  opacity: 0.95;
}
.ring-track--outer { fill: rgb(var(--surface-2)); opacity: 1; }
.ring-track--mid   { fill: none; stroke-width: 0.4; opacity: 0.6; }
.ring-track--inner { fill: none; stroke-width: 0.4; opacity: 0.6; }

.ring-arc {
  fill: none;
  stroke-linecap: butt;
  transition: stroke-dasharray 480ms cubic-bezier(0.20, 0.60, 0.20, 1);
}
.ring-arc--outer {
  stroke: rgb(var(--amber));
  stroke-width: 4;
}
.ring-arc--inner {
  stroke: rgb(var(--ink-2));
  stroke-width: 3;
  opacity: 0.85;
}

.hub      { fill: rgb(var(--bg)); stroke: rgb(var(--rule)); stroke-width: 0.6; }
.hub-bore { fill: rgb(var(--ink-mute)); }

.enrich-disc__num {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--ink));
  letter-spacing: -0.02em;
  pointer-events: none;
}

.enrich-disc__pulse {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ink-mute));
  box-shadow: 0 0 0 2px rgb(var(--bg));
}
.enrich-disc.is-live .enrich-disc__pulse {
  background: rgb(var(--amber));
  animation: pulse 1.8s ease-in-out infinite;
}
.enrich-disc.is-error .enrich-disc__pulse {
  background: rgb(220, 60, 60);
}
@keyframes pulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.18); }
}

/* === Expanded panel === */
.enrich-disc__panel {
  position: absolute;
  right: 0;
  bottom: 96px;
  width: 280px;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule));
  border-radius: 4px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.30);
  padding: 12px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.disc-panel-enter-active,
.disc-panel-leave-active {
  transition: opacity 180ms ease, transform 180ms cubic-bezier(0.20, 0.60, 0.20, 1);
}
.disc-panel-enter-from,
.disc-panel-leave-to { opacity: 0; transform: translateY(6px); }

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.btn-close {
  border: none;
  background: transparent;
  color: rgb(var(--ink-mute));
  font-size: 18px;
  line-height: 1;
  padding: 0 6px;
  cursor: pointer;
}
.btn-close:hover { color: rgb(var(--ink)); }

.panel-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin: 0;
}
.cell { display: flex; flex-direction: column; }
.cell dt {
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.cell dd {
  font-size: 18px;
  font-weight: 600;
  margin: 2px 0 0;
  color: rgb(var(--ink));
  tabular-nums: 1;
}
.cell .sub { font-size: 10px; color: rgb(var(--ink-mute)); margin-top: 1px; }

.scope-bar {
  border-top: 1px solid rgb(var(--rule));
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scope-bar__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
}
.scope-bar__label { color: rgb(var(--ink-2)); }
.scope-bar__val   { font-size: 12.5px; font-weight: 600; }
.scope-bar__row--today { border-top: 1px dashed rgb(var(--rule)); padding-top: 4px; margin-top: 2px; }

.panel-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgb(var(--rule));
  padding-top: 8px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.status-pill__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgb(var(--ink-mute));
}
.status-pill[data-status="ENRICHING"] { color: rgb(var(--amber)); }
.status-pill[data-status="ENRICHING"] .status-pill__dot { background: rgb(var(--amber)); }
.status-pill[data-status="OFFLINE"]   { color: rgb(220, 60, 60); }
.status-pill[data-status="OFFLINE"] .status-pill__dot { background: rgb(220, 60, 60); }
</style>
