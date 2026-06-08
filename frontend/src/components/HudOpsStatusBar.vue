<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import HudPanel from './HudPanel.vue'
import HudStatusPill from './HudStatusPill.vue'
import HudCompletenessBar from './HudCompletenessBar.vue'

const currentQ = useQuery({
  queryKey: ['ops', 'current'],
  queryFn: api.orchestrator.current,
  refetchInterval: 2000,
})

const overviewQ = useQuery({
  queryKey: ['overview'],
  queryFn: api.overview,
  refetchInterval: 5000,
})

const refsQ = useQuery({
  queryKey: ['exhibitor-refs', 'stats'],
  queryFn: api.exhibitorRefs.stats,
  refetchInterval: 5000,
})

const isRunning = computed(() => Boolean(currentQ.data.value?.active_run))
const runMode = computed(() => currentQ.data.value?.active_run?.mode?.toUpperCase() ?? 'IDLE')
const runDuration = computed(() => {
  const sec = currentQ.data.value?.active_run?.duration_seconds ?? 0
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const phase2Pct = computed(() => overviewQ.data.value?.phase_2_progress_ratio ?? 0)
const phase2Threshold = computed(() => overviewQ.data.value?.phase_2_threshold ?? 100)
const enrichedNow = computed(() => Math.round(phase2Pct.value * phase2Threshold.value))

const counters = computed(() => ({
  vendor: overviewQ.data.value?.vendors_total ?? 0,
  ekspo: overviewQ.data.value?.expos_total ?? 0,
  pdf: overviewQ.data.value?.pdfs_total ?? 0,
  refs: refsQ.data.value?.total ?? 0,
}))

function modeTone(m: string): 'crit' | 'accent' | 'info' | 'muted' {
  if (m === 'AGGRESSIVE') return 'crit'
  if (m === 'NORMAL') return 'accent'
  if (m === 'DEV') return 'info'
  return 'muted'
}
</script>

<template>
  <HudPanel title="Status Operasi" code="OPS-STATUS">
    <template #actions>
      <span class="hud-mono-num text-2xs text-base-400 dark:text-base-500">LIVE 2s</span>
    </template>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div class="flex flex-col gap-2 border-r-0 pr-0 md:border-r md:border-base-200 md:pr-3 md:dark:border-base-700">
        <div class="flex items-center justify-between">
          <span class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">RUN</span>
          <HudStatusPill
            :tone="isRunning ? 'warn' : 'muted'"
            :label="isRunning ? 'OPS BERJALAN' : 'IDLE'"
            :pulse="isRunning"
          />
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <span class="hud-mono-num text-base font-semibold text-base-800 dark:text-base-100">
            {{ runDuration }}
          </span>
          <HudStatusPill :tone="modeTone(runMode)" :label="runMode" />
        </div>
        <span
          v-if="currentQ.data.value?.active_run"
          class="hud-mono-num truncate text-2xs text-base-400 dark:text-base-500"
          :title="currentQ.data.value.active_run.started_at"
        >
          mulai {{ currentQ.data.value.active_run.started_at.slice(11, 19) }} UTC
        </span>
        <span v-else class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">
          tidak ada run aktif
        </span>
      </div>

      <div class="flex flex-col gap-2 border-r-0 pr-0 md:border-r md:border-base-200 md:pr-3 md:dark:border-base-700">
        <div class="flex items-center justify-between">
          <span class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">PHASE 2</span>
          <span class="hud-mono-num text-2xs text-base-600 dark:text-base-300">
            {{ enrichedNow }} / {{ phase2Threshold }}
          </span>
        </div>
        <HudCompletenessBar :score="Math.min(1, phase2Pct)" show-label />
        <span class="font-mono text-2xs text-base-400 dark:text-base-500">
          target {{ phase2Threshold }} vendor enriched buat unlock paid tier
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <span class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">COUNTER</span>
        <div class="grid grid-cols-4 gap-2">
          <div class="flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900">
            <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">VND</span>
            <span class="hud-mono-num text-sm font-semibold text-accent-600 dark:text-accent-300">
              {{ counters.vendor }}
            </span>
          </div>
          <div class="flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900">
            <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">EXP</span>
            <span class="hud-mono-num text-sm font-semibold text-info-600 dark:text-info-400">
              {{ counters.ekspo }}
            </span>
          </div>
          <div class="flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900">
            <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">PDF</span>
            <span class="hud-mono-num text-sm font-semibold text-base-700 dark:text-base-200">
              {{ counters.pdf }}
            </span>
          </div>
          <div class="flex flex-col items-center border border-base-200 bg-base-50 px-1.5 py-1 dark:border-base-700 dark:bg-base-900">
            <span class="font-mono text-[9px] uppercase tracking-ops text-base-400 dark:text-base-500">REFS</span>
            <span class="hud-mono-num text-sm font-semibold text-warn-600 dark:text-warn-400">
              {{ counters.refs }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </HudPanel>
</template>
