<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import AtlasMap from '@/components/atlas/AtlasMap.vue'
import SystemHealthBoard from '@/components/atlas/SystemHealthBoard.vue'
import LiveExhibitorFeed from '@/components/atlas/LiveExhibitorFeed.vue'
import LiveActivityTicker from '@/components/atlas/LiveActivityTicker.vue'
import IndustryDonut from '@/components/atlas/IndustryDonut.vue'
import NowCrawling from '@/components/atlas/NowCrawling.vue'
import TimelineArea from '@/components/atlas/TimelineArea.vue'
import TopGrowingCountries from '@/components/atlas/TopGrowingCountries.vue'
import SystemOverview from '@/components/atlas/SystemOverview.vue'
import QuickActionsList from '@/components/atlas/QuickActionsList.vue'

/**
 * Atlas — Refined Cinematic register, map-dominant Z-axis Cascade.
 *
 * Layout intent: map fills the viewport canvas as the hero. Hero numeral
 * (vendors_total) overlays the map top-left in gold cinema-scale. A run
 * state card cascades top-right at a slight rotation; two more KPI chips
 * Z-stack lower-right at the opposite tilt. Bottom edge carries the CTA
 * rail. Below the fold, an editorial band reveals timeline + industries
 * + recent country roll.
 *
 * Every figure on screen is wired to a real backend endpoint. No
 * synthesized prose. Bahasa Indonesia copy throughout.
 */

const router = useRouter()

const overview = useQuery({
  queryKey: ['overview'],
  queryFn: () => api.overview(),
  refetchInterval: 15_000,
})

const health = useQuery({
  queryKey: ['health-uptime'],
  queryFn: () => api.health(),
  refetchInterval: 30_000,
})

// Capture snapshot {uptime_seconds, fetchedAt} sehingga jam berdetik bisa
// di-compute client-side tanpa request per detik.
const uptimeAnchor = computed(() => {
  const u = health.data.value?.uptime_seconds
  if (u === null || u === undefined || !Number.isFinite(u)) return null
  return { snapshotSec: u, anchorMs: Date.now() }
})

const nowTick = ref(Date.now())
let uptimeTimer: ReturnType<typeof setInterval> | null = null

const uptimeSeconds = computed(() => {
  const a = uptimeAnchor.value
  if (!a) return null
  const drift = (nowTick.value - a.anchorMs) / 1000
  return Math.max(0, Math.floor(a.snapshotSec + drift))
})

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n) }

const uptimeParts = computed(() => {
  const s = uptimeSeconds.value
  if (s === null) return null
  const days = Math.floor(s / 86_400)
  const hours = Math.floor((s % 86_400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return { days, hours, minutes, seconds }
})

const serviceSinceLabel = computed(() => {
  const s = uptimeSeconds.value
  if (s === null) return null
  const since = new Date(Date.now() - s * 1000)
  // dd.MM.yyyy HH:mm WIB-equivalent (browser local).
  const dd = pad2(since.getDate())
  const mo = pad2(since.getMonth() + 1)
  const yr = since.getFullYear()
  const hh = pad2(since.getHours())
  const mi = pad2(since.getMinutes())
  return `${dd}.${mo}.${yr} ${hh}:${mi}`
})

const activeRun = useQuery({
  queryKey: ['active-run'],
  queryFn: () => api.activeRun().then(r => r.active),
  refetchInterval: 5_000,
})

const timeline = useQuery({
  queryKey: ['stats-timeline-30'],
  queryFn: () => api.stats.timeline(30),
  staleTime: 60_000,
})

const countries = useQuery({
  queryKey: ['stats-countries-7'],
  queryFn: () => api.stats.countries(7),
  staleTime: 60_000,
})

const recentVendors = useQuery({
  queryKey: ['vendors-recent-6'],
  queryFn: () => api.vendors({ limit: 6, sort: '-created_at' }),
  staleTime: 30_000,
})

const vendorsTotal = computed(() => overview.data.value?.vendors_total ?? null)
const exposTotal   = computed(() => overview.data.value?.expos_total ?? null)
const pdfsTotal    = computed(() => overview.data.value?.pdfs_total ?? null)
const phase2Ratio  = computed(() => overview.data.value?.phase_2_progress_ratio ?? 0)
const phase2Threshold = computed(() => overview.data.value?.phase_2_threshold ?? null)
const latestRun    = computed(() => overview.data.value?.latest_run ?? null)
const industries   = computed(() => overview.data.value?.industry_breakdown ?? [])

const phase2Percent = computed(() => {
  const r = phase2Ratio.value
  if (!Number.isFinite(r)) return 0
  return Math.min(100, Math.max(0, r * 100))
})

const isRunLive = computed(() => Boolean(activeRun.data.value))

const liveRunMode = computed(() => {
  const r = activeRun.data.value as Record<string, unknown> | null
  return (r?.mode as string | undefined) ?? latestRun.value?.mode ?? null
})

const liveRunId = computed(() => {
  const r = activeRun.data.value as Record<string, unknown> | null
  const id = (r?.run_id as string | undefined) ?? latestRun.value?.run_id ?? null
  return id ? id.slice(0, 8) : null
})

// Sparkline derived from /stats/timeline
const sparkline = computed(() => {
  const data = timeline.data.value ?? []
  if (data.length < 2) return { path: '', area: '', max: 0, total: 0 }
  const values = data.map(d => d.vendors_added)
  const max = Math.max(...values, 1)
  const total = values.reduce((a, b) => a + b, 0)
  const w = 600
  const h = 120
  const stepX = w / (values.length - 1)
  const points = values.map((v, i) => [i * stepX, h - (v / max) * (h - 8) - 4])
  const path = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ')
  const area = `${path} L ${w} ${h} L 0 ${h} Z`
  return { path, area, max, total }
})

const topIndustries = computed(() => industries.value.slice(0, 4))

// Backend marks status='enriched' the moment we have a domain + scrape blob,
// even if no contacts/socials/address were actually extracted (description
// alone is a stub, not an enrichment). Mirror the gating here so the pill
// in "Vendor Terbaru" never claims 'enriched' on a thin record.
function deriveVendorStatus(v: { status?: string | null; contacts?: { type?: string }[] | null; address?: unknown; socials?: Record<string, unknown> | null }): string {
  const raw = v.status ?? 'unresolved'
  if (raw !== 'enriched') return raw
  const contacts = v.contacts ?? []
  const hasContact = contacts.length > 0
  const hasAddress = Boolean(v.address)
  const socials = v.socials ?? {}
  const hasSocial = Object.entries(socials).some(([k, val]) => k !== 'other' && Boolean(val))
  if (!hasContact && !hasAddress && !hasSocial) return 'thin'
  return 'enriched'
}

const recents = computed(() => {
  const items = recentVendors.data.value?.items ?? []
  return items.map((v) => ({ ...v, _display_status: deriveVendorStatus(v as never) }))
})
// Prefetch top countries so /stats/countries is warm when the TopGrowingCountries
// component below mounts. We don't render the data here directly.
void countries.data.value

const formatNum = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return ' '
  return new Intl.NumberFormat('id-ID').format(n)
}

// Loading placeholder for cinema numerals — shows em-dash sentinel in gold-mute
// while query resolves, so the hero never collapses to empty space.
const cinemaVendors = computed(() => {
  const n = vendorsTotal.value
  return (n === null || n === undefined) ? '—,———' : formatNum(n)
})
const cinemaExpos = computed(() => {
  const n = exposTotal.value
  return (n === null || n === undefined) ? '——' : formatNum(n)
})

// Live ticker — rotates through recent vendor names every 4 seconds.
const tickerIndex = ref(0)
let tickerTimer: ReturnType<typeof setInterval> | null = null
const tickerText = computed(() => {
  const list = recents.value
  if (!list.length) return 'MENUNGGU TELEMETRI · MENUNGGU VENDOR TERBARU'
  const v = list[tickerIndex.value % list.length]
  const base = `${v.company_name} · ${v.domain ?? 'tanpa domain'} · ${v.status}`
  return base.toUpperCase()
})
onMounted(() => {
  tickerTimer = setInterval(() => { tickerIndex.value += 1 }, 4000)
  uptimeTimer = setInterval(() => { nowTick.value = Date.now() }, 1000)
})
onBeforeUnmount(() => {
  if (tickerTimer) clearInterval(tickerTimer)
  if (uptimeTimer) clearInterval(uptimeTimer)
})

function gotoVendors() { router.push('/vendors') }
function gotoOrkestrator() { router.push('/orkestrator') }
function gotoRuns() { router.push('/runs') }
</script>

<template>
  <div class="atlas-canvas">
    <!-- ============================================================== -->
    <!-- HERO CANVAS — map dominates viewport, panels cascade above       -->
    <!-- ============================================================== -->
    <section class="atlas-hero">
      <!-- Map fills the entire hero canvas, edge-bleeding -->
      <div class="atlas-hero__map">
        <AtlasMap />
      </div>

      <!-- Top scrim — soft gradient veil so type stays readable over the map -->
      <div class="atlas-hero__scrim atlas-hero__scrim--top" aria-hidden="true" />
      <div class="atlas-hero__scrim atlas-hero__scrim--bottom" aria-hidden="true" />

      <!-- Live ticker strip — rolling telemetry along the top edge -->
      <div class="atlas-hero__ticker fade-up" style="animation-delay: 0ms">
        <span class="atlas-hero__ticker-mark">
          <span class="live-dot" v-if="isRunLive" />
          <span class="dot dot-mute" v-else />
        </span>
        <span class="atlas-hero__ticker-tag">UPLINK</span>
        <span class="atlas-hero__ticker-msg" :key="tickerIndex">{{ tickerText }}</span>
        <span class="atlas-hero__ticker-stamp">
          {{ liveRunMode ? liveRunMode.toUpperCase() : 'IDLE' }}
          &middot;
          #{{ liveRunId || '———' }}
        </span>
      </div>

      <!-- Vertical stencil — runs 90° down the left edge -->
      <div class="atlas-hero__stencil fade-up" style="animation-delay: 40ms" aria-hidden="true">
        AUTOCRAWL &middot; ATLAS &middot; OPS &middot; 24/7 &middot; GLOBAL EXHIBITOR INTELLIGENCE
      </div>

      <!-- Eyebrow tag, anchored top-left, below ticker -->
      <div class="atlas-hero__eyebrow fade-up" style="animation-delay: 80ms">
        <span class="eyebrow eyebrow-accent">
          <span class="live-dot" v-if="isRunLive" />
          <span class="dot dot-mute" v-else />
          ATLAS &middot; ARMADA INTELIJEN
        </span>
      </div>

      <!-- Cinema-scale numeral overlay — bottom-left -->
      <div class="atlas-hero__cinema fade-up" style="animation-delay: 80ms">
        <div class="atlas-hero__cinema-label">
          <span class="label label-mute">// VENDOR TERVERIFIKASI</span>
        </div>
        <div class="atlas-hero__cinema-number num">
          <span class="atlas-hero__cinema-num" :data-loading="vendorsTotal === null || vendorsTotal === undefined">
            {{ cinemaVendors }}
          </span>
          <span class="atlas-hero__cinema-suffix">
            <span class="text-ink-mute">dari</span>
            <span class="text-ink num">{{ cinemaExpos }}</span>
            <span class="text-ink-mute">ekspo &middot;</span>
            <span class="text-ink num">{{ formatNum(pdfsTotal) }}</span>
            <span class="text-ink-mute">PDF</span>
          </span>
        </div>

        <!-- Progress rail — phase 2 -->
        <div class="atlas-hero__rail">
          <div class="atlas-hero__rail-track">
            <div class="atlas-hero__rail-fill" :style="{ width: phase2Percent + '%' }" />
          </div>
          <div class="atlas-hero__rail-meta">
            <span class="label label-mute">FASE 2 &middot; AMBANG {{ formatNum(phase2Threshold) }}</span>
            <span class="num text-amber" style="font-weight: 600">
              {{ phase2Percent.toFixed(1) }}<span class="text-ink-mute">%</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Z-axis Cascade — Uptime card, top-right with -2deg tilt.
           Structural break dari grid 2-col lama: vertical hierarchy,
           live ticking clock di num-display, heartbeat dot sebagai
           "service alive" indicator. -->
      <div class="atlas-hero__card-run fade-up" style="animation-delay: 160ms">
        <div class="bezel">
          <div class="bezel-core p-5 atlas-uptime">
            <div class="atlas-uptime__head">
              <span class="label label-mute">// UPTIME</span>
              <span class="atlas-uptime__heartbeat" aria-hidden="true">
                <span class="atlas-uptime__heartbeat-core" />
              </span>
            </div>

            <div v-if="uptimeParts" class="atlas-uptime__clock" aria-live="polite">
              <span class="atlas-uptime__seg atlas-uptime__seg--days">
                <span class="num">{{ uptimeParts.days }}</span>
                <span class="atlas-uptime__seg-unit">h</span>
              </span>
              <span class="atlas-uptime__cmark">:</span>
              <span class="num atlas-uptime__seg-time">{{ pad2(uptimeParts.hours) }}</span>
              <span class="atlas-uptime__cmark">:</span>
              <span class="num atlas-uptime__seg-time">{{ pad2(uptimeParts.minutes) }}</span>
              <span class="atlas-uptime__cmark atlas-uptime__cmark--blink">:</span>
              <span class="num atlas-uptime__seg-time atlas-uptime__seg-time--sec">{{ pad2(uptimeParts.seconds) }}</span>
            </div>
            <div v-else class="atlas-uptime__clock atlas-uptime__clock--empty">
              <span class="num">—</span>
            </div>

            <div class="atlas-uptime__caption">
              <span class="label label-mute">Berjalan tanpa henti</span>
              <span v-if="serviceSinceLabel" class="atlas-uptime__since">
                sejak <span class="num">{{ serviceSinceLabel }}</span>
              </span>
            </div>

            <button class="btn btn-ghost btn-sm mt-4 w-full" @click="gotoOrkestrator">
              <span>Buka Orkestrator</span>
              <span class="btn-icon-nest">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path d="M3 7h8M7 3l4 4-4 4" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Z-axis Cascade — Documents card, mid-right with +3deg tilt -->
      <div class="atlas-hero__card-docs fade-up" style="animation-delay: 240ms">
        <div class="card p-5">
          <span class="label label-mute">DOKUMEN PDF</span>
          <div class="mt-2 num text-ink" style="font-size: 38px; font-weight: 600; letter-spacing: -0.025em">
            {{ formatNum(pdfsTotal) }}
          </div>
          <span class="text-ink-mute text-xs">terindeks dari ekspo aktif</span>
        </div>
      </div>

      <!-- Industry chip cascade — bottom-right -->
      <div class="atlas-hero__chips fade-up" style="animation-delay: 320ms">
        <span class="label label-mute mb-2 block">// SEKTOR DOMINAN</span>
        <div class="flex flex-wrap gap-2 justify-end">
          <span
            v-for="(it, i) in topIndustries"
            :key="it.tag + i"
            class="pill"
            :class="i === 0 ? 'pill-amber' : ''"
          >
            {{ it.tag }}
            <span class="num text-ink-mute ml-1">{{ formatNum(it.count) }}</span>
          </span>
        </div>
      </div>

      <!-- CTA rail — bottom edge -->
      <div class="atlas-hero__cta fade-up" style="animation-delay: 400ms">
        <button class="btn btn-amber btn-lg" @click="gotoVendors">
          <span>Buka Armada Vendor</span>
          <span class="btn-icon-nest">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 7h8M7 3l4 4-4 4" />
            </svg>
          </span>
        </button>
        <button class="btn" @click="gotoRuns">
          <span>Riwayat Run</span>
        </button>
        <div class="atlas-hero__scroll-cue">
          <span class="label label-mute">GULIR &middot; TIMELINE 30H</span>
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="1.4">
            <rect x="1" y="1" width="10" height="18" rx="5" />
            <path d="M6 5v4" class="atlas-hero__scroll-tick" />
          </svg>
        </div>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- HORIZONTAL LIVE TICKER — newsprint-style strip, agentic crawler  -->
    <!-- success/fail events, hairline-bordered, garnish bukan kompetisi  -->
    <!-- ============================================================== -->
    <LiveActivityTicker class="atlas-activity-ticker" />

    <!-- ============================================================== -->
    <!-- SECTION BREAK — scroll signal, no decorative empty space         -->
    <!-- ============================================================== -->
    <section class="atlas-section-mark">
      <span class="atlas-section-mark__num">02</span>
      <div class="atlas-section-mark__rule" />
      <div class="atlas-section-mark__title">
        <span class="eyebrow">// SECTOR INTELLIGENCE</span>
        <h2 class="display-hero">Inti Telemetri</h2>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- BAND I — 12-col asymmetric bento (Apple/Stripe varied col-span)  -->
    <!-- ============================================================== -->
    <section class="atlas-bento-i">
      <!-- 7-col wide timeline area (real backend, /stats/timeline 30d) -->
      <div class="atlas-cell atlas-cell--timeline">
        <div class="bezel bezel-lg h-full">
          <div class="bezel-core h-full">
            <div class="flex items-end justify-between p-6 pb-3">
              <div>
                <span class="eyebrow">// AKTIVITAS 30 HARI</span>
                <h3 class="display-hero mt-4">
                  <span class="num text-amber">{{ formatNum(sparkline.total) }}</span>
                  <span class="text-ink-mute" style="font-size: 0.38em; font-weight: 500">
                    vendor ditambahkan
                  </span>
                </h3>
              </div>
              <div class="text-right">
                <span class="label label-mute">PUNCAK HARIAN</span>
                <div class="num text-ink mt-1" style="font-size: 22px">
                  {{ formatNum(sparkline.max) }}
                </div>
              </div>
            </div>
            <div class="px-6 pb-6">
              <svg viewBox="0 0 600 120" preserveAspectRatio="none" class="w-full h-32" aria-hidden="true">
                <defs>
                  <linearGradient id="atlas-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgb(var(--accent))" stop-opacity="0.42" />
                    <stop offset="100%" stop-color="rgb(var(--accent))" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path :d="sparkline.area" fill="url(#atlas-spark)" />
                <path :d="sparkline.path" fill="none" stroke="rgb(var(--accent))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- 5-col tall stack: industry donut on top + system overview below -->
      <div class="atlas-cell atlas-cell--industries">
        <IndustryDonut />
      </div>

      <!-- 4-col: top growing countries (rich component, real data) -->
      <div class="atlas-cell atlas-cell--countries">
        <TopGrowingCountries />
      </div>

      <!-- 8-col: live exhibitor feed (rolling, real data) -->
      <div class="atlas-cell atlas-cell--feed">
        <LiveExhibitorFeed />
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- BAND II — operational telemetry, dense                           -->
    <!-- ============================================================== -->
    <section class="atlas-section-mark">
      <span class="atlas-section-mark__num">03</span>
      <div class="atlas-section-mark__rule" />
      <div class="atlas-section-mark__title">
        <span class="eyebrow">// LIVE OPS</span>
        <h2 class="display-hero">Mesin Berjalan</h2>
      </div>
    </section>

    <section class="atlas-bento-ii">
      <!-- 12-col full: system health board (GPU VRAM, LLM tiers, agentic sessions) -->
      <div class="atlas-cell atlas-cell--full">
        <SystemHealthBoard />
      </div>

      <!-- 5-col: now crawling (live agent activity) -->
      <div class="atlas-cell atlas-cell--now">
        <NowCrawling />
      </div>

      <!-- 7-col: timeline area (the rich chart component) -->
      <div class="atlas-cell atlas-cell--timeline-rich">
        <TimelineArea />
      </div>

      <!-- 4-col: system overview -->
      <div class="atlas-cell atlas-cell--system">
        <SystemOverview />
      </div>

      <!-- 4-col: quick actions list -->
      <div class="atlas-cell atlas-cell--quick">
        <QuickActionsList />
      </div>

      <!-- 4-col: recent vendors editorial roll -->
      <div class="atlas-cell atlas-cell--recent">
        <div class="card p-5 h-full">
          <div class="flex items-center justify-between mb-3">
            <span class="eyebrow">// VENDOR TERBARU</span>
            <button class="btn btn-ghost btn-sm" @click="gotoVendors">
              <span>Semua</span>
              <span class="btn-icon-nest">
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path d="M3 7h8M7 3l4 4-4 4" />
                </svg>
              </span>
            </button>
          </div>
          <ul class="divide-y divide-[rgb(var(--rule)/var(--rule-alpha))]">
            <li
              v-for="(v, i) in recents.slice(0, 5)"
              :key="v.vendor_id"
              class="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-2/50 px-2 -mx-2 rounded-lg transition-colors"
              @click="router.push(`/vendors/${encodeURIComponent(v.domain ?? v.vendor_id)}`)"
            >
              <span class="num text-ink-mute" style="font-size: 11px; width: 22px">{{ String(i + 1).padStart(2, '0') }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-ink text-sm font-medium truncate">{{ v.company_name }}</div>
                <div class="text-ink-mute text-xs truncate font-mono">{{ v.domain || '—' }}</div>
              </div>
              <span
                class="pill"
                :class="v._display_status === 'enriched' ? 'pill-ok'
                       : (v._display_status === 'unresolved' || v._display_status === 'thin') ? 'pill-amber'
                       : (v._display_status === 'enrich_failed' || v._display_status === 'scope_rejected' || v._display_status === 'validation_rejected') ? 'pill-crit'
                       : ''"
                :title="v._display_status === 'thin' ? 'Backend tandain enriched tapi kontak/sosial/alamat kosong' : ''"
              >
                {{ v._display_status }}
              </span>
            </li>
            <li v-if="!recents.length" class="text-ink-mute text-sm py-4">menunggu data…</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Footer hairline -->
    <footer class="atlas-foot">
      <span class="label label-mute">AUTOCRAWL &middot; ATLAS &middot; OPS</span>
      <span class="text-ink-mute" style="font-family: var(--font-mono); font-size: 11px">
        {{ new Date().toISOString().slice(0, 16).replace('T', ' ') }} UTC
      </span>
    </footer>
  </div>
</template>

<style scoped>
.atlas-canvas {
  position: relative;
  min-height: 100dvh;
}

/* -------- HERO CANVAS -------- */
.atlas-hero {
  position: relative;
  width: 100%;
  height: min(72dvh, 780px);
  overflow: hidden;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
}

/* Live ticker strip — top edge, monospace, rolling vendor names */
.atlas-hero__ticker {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 32px;
  background: linear-gradient(180deg, rgb(var(--bg) / 0.88) 0%, rgb(var(--bg) / 0.55) 70%, transparent 100%);
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-2));
}
.atlas-hero__ticker-mark { display: inline-flex; align-items: center; }
.atlas-hero__ticker-tag  { color: rgb(var(--accent)); font-weight: 600; }
.atlas-hero__ticker-msg  {
  flex: 1;
  color: rgb(var(--ink));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  animation: ticker-blur 0.45s cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes ticker-blur {
  0%   { opacity: 0; filter: blur(6px); transform: translateY(-3px); }
  100% { opacity: 1; filter: blur(0);   transform: translateY(0); }
}
.atlas-hero__ticker-stamp { color: rgb(var(--ink-mute)); }

/* Vertical stencil — runs 90° down the left edge */
.atlas-hero__stencil {
  position: absolute;
  left: -8px;
  top: 50%;
  z-index: 4;
  transform: rotate(-90deg) translateY(0);
  transform-origin: left center;
  white-space: nowrap;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-weight: 500;
  font-size: 10.5px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute) / 0.65);
  pointer-events: none;
  padding-left: 50%;
}

.atlas-hero__map {
  position: absolute;
  inset: 0;
  z-index: 1;
}
/* Bind AtlasMap container to fill */
.atlas-hero__map :deep(.autocrawl-map),
.atlas-hero__map :deep(> *) {
  width: 100% !important;
  height: 100% !important;
}
/* Suppress AtlasMap's own top-left caption + top-right tally — the
 * Atlas hero owns those headlines now. Other AtlasMap chrome (compass,
 * legend, markers) stays. */
.atlas-hero__map :deep(.autocrawl-map > .absolute.left-4.top-3\.5),
.atlas-hero__map :deep(.autocrawl-map > .absolute.right-4.top-3\.5) {
  display: none !important;
}

.atlas-hero__scrim {
  position: absolute;
  inset-inline: 0;
  z-index: 2;
  pointer-events: none;
  height: 38%;
}
.atlas-hero__scrim--top {
  top: 0;
  background: linear-gradient(
    180deg,
    rgb(var(--bg) / 0.92) 0%,
    rgb(var(--bg) / 0.55) 45%,
    rgb(var(--bg) / 0) 100%
  );
}
.atlas-hero__scrim--bottom {
  bottom: 0;
  background: linear-gradient(
    0deg,
    rgb(var(--bg) / 0.95) 0%,
    rgb(var(--bg) / 0.6) 45%,
    rgb(var(--bg) / 0) 100%
  );
}

/* Eyebrow — below ticker */
.atlas-hero__eyebrow {
  position: absolute;
  top: 56px;
  left: 32px;
  z-index: 5;
}

/* Cinema numeral overlay — bottom left, GIANT and gold */
.atlas-hero__cinema {
  position: absolute;
  left: 32px;
  bottom: 88px;
  z-index: 5;
  max-width: 72%;
}
.atlas-hero__cinema-label { margin-bottom: 8px; }
.atlas-hero__cinema-number {
  display: flex;
  align-items: baseline;
  gap: 24px;
  flex-wrap: wrap;
}
.atlas-hero__cinema-num {
  font-family: 'Geist Variable', 'Geist', system-ui, sans-serif;
  font-weight: 700;
  font-size: clamp(5rem, 13vw, 13rem);
  line-height: 1.0;
  letter-spacing: -0.045em;
  color: rgb(var(--accent));
  background: linear-gradient(
    180deg,
    rgb(var(--accent-hot)) 0%,
    rgb(var(--accent)) 55%,
    rgb(var(--accent-glow, var(--accent))) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 1px 0 rgb(255 255 255 / 0.06);
  display: inline-block;
  padding-block: 0.04em;
  padding-inline: 0.06em 0.12em;
  margin-inline: -0.06em -0.12em;
}
.atlas-hero__cinema-num[data-loading="true"] {
  background: none;
  -webkit-text-fill-color: rgb(var(--accent) / 0.22);
  color: rgb(var(--accent) / 0.22);
  animation: cinema-pulse 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
@keyframes cinema-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
.atlas-hero__cinema-suffix {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-size: clamp(1.1rem, 1.6vw, 1.5rem);
  font-weight: 500;
}

/* Progress rail */
.atlas-hero__rail {
  margin-top: 24px;
  max-width: 560px;
}
.atlas-hero__rail-track {
  position: relative;
  height: 6px;
  background: rgb(var(--rule) / 0.16);
  border-radius: 9999px;
  overflow: hidden;
}
.atlas-hero__rail-fill {
  position: absolute;
  inset-block: 0;
  left: 0;
  background: linear-gradient(
    90deg,
    rgb(var(--accent-hot)) 0%,
    rgb(var(--accent)) 100%
  );
  border-radius: 9999px;
  box-shadow: 0 0 16px rgb(var(--accent) / 0.45);
  transition: width 900ms cubic-bezier(0.32, 0.72, 0, 1);
}
.atlas-hero__rail-meta {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Cascade — RUN card top-right -2deg */
.atlas-hero__card-run {
  position: absolute;
  top: 28px;
  right: 32px;
  z-index: 6;
  width: 320px;
  transform: rotate(-2deg);
  transform-origin: top right;
}

/* Cascade — DOCS card +3deg, slightly lower, behind run card */
.atlas-hero__card-docs {
  position: absolute;
  top: 240px;
  right: 80px;
  z-index: 5;
  width: 220px;
  transform: rotate(3deg);
  transform-origin: top right;
}

/* Industry chip cluster — bottom-right */
.atlas-hero__chips {
  position: absolute;
  bottom: 100px;
  right: 32px;
  z-index: 5;
  text-align: right;
  max-width: 360px;
}

/* CTA rail — bottom edge */
.atlas-hero__cta {
  position: absolute;
  left: 32px;
  right: 32px;
  bottom: 24px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 12px;
}
.atlas-hero__scroll-cue {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgb(var(--ink-mute));
}
.atlas-hero__scroll-tick {
  stroke: rgb(var(--accent));
  animation: scroll-cue 1.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
@keyframes scroll-cue {
  0%   { transform: translateY(0); opacity: 1; }
  60%  { transform: translateY(5px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

/* -------- UPTIME CARD — service-alive heartbeat -------- */
.atlas-uptime {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.atlas-uptime__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* Heartbeat: dual-ring vermilion pulse. Mengikuti DESIGN.md One Voice
   rule (≤10% screen) -- dot itu sendiri 8px, ring expand ke ~22px tapi
   transparent. Animation hardware-accelerated (transform + box-shadow). */
.atlas-uptime__heartbeat {
  position: relative;
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
}
.atlas-uptime__heartbeat-core {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(var(--accent));
  box-shadow:
    0 0 0 0 rgb(var(--accent) / 0.55),
    0 0 8px rgb(var(--accent) / 0.40);
  animation: atlas-uptime-pulse 1400ms cubic-bezier(0.22, 1, 0.36, 1) infinite;
  will-change: transform, box-shadow;
}
@keyframes atlas-uptime-pulse {
  0%   { transform: scale(1);    box-shadow: 0 0 0 0    rgb(var(--accent) / 0.55), 0 0 8px rgb(var(--accent) / 0.40); }
  60%  { transform: scale(1.04); box-shadow: 0 0 0 8px  rgb(var(--accent) / 0),    0 0 4px rgb(var(--accent) / 0.25); }
  100% { transform: scale(1);    box-shadow: 0 0 0 0    rgb(var(--accent) / 0),    0 0 8px rgb(var(--accent) / 0.40); }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-uptime__heartbeat-core { animation: none; box-shadow: 0 0 6px rgb(var(--accent) / 0.40); }
}

/* Clock: hari di seg lebih besar, jam:menit:detik dalam num-display
   tabular dengan letter-spacing dan slashed-zero. */
.atlas-uptime__clock {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-feature-settings: 'tnum' on, 'zero' on, 'ss19' on;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.atlas-uptime__clock--empty { color: rgb(var(--ink-mute)); }
.atlas-uptime__clock--empty .num { font-size: 28px; }

.atlas-uptime__seg--days {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  margin-right: 6px;
  color: rgb(var(--accent));
}
.atlas-uptime__seg--days .num {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.03em;
}
.atlas-uptime__seg-unit {
  font-size: 11px;
  font-weight: 600;
  text-transform: lowercase;
  color: rgb(var(--accent));
  opacity: 0.75;
  letter-spacing: 0.04em;
}

.atlas-uptime__seg-time {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: rgb(var(--ink));
}
.atlas-uptime__seg-time--sec { color: rgb(var(--ink-mute)); }

.atlas-uptime__cmark {
  font-size: 20px;
  font-weight: 500;
  color: rgb(var(--ink-mute));
  opacity: 0.55;
  margin: 0 1px;
  font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
}
.atlas-uptime__cmark--blink {
  animation: atlas-uptime-blink 1s steps(2, end) infinite;
}
@keyframes atlas-uptime-blink {
  0%, 50% { opacity: 0.55; }
  50.01%, 100% { opacity: 0.10; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-uptime__cmark--blink { animation: none; }
}

.atlas-uptime__caption {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid rgb(var(--rule) / 0.6);
  margin-top: 4px;
}
.atlas-uptime__since {
  font-size: 11px;
  color: rgb(var(--ink-mute));
  letter-spacing: 0.01em;
}
.atlas-uptime__since .num {
  font-size: 11px;
  font-feature-settings: 'tnum' on, 'zero' on, 'ss19' on;
  color: rgb(var(--ink-2));
}

/* -------- ACTIVITY TICKER — horizontal strip below hero -------- */
.atlas-activity-ticker {
  margin: 0;
}

/* -------- SECTION MARK — scroll signal -------- */
.atlas-section-mark {
  display: grid;
  grid-template-columns: 88px 1fr;
  align-items: end;
  gap: 24px;
  padding: 56px 32px 28px;
}
.atlas-section-mark__num {
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-weight: 600;
  font-size: 72px;
  letter-spacing: -0.04em;
  line-height: 0.9;
  color: rgb(var(--accent));
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.atlas-section-mark__rule {
  grid-column: 1 / -1;
  height: 1px;
  background: linear-gradient(90deg, rgb(var(--accent)) 0%, rgb(var(--rule) / 0.18) 18%, rgb(var(--rule) / 0.18) 100%);
  margin-top: 6px;
}
.atlas-section-mark__title { padding-bottom: 4px; }
.atlas-section-mark__title h2 { margin-top: 10px; }

/* -------- BENTO I — asymmetric 12-col, two-row -------- */
.atlas-bento-i {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  /* Row 1 sizes to timeline. Row 2 is locked to a definite height so
   * countries + feed sit equal-height regardless of internal list length. */
  grid-template-rows: auto 380px;
  gap: 20px;
  padding: 16px 32px 16px;
}
.atlas-cell--timeline   { grid-column: span 7; grid-row: 1; }
.atlas-cell--industries { grid-column: span 5; grid-row: 1 / span 2; }
.atlas-cell--countries  { grid-column: span 4; grid-row: 2; min-height: 0; overflow: hidden; }
.atlas-cell--feed       { grid-column: span 3; grid-row: 2; min-height: 0; overflow: hidden; }
/* Children of the locked-row cells must fill height with internal scroll
 * so LiveExhibitorFeed's rolling list scrolls inside instead of growing. */
.atlas-cell--countries > :first-child,
.atlas-cell--feed > :first-child {
  height: 100%;
  max-height: 100%;
  overflow-y: auto;
}
/* let LiveExhibitorFeed actually fit; col 4 on second row */

/* -------- BENTO II — operational telemetry, 12-col -------- */
.atlas-bento-ii {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 20px;
  padding: 16px 32px 56px;
}
.atlas-cell--full         { grid-column: span 12; }
.atlas-cell--now          { grid-column: span 5; }
.atlas-cell--timeline-rich{ grid-column: span 7; }
.atlas-cell--system       { grid-column: span 4; }
.atlas-cell--quick        { grid-column: span 4; }
.atlas-cell--recent       { grid-column: span 4; }

/* Children of cells: take the full height of the grid cell */
.atlas-cell > :first-child { height: 100%; display: block; }

/* Footer */
.atlas-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px 32px;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
}

/* -------- MOBILE COLLAPSE — single column, no rotation -------- */
@media (max-width: 1100px) {
  .atlas-hero { height: auto; min-height: 92dvh; padding-bottom: 40px; }
  .atlas-hero__card-docs,
  .atlas-hero__chips,
  .atlas-hero__stencil { display: none; }
  .atlas-hero__card-run {
    position: static;
    width: auto;
    transform: none;
    margin: 0 16px 16px;
  }
  .atlas-hero__cinema {
    left: 16px;
    right: 16px;
    bottom: 100px;
    max-width: none;
  }
  .atlas-hero__cta { left: 16px; right: 16px; flex-wrap: wrap; }
  .atlas-hero__ticker { padding: 10px 16px; gap: 10px; font-size: 10px; }
  .atlas-section-mark {
    grid-template-columns: 1fr;
    padding: 36px 16px 8px;
  }
  .atlas-section-mark__num { font-size: 48px; text-align: left; }
  .atlas-bento-i,
  .atlas-bento-ii {
    grid-template-columns: 1fr;
    padding: 16px 16px;
  }
  .atlas-cell--timeline,
  .atlas-cell--industries,
  .atlas-cell--countries,
  .atlas-cell--feed,
  .atlas-cell--full,
  .atlas-cell--now,
  .atlas-cell--timeline-rich,
  .atlas-cell--system,
  .atlas-cell--quick,
  .atlas-cell--recent {
    grid-column: 1 / -1;
    grid-row: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .atlas-hero__scroll-tick { animation: none; }
  .atlas-hero__cinema-num[data-loading="true"] { animation: none; }
  .atlas-hero__ticker-msg { animation: none; }
}
</style>
