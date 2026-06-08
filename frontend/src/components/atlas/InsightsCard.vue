<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import { useNumberTicker } from '@/composables/useNumberTicker'

/**
 * AI Insights — big amber delta % up top, sparkline middle, small
 * supporting stats below. Hand-rolled SVG sparkline (no chart lib for
 * something this simple), data straight from /stats/timeline.
 */

const timeline = useQuery({
  queryKey: ['stats', 'timeline', 30],
  queryFn: () => api.stats.timeline(30),
  refetchInterval: 60_000,
})
const errSummary = useQuery({
  queryKey: ['orchestrator', 'error-summary'],
  queryFn: () => api.orchestrator.errorSummary(8),
  refetchInterval: 30_000,
})

const points = computed(() => timeline.data.value ?? [])

const stats = computed(() => {
  const ps = points.value
  if (ps.length === 0) return { delta: 0, total: 0, peak: 0, avg: 0 }
  const half = Math.floor(ps.length / 2)
  const earlySum = ps.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const lateSum  = ps.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const total    = earlySum + lateSum
  const delta    = earlySum === 0
    ? (lateSum > 0 ? 100 : 0)
    : ((lateSum - earlySum) / earlySum) * 100
  const peak = ps.reduce((m, p) => Math.max(m, p.vendors_added ?? 0), 0)
  const avg = total / Math.max(1, ps.length)
  return { delta, total, peak, avg }
})

const errCount = computed(() =>
  (errSummary.data.value?.groups ?? []).reduce((s, g) => s + (g.count ?? 0), 0),
)

const tickedDelta = useNumberTicker(
  computed(() => Math.round(stats.value.delta * 10)),
  { round: false, duration: 600 },
)

/* Sparkline path */
const sparkPath = computed(() => {
  const ps = points.value
  if (ps.length === 0) return { line: '', area: '' }
  const w = 280
  const h = 60
  const max = Math.max(1, ...ps.map(p => p.vendors_added ?? 0))
  const stepX = ps.length > 1 ? w / (ps.length - 1) : 0
  let line = ''
  for (let i = 0; i < ps.length; i++) {
    const x = i * stepX
    const y = h - ((ps[i].vendors_added ?? 0) / max) * h * 0.85 - 4
    line += (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  const area = `${line} L ${w} ${h} L 0 ${h} Z`
  return { line, area }
})

const positive = computed(() => stats.value.delta >= 0)
</script>

<template>
  <article class="card overflow-hidden">
    <div class="card-head">
      <div class="flex items-center gap-2">
        <span class="dot dot-amber dot-glow"></span>
        <span class="label">AI Insights</span>
      </div>
      <span class="label label-mute">30D · 15/15</span>
    </div>

    <div class="card-body">
      <!-- Big delta -->
      <div class="flex items-baseline gap-2.5">
        <span
          class="num-display text-[40px] leading-none font-semibold"
          :class="positive ? 'num-amber' : 'text-crit'"
        >
          {{ positive ? '+' : '' }}{{ (tickedDelta / 10).toFixed(1) }}%
        </span>
        <FaIcon
          :icon="['fas', positive ? 'arrow-trend-up' : 'arrow-trend-down']"
          class="text-[20px]"
          :class="positive ? 'text-amber' : 'text-crit'"
        />
      </div>
      <p class="mt-1 text-[12.5px] text-ink-2 leading-snug">
        Pertumbuhan vendor di paruh akhir vs paruh awal jendela 30 hari.
      </p>

      <!-- Sparkline -->
      <div class="mt-4 -mx-1">
        <svg viewBox="0 0 280 60" class="w-full h-[60px] block" preserveAspectRatio="none">
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgb(255 184 64)" stop-opacity="0.40"/>
              <stop offset="100%" stop-color="rgb(255 184 64)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path :d="sparkPath.area" fill="url(#spark-fill)" />
          <path :d="sparkPath.line" fill="none" stroke="rgb(255 184 64)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
      </div>

      <!-- Supporting stats -->
      <dl class="mt-4 grid grid-cols-3 gap-3 pt-4 rule-t">
        <div>
          <dt class="label">Total 30D</dt>
          <dd class="num-display text-[16px] mt-1">{{ stats.total.toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="label">Puncak</dt>
          <dd class="num-display text-[16px] mt-1">{{ stats.peak.toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="label">Galat</dt>
          <dd class="num-display text-[16px] mt-1" :class="errCount > 0 ? 'text-crit' : ''">{{ errCount }}</dd>
        </div>
      </dl>
    </div>
  </article>
</template>
