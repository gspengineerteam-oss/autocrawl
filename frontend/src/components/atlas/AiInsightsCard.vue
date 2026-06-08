<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import { useNumberTicker } from '@/composables/useNumberTicker'

/**
 * Tren · 30 Hari — vendor-enrichment trend snapshot.
 *
 * REAL DATA ONLY. No client-side prose synthesis. Every number on this
 * card comes from a backend endpoint, labeled honestly with what it is
 * and where it came from. Earlier iterations of this component included
 * hand-written commentary that combined real numbers with invented
 * narrative ("klaster industri Asia Tenggara…") — that has been removed.
 *
 * Sources:
 *   - delta % + early/late sums      ← /stats/timeline?days=30
 *   - active error count + categories ← /orchestrator/error-summary
 *   - latest run mode + timestamp     ← /runs?limit=5
 */

const timeline = useQuery({
  queryKey: ['stats', 'timeline', 30],
  queryFn: () => api.stats.timeline(30),
  refetchInterval: 60_000,
})
const errSummary = useQuery({
  queryKey: ['orchestrator', 'error-summary'],
  queryFn: () => api.orchestrator.errorSummary(2),
  refetchInterval: 30_000,
})
const recentRuns = useQuery({
  queryKey: ['runs', 'recent', 5],
  queryFn: () => api.runs(5),
  refetchInterval: 30_000,
})

const stats = computed(() => {
  const points = timeline.data.value ?? []
  const half = Math.floor(points.length / 2)
  const earlySum = points.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const lateSum  = points.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const total    = earlySum + lateSum
  const delta    = earlySum === 0
    ? (lateSum > 0 ? 100 : 0)
    : ((lateSum - earlySum) / earlySum) * 100
  return { earlySum, lateSum, total, delta, points: points.length }
})

const errCount = computed(() =>
  (errSummary.data.value?.groups ?? []).reduce((s, g) => s + (g.count ?? 0), 0),
)
const errCategories = computed(() => (errSummary.data.value?.groups ?? []).length)

const latestRun = computed(() => {
  const items = recentRuns.data.value?.items ?? []
  return items[0] ?? null
})

function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}d`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j`
  const d = Math.floor(h / 24)
  return `${d}h`
}

const tickedDelta = useNumberTicker(
  computed(() => Math.round(stats.value.delta * 10)),
  { round: false },
)
const tickedTotal = useNumberTicker(computed(() => stats.value.total))
</script>

<template>
  <article class="card p-5">
    <header class="flex items-baseline justify-between">
      <span class="label">Tren · 30 Hari</span>
      <span class="label-mono text-[0.625rem]">15D / 15D</span>
    </header>

    <!-- Delta — real percentage from real timeline halves -->
    <div class="mt-3 flex items-baseline gap-3">
      <span
        class="num-display text-[3.5rem] leading-none"
        :class="stats.delta >= 0 ? 'text-accent-ink' : 'text-vermilion'"
      >
        {{ stats.delta >= 0 ? '+' : '' }}{{ (tickedDelta / 10).toFixed(1) }}%
      </span>
      <Icon
        :name="stats.delta >= 0 ? 'trending-up' : 'trending-down'"
        :size="22"
        :class="stats.delta >= 0 ? 'text-accent-ink' : 'text-vermilion'"
      />
    </div>

    <!-- Honest grid: every number labeled, every number real -->
    <dl class="mt-4 grid grid-cols-[1fr_auto] gap-y-2.5 gap-x-4 items-baseline">
      <dt class="label">Paruh awal</dt>
      <dd class="num-display text-[1rem]">{{ stats.earlySum.toLocaleString() }}</dd>

      <dt class="label">Paruh akhir</dt>
      <dd class="num-display text-[1rem]">{{ stats.lateSum.toLocaleString() }}</dd>

      <dt class="label">Total 30 hari</dt>
      <dd class="num-display text-[1.125rem] text-ink">{{ tickedTotal.toLocaleString() }}</dd>
    </dl>

    <!-- Companion metrics -->
    <div class="rule-t mt-4 pt-3 grid grid-cols-2 gap-3">
      <div>
        <span class="label block">Galat aktif</span>
        <div class="mt-1 flex items-baseline gap-2">
          <span class="num-display text-[1.25rem]">{{ errCount }}</span>
          <span class="label-mono text-[0.625rem]">· {{ errCategories }} kat</span>
        </div>
      </div>
      <div>
        <span class="label block">Run terakhir</span>
        <div class="mt-1 flex items-baseline gap-2" v-if="latestRun">
          <span class="font-mono text-[0.8125rem] uppercase tracking-[0.06em] text-ink">{{ latestRun.mode }}</span>
          <span class="label-mono text-[0.625rem]">· {{ timeAgo(latestRun.started_at) }}</span>
        </div>
        <span v-else class="label">—</span>
      </div>
    </div>

    <!-- Provenance line — what data this card draws on -->
    <div class="rule-t mt-3 pt-2 flex items-center justify-between">
      <span class="label-mono text-[0.625rem]">/stats/timeline</span>
      <span class="label-mono text-[0.625rem]">{{ stats.points }} titik</span>
    </div>
  </article>
</template>
