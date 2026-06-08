<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import HudPanel from './HudPanel.vue'
import HudStatusPill from './HudStatusPill.vue'

const currentQ = useQuery({
  queryKey: ['ops', 'current'],
  queryFn: api.orchestrator.current,
  refetchInterval: 2000,
})

const stages = computed(() => currentQ.data.value?.stages ?? [])

function ledClass(active: number, failedToday: number): string {
  if (active > 0) return 'hud-led hud-led-warn animate-pulse-led'
  if (failedToday > 0) return 'hud-led hud-led-crit'
  return 'hud-led hud-led-muted'
}

function stageTone(active: number, completed: number, failed: number): 'warn' | 'ok' | 'crit' | 'muted' {
  if (active > 0) return 'warn'
  if (failed > 0 && completed === 0) return 'crit'
  if (completed > 0) return 'ok'
  return 'muted'
}

function formatRelTime(ts: number | null): string {
  if (!ts) return 'belum ada'
  const tsMs = ts > 1e12 ? ts : ts * 1000
  const diff = (Date.now() - tsMs) / 1000
  if (diff < 1) return 'baru saja'
  if (diff < 60) return `${Math.floor(diff)}s lalu`
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`
  return `${Math.floor(diff / 3600)}j lalu`
}
</script>

<template>
  <HudPanel title="Sedang Berjalan" code="OPS-NOW">
    <template #actions>
      <span class="hud-mono-num text-2xs text-base-400 dark:text-base-500">PER STAGE</span>
    </template>

    <div class="flex flex-col divide-y divide-base-100 dark:divide-base-800">
      <div
        v-for="stage in stages"
        :key="stage.node"
        class="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span :class="ledClass(stage.active, stage.failed_today)" />
            <span class="hud-mono-num text-2xs text-base-400 dark:text-base-500">
              {{ stage.code }}
            </span>
            <span class="font-mono text-xs uppercase tracking-ops text-base-800 dark:text-base-100">
              {{ stage.label }}
            </span>
          </div>
          <HudStatusPill
            :tone="stageTone(stage.active, stage.completed_today, stage.failed_today)"
            :label="`${stage.active} AKTIF`"
            :pulse="stage.active > 0"
          />
        </div>

        <div
          v-if="stage.in_flight_label"
          class="ml-4 flex items-center gap-1.5 text-xs text-base-700 dark:text-base-200"
        >
          <FaIcon :icon="['fas', 'circle-notch']" class="animate-spin text-2xs text-warn-500" />
          <span class="font-medium">Lagi proses:</span>
          <span class="hud-mono-num truncate text-base-600 dark:text-base-300" :title="stage.in_flight_label">
            {{ stage.in_flight_label }}
          </span>
        </div>
        <div v-else class="ml-4 font-mono text-2xs text-base-400 dark:text-base-500">
          tidak ada item in-flight
        </div>

        <div class="ml-4 flex items-center gap-3 font-mono text-2xs text-base-500 dark:text-base-400">
          <span>
            Hari ini:
            <span class="hud-mono-num text-ok-600 dark:text-ok-400">
              {{ stage.completed_today }}
            </span>
            selesai
          </span>
          <span>
            <span class="hud-mono-num" :class="stage.failed_today > 0 ? 'text-crit-600 dark:text-crit-400' : ''">
              {{ stage.failed_today }}
            </span>
            gagal
          </span>
          <span class="ml-auto">
            event terakhir {{ formatRelTime(stage.last_event_at) }}
          </span>
        </div>
      </div>

      <div
        v-if="stages.length === 0"
        class="px-2 py-3 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500"
      >
        Memuat status stage...
      </div>
    </div>
  </HudPanel>
</template>
