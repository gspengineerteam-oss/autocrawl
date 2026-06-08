<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import { useNumberTicker } from '@/composables/useNumberTicker'

/**
 * LivingSystemPanel — operator-console widget that surfaces the
 * orchestrator's real-time pulse on top of the map.
 *
 * REAL DATA ONLY. Every field comes from a backend endpoint:
 *   - active workers, vendors/min, errors/min, by_node breakdown
 *     ← /orchestrator/throughput  (poll 3s)
 *   - active_run.mode + status, current stage in-flight labels
 *     ← /orchestrator/current     (poll 3s)
 *   - events_observed total
 *     ← /orchestrator/state       (poll 5s)
 *
 * No synthesized commentary. Only raw labeled metrics.
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
const state = useQuery({
  queryKey: ['orchestrator', 'state'],
  queryFn: api.orchestrator.state,
  refetchInterval: 5000,
})

const tp = computed(() => throughput.data.value)
const cur = computed(() => current.data.value)
const st = computed(() => state.data.value)

const workers = computed(() => tp.value?.active_workers_total ?? 0)
const vpm = computed(() => Math.round((tp.value?.vendors_per_minute ?? 0) * 10) / 10)
const epm = computed(() => Math.round((tp.value?.events_per_minute ?? 0) * 10) / 10)
const errpm = computed(() => Math.round((tp.value?.errors_per_minute ?? 0) * 10) / 10)
const eventsObserved = computed(() => st.value?.events_observed ?? 0)

const tickedWorkers = useNumberTicker(workers, { duration: 240 })
const tickedEvents = useNumberTicker(eventsObserved, { duration: 360 })

const activeStages = computed(() => {
  const stages = cur.value?.stages ?? []
  return stages.filter((s) => s.active > 0 || s.in_flight_label)
})

const runMode = computed(() => cur.value?.active_run?.mode ?? null)
const runDuration = computed(() => {
  const sec = cur.value?.active_run?.duration_seconds ?? 0
  if (!sec) return null
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0 ? `${h}j ${m}m` : m > 0 ? `${m}m ${s}d` : `${s}d`
})

const isLive = computed(() => Boolean(cur.value?.active_run))
</script>

<template>
  <article class="lsp card bg-paper/92 backdrop-blur-md p-3.5 w-[256px]">
    <header class="flex items-baseline justify-between">
      <div class="flex items-center gap-2">
        <span
          class="dot"
          :class="isLive ? 'dot-vermilion ink-blink' : 'dot-accent'"
        />
        <span class="label">Sistem · {{ isLive ? 'Live' : 'Tenang' }}</span>
      </div>
      <span v-if="runMode" class="label-mono text-[0.625rem]">{{ runMode.toUpperCase() }}</span>
    </header>

    <!-- Real-time numerics — driven entirely by /orchestrator/throughput -->
    <dl class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
      <div>
        <dt class="label block">Worker</dt>
        <dd class="num-display text-[1.5rem] leading-none">{{ tickedWorkers }}</dd>
      </div>
      <div>
        <dt class="label block">Vendor/m</dt>
        <dd class="num-display text-[1.5rem] leading-none">{{ vpm }}</dd>
      </div>
      <div>
        <dt class="label block">Event/m</dt>
        <dd class="num-display text-[1rem] leading-none">{{ epm }}</dd>
      </div>
      <div>
        <dt class="label block">Galat/m</dt>
        <dd
          class="num-display text-[1rem] leading-none"
          :class="errpm > 0 ? 'text-vermilion' : ''"
        >
          {{ errpm }}
        </dd>
      </div>
    </dl>

    <!-- Active stages, in-flight labels — what is actually happening RIGHT NOW -->
    <div v-if="activeStages.length > 0" class="rule-t mt-3 pt-2.5">
      <span class="label block mb-1.5">In-flight</span>
      <ul class="space-y-1">
        <li
          v-for="stage in activeStages.slice(0, 3)"
          :key="stage.code"
          class="flex items-baseline gap-2"
        >
          <span class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-mute w-7 shrink-0">
            {{ stage.code }}
          </span>
          <span class="num-display text-[0.875rem] w-5 shrink-0">{{ stage.active }}</span>
          <span
            v-if="stage.in_flight_label"
            class="text-[0.75rem] text-ink-2 truncate"
            :title="stage.in_flight_label"
          >
            {{ stage.in_flight_label }}
          </span>
          <span v-else class="text-[0.75rem] text-ink-mute">{{ stage.label }}</span>
        </li>
      </ul>
    </div>

    <!-- Provenance + run timer -->
    <div class="rule-t mt-3 pt-2 flex items-center justify-between">
      <span class="label-mono text-[0.625rem]">{{ tickedEvents.toLocaleString() }} event</span>
      <span v-if="runDuration" class="label-mono text-[0.625rem]">{{ runDuration }}</span>
      <span v-else class="label-mono text-[0.625rem]">—</span>
    </div>
  </article>
</template>

<style scoped>
.lsp { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.06); }
</style>
