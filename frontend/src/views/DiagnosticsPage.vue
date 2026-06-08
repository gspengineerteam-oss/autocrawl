<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import HudPanel from '@/components/HudPanel.vue'
import HudStatusPill from '@/components/HudStatusPill.vue'
import HudUptime from '@/components/HudUptime.vue'
import HudCompletenessBar from '@/components/HudCompletenessBar.vue'
import HudEmptyState from '@/components/HudEmptyState.vue'
import Phase2GaugeChart from '@/components/charts/Phase2GaugeChart.vue'
import { useApiHealth } from '@/composables/useApiHealth'

const { status, dbStatus, query: healthQuery } = useApiHealth()

const settingsQ = useQuery({
  queryKey: ['settings'],
  queryFn: api.settings,
  retry: 1,
  refetchInterval: 60000,
})

const overviewQ = useQuery({
  queryKey: ['overview'],
  queryFn: api.overview,
  refetchInterval: 30000,
})

const runsQ = useQuery({
  queryKey: ['runs', 'diag'],
  queryFn: () => api.runs(20),
  refetchInterval: 30000,
})

const apiTone = computed<'ok' | 'warn' | 'crit'>(() => {
  if (status.value === 'down') return 'crit'
  if (status.value === 'degraded' || status.value === 'unknown') return 'warn'
  return 'ok'
})

const dbTone = computed<'ok' | 'warn' | 'crit'>(() => {
  if (dbStatus.value === 'down') return 'crit'
  if (dbStatus.value === 'unknown') return 'warn'
  return 'ok'
})

const apiVersion = computed(() => healthQuery.data.value?.version ?? 'N/A')

const phaseProgress = computed(() => {
  const o = overviewQ.data.value
  if (!o || !o.phase_2_threshold) return 0
  return Math.round((o.vendors_total / o.phase_2_threshold) * 100)
})

const phaseRemaining = computed(() => {
  const o = overviewQ.data.value
  if (!o) return 0
  return Math.max(0, o.phase_2_threshold - o.vendors_total)
})

const totalFailures = computed(() => {
  const items = runsQ.data.value?.items ?? []
  return items.reduce((sum, r) => sum + (r.failures ?? 0), 0)
})

const totalTokens = computed(() => {
  const items = runsQ.data.value?.items ?? []
  return items.reduce((sum, r) => sum + (r.openai_tokens_used ?? 0), 0)
})

const totalCredits = computed(() => {
  const items = runsQ.data.value?.items ?? []
  return items.reduce((sum, r) => sum + (r.firecrawl_credits_used ?? 0), 0)
})

const successRate = computed(() => {
  const items = runsQ.data.value?.items ?? []
  if (items.length === 0) return 0
  const ok = items.filter((r) => Boolean(r.finished_at) && r.failures === 0).length
  return ok / items.length
})

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <span class="font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500">
        OPS-06 / DIAGNOSTIK SISTEM
      </span>
      <HudStatusPill
        :tone="apiTone === 'ok' && dbTone === 'ok' ? 'ok' : 'crit'"
        :label="apiTone === 'ok' && dbTone === 'ok' ? 'SEMUA HIJAU' : 'PERHATIAN'"
        :pulse="true"
      />
    </div>

    <section class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <HudPanel title="Status API" code="DIAG-API">
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
              FASTAPI
            </span>
            <HudStatusPill
              :tone="apiTone"
              :label="apiTone === 'ok' ? 'ONLINE' : apiTone === 'warn' ? 'CHECK' : 'OFFLINE'"
              :pulse="apiTone === 'ok'"
            />
          </div>
          <div class="flex items-center justify-between">
            <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
              POSTGRES
            </span>
            <HudStatusPill
              :tone="dbTone"
              :label="dbTone === 'ok' ? 'ONLINE' : dbTone === 'warn' ? 'CHECK' : 'OFFLINE'"
              :pulse="dbTone === 'ok'"
            />
          </div>
          <div class="flex items-center justify-between">
            <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
              VERSI
            </span>
            <span class="hud-mono-num text-2xs">{{ apiVersion }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
              UPTIME
            </span>
            <HudUptime label="" />
          </div>
        </div>
      </HudPanel>

      <HudPanel title="Phase 2 Status" code="DIAG-PH2">
        <Phase2GaugeChart
          :current="overviewQ.data.value?.vendors_total ?? 0"
          :threshold="overviewQ.data.value?.phase_2_threshold ?? 100"
          :loading="overviewQ.isLoading.value"
        />
        <div class="mt-2 flex flex-col gap-1">
          <div class="flex items-center justify-between font-mono text-2xs uppercase tracking-ops">
            <span class="text-base-500 dark:text-base-400">PROGRESS</span>
            <span
              class="hud-mono-num"
              :class="phaseProgress >= 75 ? 'text-ok-600 dark:text-ok-400' : phaseProgress >= 40 ? 'text-warn-600 dark:text-warn-400' : 'text-crit-600 dark:text-crit-400'"
            >
              {{ phaseProgress }}%
            </span>
          </div>
          <div class="flex items-center justify-between font-mono text-2xs uppercase tracking-ops">
            <span class="text-base-500 dark:text-base-400">SISA</span>
            <span class="hud-mono-num">{{ phaseRemaining }} VENDOR</span>
          </div>
        </div>
      </HudPanel>

      <HudPanel title="Statistik 20 Operasi" code="DIAG-OPS">
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between font-mono text-2xs uppercase tracking-ops">
              <span class="text-base-500 dark:text-base-400">SUCCESS RATE</span>
              <span class="hud-mono-num text-base-800 dark:text-base-100">
                {{ Math.round(successRate * 100) }}%
              </span>
            </div>
            <HudCompletenessBar :score="successRate" />
          </div>
          <div class="flex items-center justify-between font-mono text-2xs uppercase tracking-ops">
            <span class="text-base-500 dark:text-base-400">TOTAL GAGAL</span>
            <span
              class="hud-mono-num"
              :class="totalFailures > 0 ? 'text-crit-600 dark:text-crit-400' : 'text-ok-600 dark:text-ok-400'"
            >
              {{ totalFailures }}
            </span>
          </div>
          <div class="flex items-center justify-between font-mono text-2xs uppercase tracking-ops">
            <span class="text-base-500 dark:text-base-400">TOKEN OPENAI</span>
            <span class="hud-mono-num">{{ formatNumber(totalTokens) }}</span>
          </div>
          <div class="flex items-center justify-between font-mono text-2xs uppercase tracking-ops">
            <span class="text-base-500 dark:text-base-400">FIRECRAWL CREDIT</span>
            <span class="hud-mono-num">{{ formatNumber(totalCredits) }}</span>
          </div>
        </div>
      </HudPanel>
    </section>

    <HudPanel title="Konfigurasi Runtime" code="DIAG-CFG">
      <template #actions>
        <HudStatusPill
          :tone="settingsQ.isError.value ? 'crit' : 'ok'"
          :label="settingsQ.isError.value ? 'GAGAL FETCH' : 'TERSEDIA'"
        />
      </template>

      <div v-if="settingsQ.data.value" class="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="(value, key) in settingsQ.data.value"
          :key="key"
          class="flex items-center justify-between border-b border-base-100 py-1.5 dark:border-base-800"
        >
          <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
            {{ String(key).replace(/_/g, ' ') }}
          </span>
          <span
            class="hud-mono-num truncate text-2xs"
            :class="
              typeof value === 'boolean'
                ? value
                  ? 'text-ok-600 dark:text-ok-400'
                  : 'text-base-400 dark:text-base-500'
                : 'text-base-800 dark:text-base-100'
            "
          >
            <template v-if="typeof value === 'boolean'">{{ value ? 'AKTIF' : 'NONAKTIF' }}</template>
            <template v-else-if="value === null">N/A</template>
            <template v-else>{{ value }}</template>
          </span>
        </div>
      </div>

      <HudEmptyState
        v-else-if="settingsQ.isError.value"
        icon="circle-xmark"
        title="Endpoint settings tidak tersedia"
        hint="Backend belum mengekspos GET /api/settings, atau request gagal. Cek log API container."
      />

      <HudEmptyState
        v-else
        icon="circle-notch"
        title="Memuat konfigurasi"
      />
    </HudPanel>

    <HudPanel title="Audit Operasi Terbaru" code="DIAG-AUDIT">
      <div v-if="(runsQ.data.value?.items ?? []).length === 0">
        <HudEmptyState
          icon="clock-rotate-left"
          title="Belum ada operasi"
          hint="Trigger ENGAGE di topbar untuk meluncurkan operasi crawl pertama."
        />
      </div>
      <div v-else class="overflow-x-auto">
        <table class="hud-table">
          <thead>
            <tr>
              <th class="w-[8%]">Status</th>
              <th class="w-[28%]">Run ID</th>
              <th class="w-[18%]">Mulai</th>
              <th class="w-[10%] text-right">Vendor</th>
              <th class="w-[10%] text-right">Gagal</th>
              <th class="w-[13%] text-right">Token</th>
              <th class="w-[13%] text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in runsQ.data.value?.items ?? []" :key="r.run_id">
              <td>
                <HudStatusPill
                  :tone="!r.finished_at ? 'warn' : r.failures > 0 ? 'crit' : 'ok'"
                  :label="!r.finished_at ? 'JALAN' : r.failures > 0 ? 'GAGAL' : 'OK'"
                  :pulse="!r.finished_at"
                />
              </td>
              <td>
                <span class="hud-mono-num text-2xs">{{ r.run_id.slice(0, 36) }}</span>
              </td>
              <td>
                <span class="hud-mono-num text-2xs">
                  {{ new Date(r.started_at).toLocaleString('id-ID') }}
                </span>
              </td>
              <td class="text-right">
                <span class="hud-mono-num text-xs font-semibold text-accent-600 dark:text-accent-300">
                  {{ r.vendors_enriched }}
                </span>
              </td>
              <td class="text-right">
                <span
                  class="hud-mono-num text-xs"
                  :class="r.failures > 0 ? 'text-crit-600 dark:text-crit-400' : 'text-base-400 dark:text-base-500'"
                >
                  {{ r.failures }}
                </span>
              </td>
              <td class="text-right">
                <span class="hud-mono-num text-2xs text-base-500 dark:text-base-400">
                  {{ r.openai_tokens_used ? formatNumber(r.openai_tokens_used) : '-' }}
                </span>
              </td>
              <td class="text-right">
                <span class="hud-mono-num text-2xs text-base-500 dark:text-base-400">
                  {{ r.firecrawl_credits_used ?? '-' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </HudPanel>
  </div>
</template>
