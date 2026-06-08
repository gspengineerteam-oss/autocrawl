<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'

/**
 * Pengayaan Vendor — vendor enrichment timeline.
 *
 *   - Range pills (30D / 60D / 90D) toggle the timeline window.
 *   - Above-chart metrics row: TOTAL, RATA-RATA, PUNCAK, TREN.
 *   - Hover crosshair: vertical line + dot + tooltip showing the
 *     exact day's count.
 *   - Stroke draws in via animated stroke-dashoffset on first mount
 *     and on each range change.
 *   - Subtle glow filter under the line.
 */

type Range = 30 | 60 | 90
const range = ref<Range>(90)

const timeline = useQuery({
  queryKey: computed(() => ['stats', 'timeline', range.value]),
  queryFn: () => api.stats.timeline(range.value),
  refetchInterval: 120_000,
})

const points = computed(() => timeline.data.value ?? [])

const stats = computed(() => {
  const ps = points.value
  if (ps.length === 0) return { total: 0, max: 0, avg: 0, growth: 0 }
  const total = ps.reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const max   = ps.reduce((m, p) => Math.max(m, p.vendors_added ?? 0), 0)
  const avg   = total / ps.length
  const half  = Math.floor(ps.length / 2)
  const earlySum = ps.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const lateSum  = ps.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const growth = earlySum === 0 ? (lateSum > 0 ? 100 : 0) : ((lateSum - earlySum) / earlySum) * 100
  return { total, max, avg, growth }
})

/* Draw geometry */
const W = 1200
const H = 200
const PAD_T = 16
const PAD_B = 32
const PAD_L = 12
const PAD_R = 12

const innerW = computed(() => W - PAD_L - PAD_R)
const innerH = computed(() => H - PAD_T - PAD_B)

const path = computed(() => {
  const ps = points.value
  if (ps.length === 0) return { line: '', area: '', dots: [] as Array<{ x: number; y: number; v: number }> }
  const max = Math.max(1, stats.value.max)
  const stepX = ps.length > 1 ? innerW.value / (ps.length - 1) : 0
  let line = ''
  const dots: Array<{ x: number; y: number; v: number }> = []
  for (let i = 0; i < ps.length; i++) {
    const x = PAD_L + i * stepX
    const v = ps[i].vendors_added ?? 0
    const y = PAD_T + innerH.value - (v / max) * innerH.value
    line += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`)
    dots.push({ x, y, v })
  }
  const area = `${line} L ${PAD_L + innerW.value} ${PAD_T + innerH.value} L ${PAD_L} ${PAD_T + innerH.value} Z`
  return { line, area, dots }
})

/* Path length for animated draw-in */
const linePathRef = ref<SVGPathElement | null>(null)
const animKey = computed(() => `${range.value}-${points.value.length}`)
function startDrawAnim() {
  const el = linePathRef.value
  if (!el) return
  // Schedule after DOM updates so getTotalLength is accurate
  requestAnimationFrame(() => {
    try {
      const len = el.getTotalLength()
      el.style.transition = 'none'
      el.style.strokeDasharray = `${len}`
      el.style.strokeDashoffset = `${len}`
      // force reflow
      el.getBoundingClientRect()
      el.style.transition = `stroke-dashoffset 1100ms cubic-bezier(0.20, 0.60, 0.20, 1)`
      el.style.strokeDashoffset = '0'
    } catch { /* ignore */ }
  })
}

/* Watch animKey + linePathRef to start animation */
watch([animKey, linePathRef], () => { startDrawAnim() }, { flush: 'post' })

/* Hover crosshair */
const hoverIdx = ref<number | null>(null)
const svgWrap = ref<HTMLDivElement | null>(null)

function onSvgMove(e: MouseEvent) {
  const wrap = svgWrap.value
  const ps = points.value
  if (!wrap || ps.length === 0) return
  const rect = wrap.getBoundingClientRect()
  const xPct = (e.clientX - rect.left) / rect.width
  // Convert to viewBox space x
  const vbX = xPct * W
  const innerX = vbX - PAD_L
  const stepX = ps.length > 1 ? innerW.value / (ps.length - 1) : innerW.value
  const idx = Math.max(0, Math.min(ps.length - 1, Math.round(innerX / stepX)))
  hoverIdx.value = idx
}
function onSvgLeave() { hoverIdx.value = null }

const hoverPoint = computed(() => {
  if (hoverIdx.value == null) return null
  const dot = path.value.dots[hoverIdx.value]
  if (!dot) return null
  const point = points.value[hoverIdx.value]
  return { ...dot, date: point?.date }
})

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
function fmtFullDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const axisTicks = computed(() => {
  const ps = points.value
  if (ps.length === 0) return [] as Array<{ x: number; label: string }>
  const ticks: Array<{ x: number; label: string }> = []
  const N = 4
  const stepX = ps.length > 1 ? innerW.value / (ps.length - 1) : 0
  for (let i = 0; i <= N; i++) {
    const idx = Math.floor((ps.length - 1) * (i / N))
    ticks.push({
      x: PAD_L + idx * stepX,
      label: fmtDate(ps[idx]?.date),
    })
  }
  return ticks
})

onBeforeUnmount(() => {
  // cleanup nothing — Vue handles refs
})
</script>

<template>
  <article class="card overflow-hidden">
    <div class="card-head">
      <div class="flex items-center gap-3">
        <span class="dot dot-amber dot-glow"></span>
        <span class="label label-amber">Pengayaan Vendor</span>
      </div>
      <!-- Range selector pills -->
      <div class="flex items-center gap-1">
        <button
          v-for="r in [30, 60, 90] as Range[]"
          :key="r"
          class="px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.10em] uppercase rounded-[4px] transition-colors"
          :class="range === r
            ? 'bg-amber text-bg'
            : 'text-ink-mute hover:text-ink hover:bg-surface-2'"
          @click="range = r"
        >
          {{ r }}D
        </button>
      </div>
    </div>

    <!-- Metrics row -->
    <div class="grid grid-cols-4 px-5 py-3 rule-b">
      <div>
        <div class="label label-mute">Total</div>
        <div class="num-display num-amber text-[20px] font-semibold mt-0.5">{{ stats.total.toLocaleString() }}</div>
      </div>
      <div class="rule-l pl-4">
        <div class="label label-mute">Rata-rata/hari</div>
        <div class="num-display text-[20px] font-semibold mt-0.5">{{ stats.avg.toFixed(1) }}</div>
      </div>
      <div class="rule-l pl-4">
        <div class="label label-mute">Puncak</div>
        <div class="num-display text-[20px] font-semibold mt-0.5">{{ stats.max.toLocaleString() }}</div>
      </div>
      <div class="rule-l pl-4">
        <div class="label label-mute">Tren</div>
        <div
          class="num-display text-[20px] font-semibold mt-0.5"
          :class="stats.growth >= 0 ? 'text-ok' : 'text-crit'"
        >
          {{ stats.growth >= 0 ? '+' : '' }}{{ stats.growth.toFixed(1) }}%
        </div>
      </div>
    </div>

    <!-- Chart area -->
    <div ref="svgWrap" class="px-3 pt-2 relative"
         @mousemove="onSvgMove"
         @mouseleave="onSvgLeave">
      <svg :viewBox="`0 0 ${W} ${H}`" class="w-full h-[200px] block" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgb(255 184 64)" stop-opacity="0.40"/>
            <stop offset="50%"  stop-color="rgb(255 184 64)" stop-opacity="0.14"/>
            <stop offset="100%" stop-color="rgb(255 184 64)" stop-opacity="0"/>
          </linearGradient>
          <filter id="tl-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="blurred"/>
            <feMerge>
              <feMergeNode in="blurred"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Horizontal grid lines -->
        <g>
          <line :x1="PAD_L" :x2="W - PAD_R" :y1="PAD_T" :y2="PAD_T"
                stroke="rgb(240 232 213)" stroke-opacity="0.05" stroke-dasharray="2 4"/>
          <line :x1="PAD_L" :x2="W - PAD_R" :y1="PAD_T + innerH * 0.33" :y2="PAD_T + innerH * 0.33"
                stroke="rgb(240 232 213)" stroke-opacity="0.04" stroke-dasharray="2 4"/>
          <line :x1="PAD_L" :x2="W - PAD_R" :y1="PAD_T + innerH * 0.66" :y2="PAD_T + innerH * 0.66"
                stroke="rgb(240 232 213)" stroke-opacity="0.04" stroke-dasharray="2 4"/>
          <line :x1="PAD_L" :x2="W - PAD_R" :y1="PAD_T + innerH" :y2="PAD_T + innerH"
                stroke="rgb(240 232 213)" stroke-opacity="0.12"/>
        </g>

        <!-- Area fill -->
        <path :d="path.area" fill="url(#tl-fill)" />
        <!-- Animated stroke line -->
        <path
          ref="linePathRef"
          :d="path.line"
          fill="none"
          stroke="rgb(255 200 104)"
          stroke-width="1.8"
          stroke-linejoin="round"
          stroke-linecap="round"
          filter="url(#tl-glow)"
        />

        <!-- Hover crosshair -->
        <g v-if="hoverPoint" pointer-events="none">
          <line
            :x1="hoverPoint.x" :x2="hoverPoint.x"
            :y1="PAD_T" :y2="PAD_T + innerH"
            stroke="rgb(255 184 64)" stroke-opacity="0.45"
            stroke-dasharray="2 3" stroke-width="1"
          />
          <circle
            :cx="hoverPoint.x" :cy="hoverPoint.y"
            r="6" fill="rgb(255 184 64)" fill-opacity="0.20"
          />
          <circle
            :cx="hoverPoint.x" :cy="hoverPoint.y"
            r="3" fill="rgb(255 240 210)" stroke="rgb(10 21 37)" stroke-width="1.6"
          />
        </g>
      </svg>

      <!-- Tooltip overlay - positioned by hover x in DOM coords -->
      <div
        v-if="hoverPoint"
        class="absolute pointer-events-none bg-surface card-2 px-3 py-2 rounded-[6px] border border-rule-strong"
        :style="{
          left: `clamp(8px, ${(hoverPoint.x / W) * 100}%, calc(100% - 140px))`,
          top: '8px',
          transform: 'translateX(-50%)',
          minWidth: '120px',
        }"
      >
        <div class="num-display num-amber text-[18px] font-semibold leading-none">{{ hoverPoint.v.toLocaleString() }}</div>
        <div class="label label-mute mt-1">{{ fmtFullDate(hoverPoint.date) }}</div>
      </div>
    </div>

    <!-- X-axis tick labels -->
    <div class="px-3 pb-3 relative h-[18px]">
      <svg :viewBox="`0 0 ${W} 18`" class="w-full h-[18px] block" preserveAspectRatio="none">
        <text
          v-for="t in axisTicks"
          :key="`tick-${t.x}`"
          :x="t.x"
          y="13"
          font-family="Geist Variable, system-ui"
          font-size="10"
          font-weight="600"
          letter-spacing="0.12em"
          text-anchor="middle"
          fill="rgb(92 100 120)"
          style="text-transform: uppercase"
        >{{ t.label }}</text>
      </svg>
    </div>
  </article>
</template>
