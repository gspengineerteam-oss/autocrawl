<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import HudPanel from './HudPanel.vue'

const tpQ = useQuery({
  queryKey: ['ops', 'throughput'],
  queryFn: () => api.orchestrator.throughput(60),
  refetchInterval: 1000,
  refetchOnWindowFocus: true,
})

const data = computed(() => tpQ.data.value)

const byNodeBars = computed(() => {
  const bn = data.value?.by_node ?? {}
  const max = Math.max(0.01, ...Object.values(bn))
  const order = [
    'discover',
    'worker_extract',
    'worker_pdf_extract',
    'worker_resolve',
    'worker_enrich',
    'finalize',
  ]
  return order.map((node) => ({
    node,
    code: nodeCode(node),
    rate: bn[node] ?? 0,
    pct: ((bn[node] ?? 0) / max) * 100,
  }))
})

function nodeCode(node: string): string {
  if (node === 'discover') return '01 DSC'
  if (node === 'worker_extract') return '02A XTR'
  if (node === 'worker_pdf_extract') return '02B PDF'
  if (node === 'worker_resolve') return '03 RSV'
  if (node === 'worker_enrich') return '04 ENR'
  if (node === 'finalize') return '05 FIN'
  return node
}

function formatWindow(seconds: number | undefined): string {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function formatAgo(unix: number | null | undefined, now: number | undefined): string {
  if (!unix) return 'belum ada'
  const ago = Math.max(0, (now ?? Date.now() / 1000) - unix)
  if (ago < 60) return `${Math.floor(ago)}s lalu`
  if (ago < 3600) return `${Math.floor(ago / 60)}m lalu`
  if (ago < 86400) return `${Math.floor(ago / 3600)}h lalu`
  return `${Math.floor(ago / 86400)}d lalu`
}

const windowLabel = computed(() => {
  const eff = data.value?.effective_window_seconds
  const isFallback = data.value?.fallback_used
  return `${formatWindow(eff)}${isFallback ? ' • fallback' : ''}`
})

const lastEventLabel = computed(() =>
  formatAgo(data.value?.last_event_at, data.value?.now),
)

const isLive = computed(() => {
  const last = data.value?.last_event_at
  const now = data.value?.now ?? Date.now() / 1000
  if (!last) return false
  return now - last < 30
})
</script>

<template>
  <HudPanel title="Throughput" code="OPS-RATE">
    <template #actions>
      <span
        class="hud-mono-num text-2xs"
        :class="isLive ? 'text-ok-600 dark:text-ok-400' : 'text-base-400 dark:text-base-500'"
      >
        {{ isLive ? '● LIVE' : '○ IDLE' }}
      </span>
      <span class="hud-mono-num text-2xs text-base-400 dark:text-base-500">
        {{ windowLabel }}
      </span>
    </template>

    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900">
          <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">
            VENDOR / MIN
          </span>
          <span class="hud-mono-num text-xl font-semibold text-ok-600 dark:text-ok-400">
            {{ data?.vendors_per_minute?.toFixed(1) ?? '0.0' }}
          </span>
        </div>
        <div class="flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900">
          <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">
            ERROR / MIN
          </span>
          <span
            class="hud-mono-num text-xl font-semibold"
            :class="(data?.errors_per_minute ?? 0) > 0 ? 'text-crit-600 dark:text-crit-400' : 'text-base-500 dark:text-base-400'"
          >
            {{ data?.errors_per_minute?.toFixed(1) ?? '0.0' }}
          </span>
        </div>
        <div class="flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900">
          <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">
            EVENT / MIN
          </span>
          <span class="hud-mono-num text-xl font-semibold text-info-600 dark:text-info-400">
            {{ data?.events_per_minute?.toFixed(1) ?? '0.0' }}
          </span>
        </div>
        <div class="flex flex-col items-center border border-base-200 bg-base-50 px-2 py-2 dark:border-base-700 dark:bg-base-900">
          <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">
            WORKER AKTIF
          </span>
          <span
            class="hud-mono-num text-xl font-semibold"
            :class="(data?.active_workers_total ?? 0) > 0 ? 'text-warn-600 dark:text-warn-400' : 'text-base-500 dark:text-base-400'"
          >
            {{ data?.active_workers_total ?? 0 }}
          </span>
        </div>
      </div>

      <div class="flex items-center justify-between border border-base-200 bg-base-50/50 px-2 py-1 dark:border-base-700 dark:bg-base-900/50">
        <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">
          AKTIVITAS TERAKHIR
        </span>
        <span class="hud-mono-num text-2xs text-base-700 dark:text-base-200">
          {{ lastEventLabel }}
        </span>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">
          EVENT BREAKDOWN PER STAGE ({{ formatWindow(data?.effective_window_seconds) }})
        </span>
        <div class="flex flex-col gap-1">
          <div
            v-for="bar in byNodeBars"
            :key="bar.node"
            class="flex items-center gap-1.5"
          >
            <span class="hud-mono-num w-16 text-2xs text-base-500 dark:text-base-400">
              {{ bar.code }}
            </span>
            <div class="relative h-2.5 flex-1 border border-base-200 bg-base-50 dark:border-base-700 dark:bg-base-900">
              <div
                class="h-full bg-accent-500/70"
                :style="{ width: `${bar.pct}%` }"
              />
            </div>
            <span class="hud-mono-num w-10 text-right text-2xs text-base-600 dark:text-base-300">
              {{ bar.rate.toFixed(1) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </HudPanel>
</template>
