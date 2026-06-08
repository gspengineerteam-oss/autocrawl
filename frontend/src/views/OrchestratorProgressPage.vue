<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import HudOpsStatusBar from '@/components/HudOpsStatusBar.vue'
import HudOpsCurrentActivity from '@/components/HudOpsCurrentActivity.vue'
import HudOpsThroughput from '@/components/HudOpsThroughput.vue'
import HudOpsTimeline from '@/components/HudOpsTimeline.vue'
import HudOpsErrorInbox from '@/components/HudOpsErrorInbox.vue'

/**
 * Orkestrator — Console archetype, cinematic vertical stage rail.
 *
 * Layout intent: a hero strip declares the current run with cinema-scale
 * exhibitor count + run mode. Below it, a two-column live console:
 * LEFT 5-col the vertical stage rail (HudOpsCurrentActivity) — pipeline
 * progression top-to-bottom. RIGHT 7-col stacked telemetry: throughput
 * sparkline, timeline ribbon, error inbox. All chrome is gold-accented
 * Geist; numbers are Geist tabular.
 *
 * Real data: /orchestrator/state + /orchestrator/throughput + the
 * existing HudOps* components which already wire their own backend.
 */

const stateQ = useQuery({
  queryKey: ['orchestrator', 'state', 'hero'],
  queryFn: api.orchestrator.state,
  refetchInterval: 4000,
})
const throughputQ = useQuery({
  queryKey: ['orchestrator', 'throughput', 'hero'],
  queryFn: () => api.orchestrator.throughput(60),
  refetchInterval: 4000,
})
const currentQ = useQuery({
  queryKey: ['orchestrator', 'current', 'hero'],
  queryFn: api.orchestrator.current,
  refetchInterval: 4000,
})

const runState = computed(() => stateQ.data.value as Record<string, unknown> | undefined)
const runMode = computed(() => {
  const r = runState.value
  return (r?.mode as string | undefined)
       ?? (currentQ.data.value as Record<string, unknown> | undefined)?.mode as string | undefined
       ?? null
})
const isLive = computed(() => {
  const r = runState.value
  const status = (r?.status as string | undefined) ?? ''
  return status === 'running' || status === 'live' || status === 'active'
})

const exhibitorsExtracted = computed(() => {
  const r = runState.value
  return (r?.exhibitors_extracted as number | undefined) ?? null
})
const vendorsResolved = computed(() => {
  const r = runState.value
  return (r?.vendors_resolved as number | undefined) ?? null
})
const failures = computed(() => {
  const r = runState.value
  return (r?.failures as number | undefined) ?? null
})

const eventsPerMin = computed(() => Math.round((throughputQ.data.value?.events_per_minute ?? 0) * 10) / 10)
const workers = computed(() => throughputQ.data.value?.active_workers_total ?? 0)

const formatNum = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('id-ID').format(n)
}
</script>

<template>
  <div class="orch-canvas">
    <!-- ============================================================== -->
    <!-- HERO STRIP — cinematic run state                                 -->
    <!-- ============================================================== -->
    <section class="orch-hero">
      <!-- Top ticker -->
      <div class="orch-hero__ticker fade-up" style="animation-delay: 0ms">
        <span class="dot" :class="isLive ? 'dot-amber dot-glow' : 'dot-mute'" />
        <span class="atlas-hero__ticker-tag">ORKESTRATOR</span>
        <span class="atlas-hero__ticker-msg">
          KONSOL OPERASI LIVE &middot;
          {{ runMode ? runMode.toUpperCase() : 'IDLE' }} &middot;
          {{ workers }} WORKER &middot;
          {{ formatNum(eventsPerMin) }} EVENT/MENIT
        </span>
        <span class="atlas-hero__ticker-stamp">
          {{ new Date().toISOString().slice(11, 19) }} UTC
        </span>
      </div>

      <!-- Vertical stencil left edge -->
      <div class="orch-hero__stencil fade-up" style="animation-delay: 40ms" aria-hidden="true">
        AUTOCRAWL &middot; ORKESTRATOR &middot; PIPELINE THEATER &middot; OPS-07
      </div>

      <!-- Cinema numeral: exhibitors_extracted as the hero figure -->
      <div class="orch-hero__cinema fade-up" style="animation-delay: 100ms">
        <span class="eyebrow eyebrow-accent">
          // EXHIBITOR DIEKSTRAK &middot; FASE BERJALAN
        </span>
        <div class="orch-hero__num-row">
          <span class="orch-hero__num">{{ formatNum(exhibitorsExtracted) }}</span>
          <div class="orch-hero__sub">
            <div class="orch-hero__sub-stat">
              <span class="label label-mute">VENDOR RESOLVED</span>
              <div class="num text-ink" style="font-size: 32px; font-weight: 600">
                {{ formatNum(vendorsResolved) }}
              </div>
            </div>
            <div class="orch-hero__sub-stat">
              <span class="label label-mute">KEGAGALAN</span>
              <div class="num text-amber" style="font-size: 32px; font-weight: 600">
                {{ formatNum(failures) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Status bar reused — but framed inside double-bezel -->
      <div class="orch-hero__status fade-up" style="animation-delay: 180ms">
        <HudOpsStatusBar />
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- SECTION MARK 02 -->
    <!-- ============================================================== -->
    <section class="atlas-section-mark">
      <span class="atlas-section-mark__num">02</span>
      <div class="atlas-section-mark__rule" />
      <div class="atlas-section-mark__title">
        <span class="eyebrow">// PIPELINE STAGE</span>
        <h2 class="display-hero">Tahapan Hidup</h2>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- TWO-COL CONSOLE — stage rail (L) + telemetry stack (R)           -->
    <!-- ============================================================== -->
    <section class="orch-console">
      <!-- Stage rail: vertical progression -->
      <div class="orch-console__stage">
        <div class="bezel bezel-lg h-full">
          <div class="bezel-core h-full">
            <HudOpsCurrentActivity />
          </div>
        </div>
      </div>

      <!-- Telemetry stack -->
      <div class="orch-console__stack">
        <div class="orch-stack__cell">
          <HudOpsThroughput />
        </div>
        <div class="orch-stack__cell">
          <HudOpsTimeline />
        </div>
        <div class="orch-stack__cell">
          <HudOpsErrorInbox />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.orch-canvas { position: relative; min-height: 100dvh; }

/* HERO STRIP */
.orch-hero {
  position: relative;
  padding: 12px 28px 32px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  overflow: hidden;
}
.orch-hero::before {
  /* Aurora corner just for this hero */
  content: '';
  position: absolute;
  inset: -10%;
  z-index: 0;
  background-image: var(--aurora-1), var(--aurora-2), var(--aurora-3);
  background-repeat: no-repeat;
  opacity: 0.55;
  pointer-events: none;
  animation: aurora-drift 22s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
.orch-hero > * { position: relative; z-index: 1; }

.orch-hero__ticker {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 8px;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-2));
}
.orch-hero__ticker .atlas-hero__ticker-tag { color: rgb(var(--accent)); font-weight: 600; }
.orch-hero__ticker .atlas-hero__ticker-msg {
  flex: 1;
  color: rgb(var(--ink));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.orch-hero__ticker .atlas-hero__ticker-stamp { color: rgb(var(--ink-mute)); }

.orch-hero__stencil {
  position: absolute;
  left: -10px;
  top: 50%;
  z-index: 2;
  transform: rotate(-90deg);
  transform-origin: left center;
  white-space: nowrap;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-weight: 500;
  font-size: 10.5px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute) / 0.6);
  pointer-events: none;
}

.orch-hero__cinema {
  padding: 14px 8px 8px;
  max-width: 1100px;
}
.orch-hero__num-row {
  display: flex;
  align-items: flex-end;
  gap: 56px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.orch-hero__num {
  font-family: 'Geist Variable', 'Geist', system-ui, sans-serif;
  font-weight: 700;
  font-size: clamp(4.5rem, 11vw, 10rem);
  line-height: 1.0;
  letter-spacing: -0.06em;
  padding-block: 0.04em;
  background: linear-gradient(
    180deg,
    rgb(var(--accent-hot)) 0%,
    rgb(var(--accent)) 55%,
    rgb(var(--accent-glow, var(--accent))) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-variant-numeric: tabular-nums;
}
.orch-hero__sub {
  display: flex;
  gap: 40px;
  align-items: flex-end;
  padding-bottom: 12px;
}
.orch-hero__sub-stat { min-width: 0; }

.orch-hero__status {
  margin-top: 28px;
  padding: 6px;
  background: rgb(var(--shell) / 0.6);
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 24px;
  box-shadow: var(--shadow-card);
}
.orch-hero__status > :first-child {
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 18px;
  overflow: hidden;
}

/* CONSOLE */
.orch-console {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 20px;
  padding: 12px 28px 56px;
  align-items: stretch;
}
.orch-console__stage { min-height: 540px; }
.orch-console__stage .bezel { min-height: 540px; }
.orch-console__stage .bezel-core > :first-child { height: 100%; min-height: 100%; }

.orch-console__stack {
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 20px;
}
.orch-stack__cell { min-width: 0; }
.orch-stack__cell > :first-child { display: block; height: 100%; }

@media (max-width: 1100px) {
  .orch-hero { padding: 8px 16px 24px; }
  .orch-hero__stencil { display: none; }
  .orch-hero__num-row { gap: 24px; }
  .orch-hero__sub { gap: 24px; padding-bottom: 6px; }
  .orch-console { grid-template-columns: 1fr; padding: 12px 16px 36px; }
}
</style>
