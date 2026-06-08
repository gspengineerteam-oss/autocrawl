<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import type { AgentTrace } from '@/api/types'

/**
 * Live agentic newsroom ticker.
 *
 * - Polling /orchestrator/agent-traces tiap 5 detik.
 * - Semua kind kecuali step_header + action.
 * - Konten di-scroll continuous kiri-ke-kanan (marquee linear infinite),
 *   track di-duplicate dua kali untuk seamless loop.
 * - Status diferensiasi via WARNA SAJA: dot + kind label berwarna
 *   --ok (hijau) untuk verdict success, --crit (merah) untuk fail,
 *   --ink-mute untuk null verdict. NO emoji / glyph.
 * - Full text tanpa trim. Pause on hover supaya bisa baca detail.
 * - prefers-reduced-motion: animation off, konten static.
 */

interface TickerItem {
  id: string
  verdict: 'success' | 'fail' | null
  kind: AgentTrace['kind']
  agent: string
  text: string
  tsMs: number
}

const EXCLUDE_KIND: ReadonlySet<AgentTrace['kind']> = new Set(['step_header', 'action'])

// Tiga pass sanitization
//  (1) hapus SELURUH pictograph Unicode di string
//  (2) hapus leading karakter non-alfanumerik di awal string
//  (3) hapus redundant kind prefix
const PICTOGRAPHIC_GLOBAL = /\p{Extended_Pictographic}/gu
const LEADING_NON_WORD    = /^[^\p{L}\p{N}"'(\[]+/u
const REDUNDANT_PREFIX    = /^(eval|memory|goal|next\s+goal|judge|result)\s*:\s*/i

function sanitize(text: string): string {
  let cleaned = (text || '').replace(PICTOGRAPHIC_GLOBAL, '')
  cleaned = cleaned.replace(LEADING_NON_WORD, '').trim()
  cleaned = cleaned.replace(REDUNDANT_PREFIX, '').trim()
  return cleaned
}

const items = ref<TickerItem[]>([])
const nowMs = ref(Date.now())
const animationDuration = ref<string>('80s')

let clockTimer: ReturnType<typeof setInterval> | null = null

const tracesQuery = useQuery({
  queryKey: ['orchestrator', 'agent-traces-ticker'],
  queryFn: () => api.orchestrator.agentTraces(60),
  refetchInterval: 5_000,
})

function makeId(t: AgentTrace): string {
  return `${t.ts}|${t.kind}|${t.agent}|${t.text.slice(0, 40)}`
}

function ingest(traces: AgentTrace[]) {
  if (!traces.length) return
  const filtered = traces.filter((t) => !EXCLUDE_KIND.has(t.kind))
  if (!filtered.length) return

  const mapped: TickerItem[] = filtered.map((t) => ({
    id: makeId(t),
    verdict: t.verdict,
    kind: t.kind,
    agent: sanitize(t.agent || ''),
    text: sanitize(t.text || ''),
    tsMs: new Date(t.ts).getTime() || Date.now(),
  })).filter((m) => m.text.length > 0)

  // Newest first; replace seluruh items supaya konsisten dengan backend snapshot.
  mapped.sort((a, b) => b.tsMs - a.tsMs)
  items.value = mapped.slice(0, 40)
}

watch(tracesQuery.data, (resp) => {
  if (!resp) return
  ingest(resp.items)
}, { immediate: true })

// Hitung total karakter untuk durasi loop yang konsisten "rasanya":
// ~ 60 piksel/detik linear, ~ 8px per glyph average.
watch(items, () => {
  const totalChars = items.value.reduce(
    (a, b) => a + b.kind.length + b.agent.length + b.text.length + 6,
    0,
  )
  const estPx = totalChars * 8 + items.value.length * 24
  const seconds = Math.max(40, Math.round(estPx / 60))
  animationDuration.value = `${seconds}s`
}, { immediate: true })

function timeAgo(ms: number): string {
  const diff = Math.max(0, nowMs.value - ms)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}d`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j`
  return `${Math.floor(h / 24)}h`
}

const empty = computed(() => items.value.length === 0)
const trackItems = computed(() => items.value)

onMounted(() => {
  clockTimer = setInterval(() => { nowMs.value = Date.now() }, 1000)
})
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <div class="ticker" role="log" aria-live="polite">
    <span class="ticker__eyebrow">
      <span class="ticker__pulse" aria-hidden="true" />
      // LIVE STREAM
    </span>

    <div v-if="!empty" class="ticker__marquee">
      <div
        class="ticker__track"
        :style="{ animationDuration: animationDuration }"
      >
        <span
          v-for="item in trackItems"
          :key="item.id"
          class="ticker__item"
          :data-verdict="item.verdict ?? 'neutral'"
        >
          <span class="ticker__dot" aria-hidden="true" />
          <span class="ticker__kind">{{ item.kind }}</span>
          <span v-if="item.agent" class="ticker__agent">{{ item.agent }}</span>
          <span class="ticker__text">{{ item.text }}</span>
          <span class="ticker__ts">{{ timeAgo(item.tsMs) }}</span>
        </span>
        <!-- Duplicate untuk seamless infinite loop -->
        <span
          v-for="item in trackItems"
          :key="item.id + '|dup'"
          class="ticker__item"
          :data-verdict="item.verdict ?? 'neutral'"
          aria-hidden="true"
        >
          <span class="ticker__dot" />
          <span class="ticker__kind">{{ item.kind }}</span>
          <span v-if="item.agent" class="ticker__agent">{{ item.agent }}</span>
          <span class="ticker__text">{{ item.text }}</span>
          <span class="ticker__ts">{{ timeAgo(item.tsMs) }}</span>
        </span>
      </div>
    </div>

    <div v-else class="ticker__idle">
      <span>menunggu agent trace</span>
    </div>
  </div>
</template>

<style scoped>
.ticker {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 22px;
  border-top:    1px solid rgb(var(--rule) / var(--rule-alpha));
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  background: rgb(var(--surface));
  color: rgb(var(--ink));
  font-family: 'Hanken Grotesk Variable', 'Hanken Grotesk', system-ui, sans-serif;
  min-height: 36px;
  overflow: hidden;
  position: relative;
}

.ticker__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
  z-index: 2;
}

.ticker__pulse {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgb(var(--accent));
  animation: ticker-pulse 1600ms cubic-bezier(0.22, 1, 0.36, 1) infinite;
  will-change: transform, box-shadow;
}

@keyframes ticker-pulse {
  0%   { transform: scale(1);    box-shadow: 0 0 0 0   rgb(var(--accent) / 0.55); }
  70%  { transform: scale(1.05); box-shadow: 0 0 0 7px rgb(var(--accent) / 0); }
  100% { transform: scale(1);    box-shadow: 0 0 0 0   rgb(var(--accent) / 0); }
}

/* MARQUEE — viewport yang menyembunyikan track; track flows left forever. */
.ticker__marquee {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(
    to right,
    transparent 0,
    rgb(0 0 0 / 1) 24px,
    rgb(0 0 0 / 1) calc(100% - 36px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    rgb(0 0 0 / 1) 24px,
    rgb(0 0 0 / 1) calc(100% - 36px),
    transparent 100%
  );
}

.ticker__track {
  display: inline-flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
  width: max-content;
  animation: ticker-scroll linear infinite;
  will-change: transform;
}
.ticker:hover .ticker__track { animation-play-state: paused; }

@keyframes ticker-scroll {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(-50%, 0, 0); }
}

.ticker__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  font-size: 11.5px;
  line-height: 1;
  color: rgb(var(--ink));
  border-left: 1px solid rgb(var(--rule) / var(--rule-alpha));
}
.ticker__item:first-child { border-left: none; padding-left: 0; }

.ticker__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgb(var(--ink-mute));
  flex-shrink: 0;
}
.ticker__item[data-verdict='success'] .ticker__dot { background: rgb(var(--ok)); }
.ticker__item[data-verdict='fail']    .ticker__dot { background: rgb(var(--crit)); }

.ticker__kind {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.ticker__item[data-verdict='success'] .ticker__kind { color: rgb(var(--ok)); }
.ticker__item[data-verdict='fail']    .ticker__kind { color: rgb(var(--crit)); }

.ticker__agent {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.005em;
  color: rgb(var(--ink-2));
}

.ticker__text {
  font-size: 11.5px;
  font-weight: 400;
  color: rgb(var(--ink-2));
}

.ticker__ts {
  font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
  font-feature-settings: 'tnum' on, 'zero' on, 'ss19' on;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ink-mute));
}

.ticker__idle {
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
  opacity: 0.7;
}

@media (prefers-reduced-motion: reduce) {
  .ticker__pulse { animation: none; }
  .ticker__track { animation: none; transform: none; }
}
</style>
