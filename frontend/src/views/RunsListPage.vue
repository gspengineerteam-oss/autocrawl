<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import PageHeader from '@/components/shell/PageHeader.vue'

const { data, isLoading } = useQuery({
  queryKey: ['runs'],
  queryFn: () => api.runs(50),
  refetchInterval: 5000,
  refetchOnWindowFocus: true,
})

const modeStats = useQuery({
  queryKey: ['stats', 'runs-mode'],
  queryFn: () => api.stats.runsMode(30),
})

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? items.value.length)
const activeCount = computed(() => items.value.filter((r) => !r.finished_at).length)
const failedCount = computed(() => items.value.filter((r) => r.failures > 0).length)

function formatDuration(started: string, finished: string | null | undefined): string {
  if (!finished) return 'JALAN'
  const ms = new Date(finished).getTime() - new Date(started).getTime()
  if (ms < 0) return '—'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })
}

function runStatus(r: { finished_at?: string | null; failures: number }): { tone: string; label: string; pulse: boolean } {
  if (!r.finished_at) return { tone: 'amber', label: 'JALAN', pulse: true }
  if (r.failures > 0) return { tone: 'crit',  label: 'GAGAL', pulse: false }
  return { tone: 'ok', label: 'OK', pulse: false }
}

function modeColor(mode: string): string {
  if (mode === 'aggressive') return 'crit'
  if (mode === 'normal') return 'amber'
  if (mode === 'dev') return 'mute'
  return 'mute'
}

const stats = computed(() => [
  { label: 'Total', value: total.value, tone: 'amber' as const },
  { label: 'Aktif', value: activeCount.value, tone: activeCount.value > 0 ? 'amber' as const : 'mute' as const },
  { label: 'Gagal', value: failedCount.value, tone: failedCount.value > 0 ? 'crit' as const : 'mute' as const },
])

/* Mode breakdown bars (real /stats/runs-mode data) */
const modeBars = computed(() => {
  const rows = modeStats.data.value ?? []
  const total = rows.reduce((s, r) => s + (r.count ?? 0), 0) || 1
  return rows.map((r) => ({
    mode: r.mode,
    count: r.count ?? 0,
    pct: ((r.count ?? 0) / total) * 100,
    color: modeColor(r.mode),
  }))
})
</script>

<template>
  <div class="flex flex-col">
    <PageHeader
      title="Operation Ledger"
      subtitle="Riwayat operasi crawl — tiap baris adalah satu run lengkap dengan jejaknya"
      :stats="stats"
    />

    <!-- Mode breakdown strip - inline above table -->
    <div class="rule-b bg-bg px-6 py-4">
      <div class="flex items-baseline justify-between mb-2.5">
        <span class="label">Distribusi Mode · 30D</span>
        <span class="label label-mute">{{ modeStats.data.value?.length ?? 0 }} mode</span>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex-1 h-[6px] rounded-[2px] overflow-hidden bg-surface-2 flex">
          <div
            v-for="b in modeBars"
            :key="b.mode"
            class="h-full"
            :class="`bg-${b.color === 'mute' ? 'ink-mute' : b.color}`"
            :style="{ width: `${b.pct}%` }"
          />
        </div>
        <div class="flex items-center gap-3">
          <div v-for="b in modeBars" :key="b.mode" class="flex items-center gap-1.5">
            <span class="dot" :class="`dot-${b.color}`"></span>
            <span class="label" style="text-transform: uppercase">{{ b.mode }}</span>
            <span class="num-display text-[12px] font-semibold tabular-nums">{{ b.count }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Live indicator strip -->
    <div class="rule-b bg-bg flex items-center px-6 py-2.5">
      <span class="label">Riwayat 50 Operasi Terakhir</span>
      <span v-if="isLoading" class="ml-auto label label-amber flex items-center gap-1.5">
        <span class="dot dot-amber pulse-amber"></span>Memuat…
      </span>
      <span v-else class="ml-auto label label-mute">Live · 5s</span>
    </div>

    <!-- Ledger table -->
    <div class="flex-1 overflow-auto">
      <table v-if="items.length > 0" class="ledger w-full">
        <thead>
          <tr>
            <th class="w-[8%]">Status</th>
            <th class="w-[20%]">Run ID</th>
            <th class="w-[10%]">Mode</th>
            <th class="w-[18%]">Mulai</th>
            <th class="w-[10%] text-right">Durasi</th>
            <th class="w-[8%] text-right">Ekspo</th>
            <th class="w-[10%] text-right">Vendor</th>
            <th class="w-[8%] text-right">Gagal</th>
            <th class="w-[8%] text-right">Token</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.run_id">
            <td>
              <span class="pill" :class="`pill-${runStatus(row).tone}`">
                <span v-if="runStatus(row).pulse" class="dot pulse-amber" :class="`dot-${runStatus(row).tone}`"></span>
                {{ runStatus(row).label }}
              </span>
            </td>
            <td>
              <span class="num-display text-[11.5px] text-ink-2">
                {{ row.run_id.slice(0, 24) }}
              </span>
            </td>
            <td>
              <span class="pill" :class="`pill-${modeColor(row.mode) === 'mute' ? '' : modeColor(row.mode)}`" style="opacity: 0.85">
                {{ row.mode.toUpperCase() }}
              </span>
            </td>
            <td>
              <span class="num-display text-[12px]">{{ formatDate(row.started_at) }}</span>
            </td>
            <td class="text-right">
              <span class="num-display text-[12px]">{{ formatDuration(row.started_at, row.finished_at) }}</span>
            </td>
            <td class="text-right">
              <span class="num-display text-[13px]">{{ row.expos_discovered }}</span>
            </td>
            <td class="text-right">
              <span class="num-display num-amber text-[14px] font-semibold">{{ row.vendors_enriched }}</span>
            </td>
            <td class="text-right">
              <span class="num-display text-[13px]" :class="row.failures > 0 ? 'text-crit font-semibold' : 'text-ink-mute'">
                {{ row.failures }}
              </span>
            </td>
            <td class="text-right">
              <span class="num-display text-[11.5px] text-ink-mute">
                {{ row.openai_tokens_used ? Math.round(row.openai_tokens_used / 1000) + 'k' : '—' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
        <FaIcon :icon="['fas', 'clock-rotate-left']" class="text-[28px] text-ink-mute" />
        <span class="label label-mute">Belum ada operasi tercatat</span>
        <span class="text-[12px] text-ink-mute">Trigger ENGAGE di topbar untuk meluncurkan run pertama</span>
      </div>
    </div>
  </div>
</template>
