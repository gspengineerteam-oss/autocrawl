<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'

const industries = useQuery({
  queryKey: ['stats', 'industries'],
  queryFn: api.stats.industries,
  refetchInterval: 60_000,
})

interface Segment {
  tag: string
  count: number
  start: number
  end: number
  d: string
  color: string
}

const SIZE = 220
const cx = SIZE / 2
const cy = SIZE / 2
const rOuter = 90
const rInner = 64

function arc(startAngle: number, endAngle: number): string {
  const a0 = startAngle - Math.PI / 2
  const a1 = endAngle - Math.PI / 2
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  const x0 = cx + rOuter * Math.cos(a0)
  const y0 = cy + rOuter * Math.sin(a0)
  const x1 = cx + rOuter * Math.cos(a1)
  const y1 = cy + rOuter * Math.sin(a1)
  const xi1 = cx + rInner * Math.cos(a1)
  const yi1 = cy + rInner * Math.sin(a1)
  const xi0 = cx + rInner * Math.cos(a0)
  const yi0 = cy + rInner * Math.sin(a0)
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${large} 0 ${xi0} ${yi0} Z`
}

/* Amber-led palette with cool secondaries */
const palette = [
  'rgb(255, 184, 64)',
  'rgb(255, 146, 48)',
  'rgb(77, 216, 230)',
  'rgb(157, 165, 184)',
  'rgb(240, 232, 213)',
  'rgb(92, 100, 120)',
]

const segments = computed<Segment[]>(() => {
  const rows = (industries.data.value ?? []).slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
  const top = rows.slice(0, 8)
  const rest = rows.slice(5)
  const restSum = rest.reduce((s, r) => s + (r.count ?? 0), 0)
  const merged = restSum > 0 ? [...top, { tag: 'Lainnya', count: restSum }] : top
  const total = merged.reduce((s, r) => s + (r.count ?? 0), 0) || 1
  let acc = 0
  const out: Segment[] = []
  for (let i = 0; i < merged.length; i++) {
    const r = merged[i]
    const span = ((r.count ?? 0) / total) * Math.PI * 2
    const start = acc
    const end = acc + span - 0.018
    acc += span
    if (end > start) {
      out.push({
        tag: r.tag,
        count: r.count ?? 0,
        start, end,
        d: arc(start, end),
        color: palette[i % palette.length],
      })
    }
  }
  return out
})

const total = computed(() => segments.value.reduce((s, x) => s + x.count, 0))

function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`
  return n.toLocaleString()
}
</script>

<template>
  <article class="card overflow-hidden">
    <div class="card-head">
      <span class="label">Exhibitors by Industry</span>
      <span class="label label-mute">Top 5 + Lainnya</span>
    </div>
    <div class="card-body flex items-center gap-5">
      <div class="relative shrink-0">
        <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" :width="SIZE" :height="SIZE">
          <circle :cx="cx" :cy="cy" :r="rOuter" fill="none" stroke="rgb(240 232 213 / 0.04)" stroke-width="1"/>
          <circle :cx="cx" :cy="cy" :r="rInner" fill="none" stroke="rgb(240 232 213 / 0.04)" stroke-width="1"/>
          <path
            v-for="seg in segments"
            :key="seg.tag"
            :d="seg.d"
            :fill="seg.color"
            stroke="rgb(19 31 51)"
            stroke-width="1.5"
          >
            <title>{{ seg.tag }}: {{ seg.count.toLocaleString() }}</title>
          </path>
          <text :x="cx" :y="cy - 4" text-anchor="middle"
            font-family="Geist Mono Variable, monospace"
            font-size="32"
            font-weight="600"
            fill="rgb(255 184 64)"
            font-feature-settings="'tnum','zero'"
            style="letter-spacing:-0.02em">{{ fmtK(total) }}</text>
          <text :x="cx" :y="cy + 16" text-anchor="middle"
            font-family="Geist Variable, system-ui"
            font-size="9.5"
            font-weight="600"
            letter-spacing="0.18em"
            fill="rgb(157 165 184)">EXHIBITORS</text>
        </svg>
      </div>
      <ul class="flex-1 min-w-0 space-y-2">
        <li
          v-for="(seg) in segments"
          :key="seg.tag"
          class="grid grid-cols-[10px_1fr_auto] items-center gap-2.5"
        >
          <span class="block w-2.5 h-2.5 rounded-[2px]" :style="{ background: seg.color }"></span>
          <span class="text-[12.5px] text-ink-2 truncate">{{ seg.tag }}</span>
          <span class="num-display text-[12.5px]">{{ seg.count.toLocaleString() }}</span>
        </li>
      </ul>
    </div>
  </article>
</template>
