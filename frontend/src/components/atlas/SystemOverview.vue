<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'

/**
 * System Overview - real-time orchestrator pulse rendered as
 * progress bars + mini stats. All from /orchestrator/* endpoints.
 */

const throughput = useQuery({
  queryKey: ['orchestrator', 'throughput'],
  queryFn: () => api.orchestrator.throughput(60),
  refetchInterval: 3000,
})
const current = useQuery({
  queryKey: ['orchestrator', 'current'],
  queryFn: api.orchestrator.current,
  refetchInterval: 3000,
})
const health = useQuery({
  queryKey: ['health'],
  queryFn: api.health,
  refetchInterval: 10000,
})

const tp = computed(() => throughput.data.value)
const cur = computed(() => current.data.value)
const hp = computed(() => health.data.value)

const isLive = computed(() => Boolean(cur.value?.active_run))
const runMode = computed(() => cur.value?.active_run?.mode ?? null)

const workers = computed(() => tp.value?.active_workers_total ?? 0)
const vpm = computed(() => Math.round((tp.value?.vendors_per_minute ?? 0) * 10) / 10)
const errpm = computed(() => Math.round((tp.value?.errors_per_minute ?? 0) * 10) / 10)

/* Health → progress percent (just a reading, not real percent) */
const healthPct = computed(() => {
  if (!hp.value) return 0
  if (hp.value.status === 'ok' && hp.value.db === 'ok') return 100
  if (hp.value.db === 'down') return 25
  return 60
})

/* Worker saturation: assume max 8 concurrent typical operating capacity */
const workerPct = computed(() => Math.min(100, (workers.value / 8) * 100))

/* Throughput bar: 5 vendors/min as "max" visual reference */
const throughputPct = computed(() => Math.min(100, (vpm.value / 5) * 100))
</script>

<template>
  <article class="card overflow-hidden">
    <div class="card-head">
      <div class="flex items-center gap-2">
        <span class="dot dot-glow" :class="isLive ? 'dot-amber pulse-amber' : 'dot-cyan'"></span>
        <span class="label">System</span>
      </div>
      <span v-if="runMode" class="pill pill-amber">{{ runMode.toUpperCase() }}</span>
      <span v-else class="label label-mute">IDLE</span>
    </div>

    <div class="card-body space-y-3.5">
      <!-- Worker saturation -->
      <div>
        <div class="flex items-baseline justify-between mb-1">
          <span class="label">Worker Saturation</span>
          <div class="flex items-baseline gap-1">
            <span class="num-display text-[13px]">{{ workers }}</span>
            <span class="label label-mute">/8</span>
          </div>
        </div>
        <div class="h-[5px] bg-surface-2 rounded-[2px] overflow-hidden">
          <div
            class="h-full bg-amber rounded-[2px] transition-[width] duration-500"
            :style="{ width: `${workerPct}%` }"
          />
        </div>
      </div>

      <!-- Throughput -->
      <div>
        <div class="flex items-baseline justify-between mb-1">
          <span class="label">Throughput</span>
          <div class="flex items-baseline gap-1">
            <span class="num-display text-[13px]">{{ vpm }}</span>
            <span class="label label-mute">v/m</span>
          </div>
        </div>
        <div class="h-[5px] bg-surface-2 rounded-[2px] overflow-hidden">
          <div
            class="h-full rounded-[2px] transition-[width] duration-500"
            :class="vpm > 0 ? 'bg-amber' : 'bg-ink-mute'"
            :style="{ width: `${throughputPct}%` }"
          />
        </div>
      </div>

      <!-- Error rate -->
      <div>
        <div class="flex items-baseline justify-between mb-1">
          <span class="label">Error Rate</span>
          <div class="flex items-baseline gap-1">
            <span class="num-display text-[13px]" :class="errpm > 0 ? 'text-crit' : ''">{{ errpm }}</span>
            <span class="label label-mute">e/m</span>
          </div>
        </div>
        <div class="h-[5px] bg-surface-2 rounded-[2px] overflow-hidden">
          <div
            class="h-full rounded-[2px] transition-[width] duration-500"
            :style="{ width: `${Math.min(100, errpm * 20)}%`, background: errpm > 0 ? 'rgb(240 68 56)' : 'rgb(92 100 120)' }"
          />
        </div>
      </div>

      <!-- API health -->
      <div class="rule-t pt-3">
        <div class="flex items-baseline justify-between mb-1">
          <span class="label">API Health</span>
          <span class="label" :class="healthPct === 100 ? 'text-ok' : healthPct < 50 ? 'text-crit' : 'text-warn'">
            {{ hp?.status?.toUpperCase() ?? '—' }}
          </span>
        </div>
        <div class="h-[5px] bg-surface-2 rounded-[2px] overflow-hidden">
          <div
            class="h-full rounded-[2px] transition-[width] duration-500"
            :style="{ width: `${healthPct}%`, background: healthPct === 100 ? 'rgb(34 197 94)' : healthPct < 50 ? 'rgb(240 68 56)' : 'rgb(245 158 11)' }"
          />
        </div>
      </div>
    </div>
  </article>
</template>
