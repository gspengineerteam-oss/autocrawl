<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'

/**
 * Now Crawling - real-time view of what the agent is doing right now.
 *
 *   - Active run state + duration counter (live, updates each second)
 *   - In-flight stages with their current target (vendor/expo label)
 *   - Recent orchestrator events ticker (last 5 things that happened)
 *
 * All data from /orchestrator/{current,events,throughput}. No synthesis.
 * Polling cadence is fast (2-3s) since this is the realtime panel.
 */

const current = useQuery({
  queryKey: ['orchestrator', 'current'],
  queryFn: api.orchestrator.current,
  refetchInterval: 2500,
})
const events = useQuery({
  queryKey: ['orchestrator', 'events', 'recent'],
  queryFn: () => api.orchestrator.events('0', 6),
  refetchInterval: 3000,
})
const throughput = useQuery({
  queryKey: ['orchestrator', 'throughput', 'now'],
  queryFn: () => api.orchestrator.throughput(60),
  refetchInterval: 3000,
})

const props = withDefaults(defineProps<{
  /** Hide the recent-events ticker section (used on the monitor page
   *  where the bottom NewsTicker already covers that info). */
  compact?: boolean
}>(), { compact: false })

const cur = computed(() => current.data.value)
const evs = computed(() => (events.data.value?.events ?? []).slice().reverse().slice(0, 5))
const tp = computed(() => throughput.data.value)

const isLive = computed(() => Boolean(cur.value?.active_run))
const runMode = computed(() => cur.value?.active_run?.mode ?? null)

/* Live duration counter - re-renders every second so the digit ticks */
const tickNow = ref(Date.now())
let tickHandle = 0
onMounted(() => { tickHandle = window.setInterval(() => (tickNow.value = Date.now()), 1000) })
onBeforeUnmount(() => { if (tickHandle) window.clearInterval(tickHandle) })

const runDuration = computed(() => {
  const startedAt = cur.value?.active_run?.started_at
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return null
  const sec = Math.floor((tickNow.value - start) / 1000)
  if (sec < 0) return '00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const activeStages = computed(() => {
  const stages = cur.value?.stages ?? []
  return stages.filter((s) => s.active > 0 || s.in_flight_label)
})

function eventTone(ev: { event: string }): 'amber' | 'ok' | 'crit' | 'mute' {
  if (ev.event === 'completed') return 'ok'
  if (ev.event === 'failed') return 'crit'
  if (ev.event === 'started') return 'amber'
  return 'mute'
}

function timeAgo(ts: number | undefined): string {
  if (!ts) return '—'
  const ms = ts < 1e12 ? ts * 1000 : ts
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s}d`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}j`
}

function eventLabel(ev: { event: string; node: string; payload: Record<string, unknown> }): string {
  const p = ev.payload || {}
  const name = (p.vendor_name || p.expo_name || p.domain || p.name) as string | undefined
  if (name) return name
  if (p.url) return String(p.url)
  return ev.node
}

const vpm = computed(() => Math.round((tp.value?.vendors_per_minute ?? 0) * 10) / 10)
const workers = computed(() => tp.value?.active_workers_total ?? 0)
</script>

<template>
  <article class="card overflow-hidden">
    <div class="card-head">
      <div class="flex items-center gap-2">
        <span class="dot dot-glow" :class="isLive ? 'dot-amber pulse-amber' : 'dot-mute'"></span>
        <span class="label">Now Crawling</span>
      </div>
      <div class="flex items-baseline gap-2">
        <span v-if="runMode" class="pill pill-amber">{{ runMode.toUpperCase() }}</span>
        <span v-else class="label label-mute">IDLE</span>
        <span v-if="runDuration" class="num-display num-amber text-[12px]">{{ runDuration }}</span>
      </div>
    </div>

    <div class="card-body">
      <!-- Quick metrics row -->
      <div class="flex items-baseline gap-4 mb-3">
        <div>
          <div class="num-display num-amber text-[20px] font-semibold leading-none">{{ workers }}</div>
          <div class="label label-mute mt-1">worker</div>
        </div>
        <div class="rule-l h-7"></div>
        <div>
          <div class="num-display num-amber text-[20px] font-semibold leading-none">{{ vpm }}</div>
          <div class="label label-mute mt-1">v/menit</div>
        </div>
        <div class="rule-l h-7"></div>
        <div>
          <div class="num-display num-amber text-[20px] font-semibold leading-none">{{ activeStages.length }}</div>
          <div class="label label-mute mt-1">stage aktif</div>
        </div>
      </div>

      <!-- Active stages with in-flight labels -->
      <div v-if="activeStages.length > 0" class="rule-t pt-3">
        <div class="label mb-2">Sedang Diproses</div>
        <ul class="space-y-1.5">
          <li
            v-for="stage in activeStages.slice(0, 3)"
            :key="stage.code"
            class="flex items-baseline gap-2.5"
          >
            <span class="num-display text-[10.5px] tracking-[0.16em] text-ink-mute w-7 shrink-0 uppercase">
              {{ stage.code }}
            </span>
            <span class="num-display text-[12px] num-amber w-5 shrink-0">{{ stage.active }}</span>
            <span
              v-if="stage.in_flight_label"
              class="text-[12px] text-ink truncate"
              :title="stage.in_flight_label"
            >
              {{ stage.in_flight_label }}
            </span>
            <span v-else class="text-[12px] text-ink-2 truncate">{{ stage.label }}</span>
          </li>
        </ul>
      </div>
      <div v-else class="rule-t pt-3 text-center">
        <span class="label label-mute">Tiada stage aktif</span>
      </div>

      <!-- Recent events ticker (hidden on monitor page via :compact prop) -->
      <div v-if="!props.compact && evs.length > 0" class="rule-t mt-3 pt-3">
        <div class="label mb-2">Aliran Event</div>
        <ul class="space-y-1">
          <li
            v-for="ev in evs"
            :key="ev.id"
            class="grid grid-cols-[auto_1fr_auto] items-baseline gap-2"
          >
            <span class="dot" :class="`dot-${eventTone(ev)}`"></span>
            <span class="text-[11.5px] text-ink truncate" :title="eventLabel(ev)">
              <span class="num-display text-[10px] uppercase tracking-[0.14em] text-ink-mute mr-1.5">{{ ev.event }}</span>{{ eventLabel(ev) }}
            </span>
            <span class="num-display text-[10px] text-ink-mute tabular-nums">{{ timeAgo(ev.ts) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>
