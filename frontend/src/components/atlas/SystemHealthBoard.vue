<script setup lang="ts">
/**
 * SystemHealthBoard — editorial briefing on the live machine.
 *
 *   Mesin · Sistem Hidup
 *   ─────────────────────
 *   [ Ollama / GPU      ] [ Antrian LLM        ] [ Sesi Agentic       ]
 *     host + total VRAM    4 tiers per row        per-container card
 *     loaded models list   cap vs inflight bar    started + TTL
 *
 * Surfaces three backend endpoints under /api/system/. No mock data, no
 * synthesized prose — each panel renders empty-state when its source is
 * unreachable, never invents content. The Geist italic eyebrow is the
 * Dossier Console signature.
 */
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'

const llmQueue = useQuery({
  queryKey: ['system', 'llm-queue'],
  queryFn: api.system.llmQueue,
  refetchInterval: 4000,
  staleTime: 2000,
})

const ollamaPs = useQuery({
  queryKey: ['system', 'ollama-ps'],
  queryFn: api.system.ollamaPs,
  refetchInterval: 8000,
  staleTime: 4000,
})

const agentic = useQuery({
  queryKey: ['system', 'agentic-sessions'],
  queryFn: api.system.agenticSessions,
  refetchInterval: 4000,
  staleTime: 2000,
})

const tiers = computed(() => {
  const t = llmQueue.data.value?.tiers
  if (!t) return []
  return (['vision', 'heavy', 'light', 'tiny'] as const).map((k) => ({
    key: k,
    cap: t[k]?.cap ?? 0,
    inflight: t[k]?.inflight ?? 0,
  }))
})

const ollamaHost = computed(() => {
  const h = ollamaPs.data.value?.host ?? ''
  return h.replace(/^https?:\/\//, '') || '—'
})

const totalVramGb = computed(() => {
  const b = ollamaPs.data.value?.total_vram_bytes ?? 0
  return b > 0 ? (b / 1024 ** 3).toFixed(1) : null
})

const loadedModels = computed(() => ollamaPs.data.value?.models ?? [])

function modelVramGb(size_vram?: number) {
  if (!size_vram) return null
  return (size_vram / 1024 ** 3).toFixed(1)
}

function shortName(name: string) {
  return name.length > 28 ? name.slice(0, 26) + '…' : name
}

function fmtTtl(seconds: number | null | undefined) {
  if (seconds == null || seconds < 0) return '—'
  if (seconds < 60) return `${seconds}d`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${seconds % 60}d`
  const h = Math.floor(m / 60)
  return `${h}j ${m % 60}m`
}

function elapsed(iso: string | null) {
  if (!iso) return '—'
  try {
    const start = new Date(iso).getTime()
    if (Number.isNaN(start)) return '—'
    const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
    return fmtTtl(sec)
  } catch {
    return '—'
  }
}

function tierLabel(k: string) {
  return ({ vision: 'VISI', heavy: 'BERAT', light: 'RINGAN', tiny: 'MIKRO' } as const)[
    k as 'vision' | 'heavy' | 'light' | 'tiny'
  ] ?? k.toUpperCase()
}

const ollamaUnreachable = computed(() => {
  const s = ollamaPs.data.value?.status
  return s && s !== 'ok'
})

const agenticEmpty = computed(() => (agentic.data.value?.sessions?.length ?? 0) === 0)
</script>

<template>
  <section class="health-board">
    <!-- Editorial section anchor — Geist italic eyebrow + rule -->
    <header class="board-head">
      <div class="head-left">
        <span class="head-eyebrow">/ Pemantauan</span>
        <h2 class="head-title">Mesin <span class="title-sep">·</span> Sistem Hidup</h2>
      </div>
      <div class="head-right">
        <span class="label label-mute">Refresh setiap 4 detik</span>
        <span class="dot dot-amber pulse-amber" aria-hidden="true"></span>
      </div>
    </header>

    <div class="board-grid">

      <!-- ──────────── GPU / Ollama ──────────── -->
      <article class="panel">
        <header class="panel-head">
          <span class="panel-eyebrow">i · Mesin Penghuni</span>
          <h3 class="panel-title">Ollama VRAM</h3>
        </header>

        <div class="panel-body">
          <div class="host-row">
            <span class="label label-mute">Host</span>
            <code class="host-val">{{ ollamaHost }}</code>
          </div>

          <div v-if="ollamaUnreachable" class="empty-line">
            <span class="label label-mute">{{
              ollamaPs.data.value?.status === 'timeout' ? 'Daemon tidak menjawab dalam 3 detik' :
              ollamaPs.data.value?.status === 'unavailable' ? 'Provider bukan Ollama' :
              'Daemon tidak terjangkau'
            }}</span>
          </div>

          <template v-else>
            <div class="vram-headline">
              <span class="vram-num">{{ totalVramGb ?? '0.0' }}</span>
              <span class="vram-unit">GB · VRAM</span>
            </div>

            <ul class="model-list" v-if="loadedModels.length">
              <li v-for="m in loadedModels" :key="m.name" class="model-item">
                <span class="model-name" :title="m.name">{{ shortName(m.name) }}</span>
                <span class="model-vram">{{ modelVramGb(m.size_vram) ?? '—' }}<span class="model-vram-u">GB</span></span>
              </li>
            </ul>
            <div v-else class="empty-line">
              <span class="label label-mute">Tidak ada model termuat</span>
            </div>
          </template>
        </div>
      </article>

      <!-- ──────────── LLM Queue tiers ──────────── -->
      <article class="panel">
        <header class="panel-head">
          <span class="panel-eyebrow">ii · Antrean Pikiran</span>
          <h3 class="panel-title">LLM Concurrency</h3>
        </header>

        <div class="panel-body">
          <div class="queue-meta">
            <span class="label label-mute">{{ llmQueue.data.value?.enabled ? 'AKTIF' : 'BYPASS' }}</span>
            <span class="label label-mute" v-if="llmQueue.data.value?.source === 'no_redis'">redis offline</span>
          </div>

          <ul class="tier-list">
            <li v-for="t in tiers" :key="t.key" class="tier-row">
              <span class="tier-label">{{ tierLabel(t.key) }}</span>
              <div class="tier-bar">
                <span
                  class="tier-bar-fill"
                  :style="{ width: t.cap > 0 ? `${Math.min(100, (t.inflight / t.cap) * 100)}%` : '0%' }"
                ></span>
              </div>
              <span class="tier-count">
                <span class="tier-now">{{ t.inflight }}</span>
                <span class="tier-cap">/ {{ t.cap }}</span>
              </span>
            </li>
          </ul>
        </div>
      </article>

      <!-- ──────────── Agentic sessions ──────────── -->
      <article class="panel">
        <header class="panel-head">
          <span class="panel-eyebrow">iii · Tangan di Browser</span>
          <h3 class="panel-title">Sesi Agentic</h3>
        </header>

        <div class="panel-body">
          <div class="queue-meta">
            <span class="label" :class="agenticEmpty ? 'label-mute' : 'label-amber'">
              {{ agenticEmpty ? 'IDLE' : `${agentic.data.value?.sessions.length} BERJALAN` }}
            </span>
            <span class="label label-crit" v-if="agentic.data.value?.stop_requested">stop diminta</span>
          </div>

          <div v-if="agenticEmpty" class="empty-line">
            <span class="label label-mute">Tidak ada container memegang lock</span>
          </div>
          <ul v-else class="session-list">
            <li v-for="s in agentic.data.value?.sessions ?? []" :key="s.host" class="session-row">
              <span class="session-host">{{ s.host }}</span>
              <div class="session-meta">
                <span class="session-elapsed">{{ elapsed(s.started_at) }}</span>
                <span class="session-ttl">ttl {{ fmtTtl(s.lock_ttl_seconds) }}</span>
              </div>
            </li>
          </ul>
        </div>
      </article>

    </div>
  </section>
</template>

<style scoped>
.health-board {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Section anchor — newspaper masthead */
.board-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 20px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
}
.head-left { display: flex; flex-direction: column; gap: 2px; }
.head-eyebrow {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 14, 'SOFT' 100;
  font-style: italic;
  font-weight: 500;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgb(var(--ink-2));
}
.head-title {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 0;
  font-weight: 600;
  font-size: 30px;
  letter-spacing: -0.025em;
  color: rgb(var(--ink));
  line-height: 1.05;
  margin: 0;
}
.title-sep {
  color: rgb(var(--amber));
  font-variation-settings: 'opsz' 144, 'SOFT' 100;
  font-style: italic;
  margin: 0 0.15em;
}
.head-right { display: flex; align-items: center; gap: 8px; }

/* Three floating glass panels, separated by air not lines. */
.board-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 18px 20px 20px;
  background:
    radial-gradient(ellipse 120% 90% at 12% 0%, rgb(var(--rule) / 0.18) 0%, transparent 55%),
    linear-gradient(135deg, rgb(var(--surface) / 0.62) 0%, rgb(var(--surface) / 0.34) 100%);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 0;
  border-radius: var(--radius);
  box-shadow:
    inset 0 1px 0 rgb(var(--rule) / 0.28),
    inset 0 -1px 0 rgb(var(--rule) / 0.06),
    var(--shadow-card);
  isolation: isolate;
  overflow: hidden;
  transition: transform 360ms var(--ease-out), box-shadow 360ms var(--ease-out);
}
.panel:hover {
  transform: translateY(-3px);
  box-shadow:
    inset 0 1px 0 rgb(var(--rule) / 0.38),
    inset 0 -1px 0 rgb(var(--rule) / 0.10),
    var(--shadow-card-hover);
}
@media (max-width: 900px) {
  .board-grid { grid-template-columns: 1fr; }
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
}
.panel-eyebrow {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 14, 'SOFT' 100;
  font-style: italic;
  font-weight: 500;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: rgb(var(--ink-mute));
}
.panel-title {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 72, 'SOFT' 50;
  font-weight: 600;
  font-size: 19px;
  letter-spacing: -0.018em;
  color: rgb(var(--ink));
  margin: 0;
  line-height: 1.1;
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

/* GPU / Ollama */
.host-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.host-val {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11.5px;
  color: rgb(var(--ink-2));
  letter-spacing: -0.01em;
}
.vram-headline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
  padding-top: 10px;
}
.vram-num {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 144, 'SOFT' 50;
  font-weight: 500;
  font-size: 44px;
  letter-spacing: -0.04em;
  color: rgb(var(--amber));
  line-height: 1.05;
  padding-block: 4px;
  font-feature-settings: 'tnum', 'lnum';
}
.vram-unit {
  font-family: 'Geist Variable', system-ui, sans-serif;
  font-weight: 500;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}

.model-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.model-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed rgb(var(--rule) / var(--rule-alpha));
}
.model-item:last-child { border-bottom: 0; }
.model-name {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11.5px;
  color: rgb(var(--ink));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.model-vram {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  font-weight: 500;
  color: rgb(var(--amber));
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.model-vram-u {
  font-size: 9px;
  letter-spacing: 0.10em;
  color: rgb(var(--ink-mute));
  font-weight: 600;
  margin-left: 2px;
  text-transform: uppercase;
}

/* LLM Queue */
.queue-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.tier-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
  padding-top: 10px;
}
.tier-row {
  display: grid;
  grid-template-columns: 50px 1fr auto;
  align-items: center;
  gap: 10px;
}
.tier-label {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: rgb(var(--ink-mute));
}
.tier-bar {
  position: relative;
  height: 6px;
  background: rgb(var(--rule) / var(--rule-alpha));
  border-radius: 0;
  overflow: hidden;
}
.tier-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgb(var(--amber));
  transition: width 240ms var(--ease-out);
}
.tier-count {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-family: 'Geist Mono Variable', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.tier-now {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--ink));
}
.tier-cap {
  font-size: 11px;
  color: rgb(var(--ink-mute));
}

/* Agentic */
.session-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
  padding-top: 10px;
}
.session-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed rgb(var(--rule) / var(--rule-alpha));
}
.session-row:last-child { border-bottom: 0; }
.session-host {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--ink));
  letter-spacing: -0.01em;
}
.session-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}
.session-elapsed {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12.5px;
  font-weight: 500;
  color: rgb(var(--amber));
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.session-ttl {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  color: rgb(var(--ink-mute));
  letter-spacing: 0.04em;
}

.empty-line {
  padding: 10px 0;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
}
</style>
