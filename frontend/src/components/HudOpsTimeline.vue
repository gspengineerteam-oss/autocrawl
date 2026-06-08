<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import type { CrawlEvent } from '@/api/types'
import { humanizeEvent } from '@/composables/useEventHumanizer'
import HudPanel from './HudPanel.vue'
import HudStatusPill from './HudStatusPill.vue'

const MAX_EVENTS = 200

const since = ref('0')
const events = ref<CrawlEvent[]>([])

const eventsQ = useQuery({
  queryKey: ['ops', 'timeline', since],
  queryFn: () => api.orchestrator.events(since.value, 50),
  refetchInterval: 1500,
})

watch(
  () => eventsQ.data.value,
  (resp) => {
    if (!resp) return
    if (resp.events.length > 0) {
      events.value = [...resp.events.slice().reverse(), ...events.value].slice(0, MAX_EVENTS)
      since.value = resp.next_since
    }
  },
)

const rendered = computed(() =>
  events.value.map((ev) => ({
    raw: ev,
    h: humanizeEvent(ev),
  })),
)

function formatRelTime(ts: number): string {
  const tsMs = ts > 1e12 ? ts : ts * 1000
  const diff = (Date.now() - tsMs) / 1000
  if (diff < 1) return 'baru saja'
  if (diff < 60) return `${Math.floor(diff)}s lalu`
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`
  return `${Math.floor(diff / 3600)}j lalu`
}

function payloadJson(ev: CrawlEvent): string {
  try {
    return JSON.stringify(ev.payload, null, 2)
  } catch {
    return String(ev.payload)
  }
}
</script>

<template>
  <HudPanel title="Aktivitas Live" code="OPS-FEED">
    <template #actions>
      <HudStatusPill tone="accent" :label="`${events.length} EVENT`" />
      <span class="hud-mono-num text-2xs text-base-400 dark:text-base-500">POLL 1.5s</span>
    </template>

    <div class="flex max-h-[560px] flex-col divide-y divide-base-100 overflow-y-auto pr-1 dark:divide-base-800">
      <div
        v-for="row in rendered"
        :key="row.raw.id"
        class="flex items-start gap-2 py-1.5 first:pt-0"
        :title="payloadJson(row.raw)"
      >
        <FaIcon
          :icon="['fas', row.h.icon]"
          class="mt-0.5 text-2xs"
          :class="{
            'text-ok-500': row.h.tone === 'ok',
            'text-warn-500': row.h.tone === 'warn',
            'text-crit-500': row.h.tone === 'crit',
            'text-info-500': row.h.tone === 'info',
            'text-base-400 dark:text-base-500': row.h.tone === 'muted',
          }"
        />
        <div class="flex flex-1 flex-col gap-0.5">
          <p class="text-xs leading-snug text-base-800 dark:text-base-100">
            {{ row.h.text }}
          </p>
          <span class="hud-mono-num text-[10px] text-base-400 dark:text-base-500">
            {{ row.raw.node }} / {{ row.raw.event }} · {{ formatRelTime(row.raw.ts) }}
          </span>
        </div>
      </div>

      <div
        v-if="events.length === 0"
        class="border border-base-200 bg-base-50 p-4 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:border-base-700 dark:bg-base-900 dark:text-base-500"
      >
        Menunggu event. Trigger ENGAGE dari topbar untuk mulai.
      </div>
    </div>
  </HudPanel>
</template>
