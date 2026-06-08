<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import type { ErrorGroup } from '@/api/types'
import { explainFailure } from '@/composables/useFailureExplainer'
import HudPanel from './HudPanel.vue'
import HudStatusPill from './HudStatusPill.vue'

const summaryQ = useQuery({
  queryKey: ['ops', 'error-summary'],
  queryFn: () => api.orchestrator.errorSummary(5),
  refetchInterval: 8000,
})

const groups = computed(() => summaryQ.data.value?.groups ?? [])
const total = computed(() => summaryQ.data.value?.total ?? 0)

const expanded = reactive<Record<string, boolean>>({})

function toggle(category: string) {
  expanded[category] = !expanded[category]
}

function groupTone(group: ErrorGroup): 'crit' | 'warn' | 'muted' {
  const sev = explainFailure(group.category).severity
  if (sev === 'high') return 'crit'
  if (sev === 'medium') return 'warn'
  return 'muted'
}
</script>

<template>
  <HudPanel title="Inbox Error" code="OPS-ERR">
    <template #actions>
      <HudStatusPill
        :tone="total > 0 ? 'crit' : 'muted'"
        :label="`${total} REF`"
      />
      <span class="hud-mono-num text-2xs text-base-400 dark:text-base-500">REFRESH 8s</span>
    </template>

    <div class="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
      <div
        v-for="group in groups"
        :key="group.category"
        class="border border-base-200 bg-base-50 dark:border-base-700 dark:bg-base-900"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-accent-500/5 dark:hover:bg-accent-500/10"
          @click="toggle(group.category)"
        >
          <div class="flex flex-1 flex-col gap-0.5">
            <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
              {{ group.category }}
            </span>
            <span class="font-medium text-sm text-base-800 dark:text-base-100">
              {{ group.title }}
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <HudStatusPill :tone="groupTone(group)" :label="`${group.count}`" />
            <FaIcon
              :icon="['fas', expanded[group.category] ? 'minus' : 'plus']"
              class="text-2xs text-base-400 dark:text-base-500"
            />
          </div>
        </button>

        <div
          v-if="expanded[group.category]"
          class="border-t border-base-200 px-2.5 py-2 dark:border-base-700"
        >
          <div class="mb-2 flex flex-col gap-1.5">
            <div>
              <div class="font-mono text-[10px] uppercase tracking-ops text-base-400 dark:text-base-500">
                Penyebab
              </div>
              <p class="text-xs leading-relaxed text-base-700 dark:text-base-200">
                {{ group.cause }}
              </p>
            </div>
            <div>
              <div class="font-mono text-[10px] uppercase tracking-ops text-base-400 dark:text-base-500">
                Solusi
              </div>
              <p class="text-xs leading-relaxed text-base-700 dark:text-base-200">
                {{ group.remedy }}
              </p>
            </div>
          </div>

          <div v-if="group.samples.length > 0" class="border-t border-base-100 pt-2 dark:border-base-800">
            <div class="mb-1 font-mono text-[10px] uppercase tracking-ops text-base-400 dark:text-base-500">
              Contoh ({{ group.samples.length }})
            </div>
            <div class="flex flex-col gap-1">
              <div
                v-for="s in group.samples"
                :key="s.ref_id"
                class="flex items-center justify-between gap-1 border border-base-100 bg-white px-1.5 py-1 dark:border-base-800 dark:bg-base-950"
              >
                <span
                  class="hud-mono-num truncate text-[10px] text-base-700 dark:text-base-200"
                  :title="s.failure_reason"
                >
                  {{ s.name }}
                </span>
                <span class="hud-mono-num text-[10px] text-base-400 dark:text-base-500">
                  {{ s.expo_id ? s.expo_id.slice(0, 16) : '-' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="groups.length === 0"
        class="border border-base-200 bg-base-50 p-3 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:border-base-700 dark:bg-base-900 dark:text-base-500"
      >
        Tidak ada kesalahan tercatat
      </div>
    </div>
  </HudPanel>
</template>
