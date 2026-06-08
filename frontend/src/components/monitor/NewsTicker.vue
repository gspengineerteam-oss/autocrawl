<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'

/**
 * Bloomberg-style horizontal scrolling ticker of recent orchestrator
 * events. Auto-scrolls left, pauses on hover. BREAKING tag (vermilion)
 * applied to events that match high-significance heuristics:
 *   - first vendor enriched in a country we hadn't seen before
 *   - PDF batch with 5+ vendors
 *   - failure events
 */

const events = useQuery({
  queryKey: ['orchestrator', 'events', 'ticker'],
  queryFn: () => api.orchestrator.events('0', 30),
  refetchInterval: 4000,
})

interface TickerItem {
  id: string
  ts: number
  event: string
  node: string
  label: string
  breaking: boolean
  tone: 'amber' | 'ok' | 'crit' | 'mute'
}

const items = computed<TickerItem[]>(() => {
  const list = events.data.value?.events ?? []
  return list.slice().reverse().map((ev) => {
    const p = (ev.payload || {}) as Record<string, unknown>
    const name = (p.vendor_name || p.expo_name || p.domain || p.name || ev.node) as string
    const isFail = ev.event === 'failed'
    const isCompleted = ev.event === 'completed'
    const breaking = isFail || (isCompleted && Boolean(p.is_first_in_country))
    const tone: TickerItem['tone'] = isFail ? 'crit' : isCompleted ? 'ok' : ev.event === 'started' ? 'amber' : 'mute'
    return {
      id: ev.id,
      ts: ev.ts < 1e12 ? ev.ts * 1000 : ev.ts,
      event: ev.event,
      node: ev.node,
      label: String(name),
      breaking,
      tone,
    }
  })
})

const paused = ref(false)

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}d`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}j`
}
</script>

<template>
  <div
    class="news-ticker rule-t bg-bg flex items-stretch h-9"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <!-- Static badge - sits OUTSIDE the scrolling clip so items can't bleed over it -->
    <div class="shrink-0 flex items-center gap-2 px-4 rule-r bg-amber relative z-10">
      <span class="dot dot-vermilion blink" style="background: #0A1525"></span>
      <span class="text-[10.5px] font-bold tracking-[0.18em] text-bg">LIVE FEED</span>
    </div>

    <!-- Scroll viewport - own overflow-hidden so the track translateX doesn't
         render items behind / on top of the LIVE FEED badge -->
    <div class="ticker-viewport flex-1 overflow-hidden relative">
      <div
        class="ticker-track flex items-center"
        :style="{ animationPlayState: paused ? 'paused' : 'running' }"
      >
        <template v-for="round in 2" :key="round">
          <div
            v-for="item in items"
            :key="`${round}-${item.id}`"
            class="ticker-item flex items-center gap-2 px-5 shrink-0"
          >
            <span
              v-if="item.breaking"
              class="px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.18em] text-bg bg-vermilion rounded-[2px]"
            >
              BREAKING
            </span>
            <span class="dot" :class="`dot-${item.tone}`"></span>
            <span class="num-display text-[10.5px] font-bold tracking-[0.16em] text-ink-2 uppercase">
              {{ item.event }}
            </span>
            <span class="text-[12.5px] text-ink truncate max-w-[280px]">{{ item.label }}</span>
            <span class="label label-mute">{{ item.node }}</span>
            <span class="num-display text-[10.5px] text-ink-mute tabular-nums">{{ timeAgo(item.ts) }}</span>
            <span class="text-ink-mute">·</span>
          </div>
        </template>
        <div v-if="items.length === 0" class="flex items-center px-5">
          <span class="label label-mute">Tiada event tercatat — agen sedang idle</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ticker-track {
  animation: ticker-scroll-rtl 60s linear infinite;
  white-space: nowrap;
  width: max-content;
}
@keyframes ticker-scroll-rtl {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.ticker-item { white-space: nowrap; }
</style>
