<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import type { AgentTrace } from '@/api/types'

/**
 * Agent reasoning trace — refined-cinematic register.
 *
 * Each trace entry is rendered as an iconic, animated row:
 *   - 36px tinted-gold circle with kind-specific inline SVG glyph
 *   - Apple-style ultra-light stroke (1.5 stroke-width)
 *   - Fresh entries ripple gold for 4s after first sight
 *   - Hover-lift with action affordance reveal
 *   - Verdict chips animate (success sweeps in, fail shakes)
 *   - JSON payload renders as a clean key/value grid
 *
 * Polls /orchestrator/agent-traces every 2s. Auto-scrolls to bottom
 * unless operator has scrolled up. Real data only.
 */

const tracesQ = useQuery({
  queryKey: ['orchestrator', 'agent-traces'],
  queryFn: () => api.orchestrator.agentTraces(120),
  refetchInterval: 2000,
})

const items = computed<AgentTrace[]>(() => tracesQ.data.value?.items ?? [])

const scrollEl = ref<HTMLDivElement | null>(null)
const stickToBottom = ref(true)
const showJump = ref(false)
const hoverPaused = ref(false)

/* Fresh-entry tracking — mark traces seen within the last 4s with the
 * gold ripple. Stored as Map<ts, expiry-ms>. Cleaned on each poll. */
const seenTs = new Set<string>()
const freshTs = ref<Set<string>>(new Set())
const FRESH_WINDOW_MS = 4000
let primed = false

function reapFresh() {
  const now = Date.now()
  const next = new Set<string>()
  for (const ts of freshTs.value) {
    if (parseInt(ts.replace(/\D/g, '').slice(-13)) > now - FRESH_WINDOW_MS) next.add(ts)
  }
  freshTs.value = next
}

watch(items, async (next) => {
  if (!primed) {
    // First poll: mark all as seen but NOT fresh (otherwise every trace
    // on the initial load would ripple, which is meaningless noise).
    for (const t of next) seenTs.add(t.ts)
    primed = true
    return
  }
  const fresh = new Set(freshTs.value)
  for (const t of next) {
    if (!seenTs.has(t.ts)) {
      seenTs.add(t.ts)
      fresh.add(t.ts)
      // Schedule reap after fresh window
      setTimeout(() => {
        const f = new Set(freshTs.value)
        f.delete(t.ts)
        freshTs.value = f
      }, FRESH_WINDOW_MS)
    }
  }
  freshTs.value = fresh
  if (stickToBottom.value && !hoverPaused.value) await scrollToBottom(true)
}, { deep: false })

function isAtBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 32
}
function onScroll() {
  if (!scrollEl.value) return
  const atBottom = isAtBottom(scrollEl.value)
  stickToBottom.value = atBottom
  showJump.value = !atBottom
}
async function scrollToBottom(smooth = true) {
  await nextTick()
  if (!scrollEl.value) return
  scrollEl.value.scrollTo({
    top: scrollEl.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  })
  stickToBottom.value = true
  showJump.value = false
}

onMounted(() => { void scrollToBottom(false) })
onBeforeUnmount(() => {})

function trimText(t: AgentTrace): string {
  let s = t.text
  s = s.replace(/^[👍🧠🎯⚖️📍▶️⚠️📢✅❌👎\s]+/u, '')
  s = s.replace(/^(Eval|Memory|Next goal|Judge Verdict|Final Result|Step \d+):\s*/i, '')
  return s.trim()
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
interface ParsedTrace { prose: string; json: JsonValue | null; leftover: string }
function parseTraceText(raw: string): ParsedTrace {
  const start = raw.indexOf('{')
  if (start === -1) return { prose: raw, json: null, leftover: '' }
  let depth = 0
  let inString = false
  let escapeNext = false
  let end = -1
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]
    if (escapeNext) { escapeNext = false; continue }
    if (c === '\\') { escapeNext = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return { prose: raw, json: null, leftover: '' }
  const jsonStr = raw.substring(start, end + 1)
  const before = raw.substring(0, start).replace(/[\s:·,]+$/, '').trim()
  const after = raw.substring(end + 1).replace(/^[\s:·,]+/, '').trim()
  try {
    const parsed = JSON.parse(jsonStr) as JsonValue
    return { prose: before, json: parsed, leftover: after }
  } catch {
    return { prose: raw, json: null, leftover: '' }
  }
}
function formatJsonValue(v: JsonValue): string {
  if (v === null) return 'null'
  if (v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v.length === 0 ? '—' : v
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    if (v.every((x) => typeof x === 'string' || typeof x === 'number'))
      return v.map((x) => String(x)).join(', ')
    return `[${v.length} item${v.length === 1 ? '' : 's'}]`
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 0) return '{}'
    return `{${keys.length} key${keys.length === 1 ? '' : 's'}}`
  }
  return String(v)
}
function valueClass(v: JsonValue): string {
  if (v === null) return 'jv-null'
  if (typeof v === 'boolean') return v ? 'jv-true' : 'jv-false'
  if (typeof v === 'number') return 'jv-num'
  if (typeof v === 'string' && v.length === 0) return 'jv-empty'
  if (Array.isArray(v) && v.length === 0) return 'jv-empty'
  return 'jv-str'
}
function jsonEntries(j: JsonValue): Array<[string, JsonValue]> {
  if (j === null || typeof j !== 'object' || Array.isArray(j)) return []
  return Object.entries(j) as Array<[string, JsonValue]>
}

function kindLabel(k: AgentTrace['kind']): string {
  switch (k) {
    case 'eval':              return 'EVAL'
    case 'memory':            return 'MEMORY'
    case 'goal':              return 'GOAL'
    case 'judge':             return 'JUDGE'
    case 'result':            return 'RESULT'
    case 'action':            return 'ACTION'
    case 'step_header':       return 'STEP'
    case 'grounding':         return 'GROUNDING'
    case 'resolve_hit':       return 'RESOLVE'
    case 'jina_hit':          return 'JINA'
    case 'grounded_extract':  return 'CATALOG'
    default:                  return 'LOG'
  }
}
function kindTone(k: AgentTrace['kind']): 'ok' | 'cyan' | 'amber' | 'crit' | 'mute' {
  switch (k) {
    case 'eval':              return 'ok'
    case 'memory':            return 'cyan'
    case 'goal':              return 'amber'
    case 'judge':             return 'crit'
    case 'result':            return 'amber'
    case 'action':            return 'mute'
    case 'step_header':       return 'mute'
    case 'grounding':         return 'cyan'
    case 'resolve_hit':       return 'ok'
    case 'jina_hit':          return 'ok'
    case 'grounded_extract':  return 'amber'
    default:                  return 'mute'
  }
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}d`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}j`
}

function copyTrace(t: AgentTrace) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(t.text).catch(() => {})
  }
}

void reapFresh
</script>

<template>
  <article
    class="trace-panel"
    @mouseenter="hoverPaused = true"
    @mouseleave="hoverPaused = false"
  >
    <header class="trace-head">
      <div class="trace-head__left">
        <span class="live-dot" />
        <span class="trace-head__tag num">AGENT</span>
        <span class="label">Detail aktivitas</span>
      </div>
      <span class="trace-head__count num">
        {{ items.length }} jejak &middot; poll 2s
      </span>
    </header>

    <div
      ref="scrollEl"
      class="trace-scroll"
      @scroll="onScroll"
    >
      <!-- Empty state -->
      <div v-if="items.length === 0" class="trace-empty">
        <div class="trace-empty__glyph">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12a4 4 0 0 1 8 0M8 12a4 4 0 0 0 8 0" />
            <path d="M12 8v.01M12 16v.01" />
          </svg>
        </div>
        <span class="label label-mute">Tiada jejak agent</span>
        <span class="trace-empty__sub">
          Trigger ENGAGE, agen akan mulai berpikir &amp; jejaknya muncul di sini
        </span>
      </div>

      <!-- Trace rows -->
      <div
        v-for="t in items"
        :key="t.ts + '-' + t.kind"
        class="trace-row"
        :data-tone="kindTone(t.kind)"
        :data-fresh="freshTs.has(t.ts) ? 'true' : 'false'"
      >
        <!-- Icon medallion: tinted circle + kind glyph -->
        <div class="trace-icon">
          <span class="trace-icon__ring" aria-hidden="true" />
          <span class="trace-icon__core">
            <!-- EVAL — check-circle -->
            <svg v-if="t.kind === 'eval'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            <!-- MEMORY — stacked layers / archive -->
            <svg v-else-if="t.kind === 'memory'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h16v4H4zM4 12h16v4H4zM4 18h16" />
            </svg>
            <!-- GOAL — target crosshair -->
            <svg v-else-if="t.kind === 'goal'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
            <!-- JUDGE — gavel-like, two lines crossed -->
            <svg v-else-if="t.kind === 'judge'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19h16M7 19V8m10 11V8M5 6h14M9 6V4h6v2" />
            </svg>
            <!-- RESULT — flag -->
            <svg v-else-if="t.kind === 'result'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 21V4l8 3-2 4 2 4-8-3z" />
              <path d="M5 4v17" />
            </svg>
            <!-- ACTION — play triangle -->
            <svg v-else-if="t.kind === 'action'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 5v14l11-7z" />
            </svg>
            <!-- STEP_HEADER — numbered marker / chevron -->
            <svg v-else-if="t.kind === 'step_header'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <!-- GROUNDING — globe with grid -->
            <svg v-else-if="t.kind === 'grounding'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
            <!-- RESOLVE_HIT — target -->
            <svg v-else-if="t.kind === 'resolve_hit'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
            <!-- JINA_HIT — lightning bolt -->
            <svg v-else-if="t.kind === 'jina_hit'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
            </svg>
            <!-- GROUNDED_EXTRACT — book / catalog -->
            <svg v-else-if="t.kind === 'grounded_extract'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
              <path d="M7 8h9M7 12h9M7 16h6" />
            </svg>
            <!-- DEFAULT — dot -->
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <circle cx="12" cy="12" r="4" />
            </svg>
          </span>
        </div>

        <!-- Body -->
        <div class="trace-body">
          <div class="trace-meta">
            <span class="trace-meta__kind num">{{ kindLabel(t.kind) }}</span>
            <span class="trace-meta__sep">&middot;</span>
            <span class="trace-meta__agent">{{ t.agent }}</span>
            <span class="trace-meta__sep">&middot;</span>
            <span class="trace-meta__time num">{{ timeAgo(t.ts) }}</span>
            <span
              v-if="t.verdict === 'success'"
              class="trace-verdict trace-verdict--ok"
              :data-fresh="freshTs.has(t.ts) ? 'true' : 'false'"
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m2 6 3 3 5-7" />
              </svg>
              Berhasil
            </span>
            <span
              v-else-if="t.verdict === 'fail'"
              class="trace-verdict trace-verdict--crit"
              :data-fresh="freshTs.has(t.ts) ? 'true' : 'false'"
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 3 6 6M9 3l-6 6" />
              </svg>
              Gagal
            </span>

            <button class="trace-copy" type="button" @click="copyTrace(t)" aria-label="Copy">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
                <path d="M5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v6" />
              </svg>
            </button>
          </div>

          <template v-for="parsed in [parseTraceText(trimText(t))]" :key="t.ts + '-p'">
            <template v-if="parsed.json !== null">
              <p
                v-if="parsed.prose"
                class="trace-text"
                :class="{ 'text-crit': t.kind === 'judge' && t.verdict === 'fail' }"
              >{{ parsed.prose }}</p>
              <div class="json-grid">
                <template v-for="[k, v] in jsonEntries(parsed.json)" :key="k">
                  <span class="json-key">{{ k }}</span>
                  <span class="json-val" :class="valueClass(v)">{{ formatJsonValue(v) }}</span>
                </template>
              </div>
              <p v-if="parsed.leftover" class="trace-text trace-text--mute">{{ parsed.leftover }}</p>
            </template>
            <p
              v-else
              class="trace-text"
              :class="{ 'text-crit': t.kind === 'judge' && t.verdict === 'fail' }"
            >{{ trimText(t) }}</p>
          </template>
        </div>
      </div>
    </div>

    <!-- Jump-to-latest -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 translate-y-2"
    >
      <button
        v-if="showJump"
        type="button"
        class="trace-jump"
        @click="scrollToBottom(true)"
      >
        <span>Loncat ke terbaru</span>
        <span class="btn-icon-nest">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 2v9m0 0-4-4m4 4 4-4" />
          </svg>
        </span>
      </button>
    </Transition>
  </article>
</template>

<style scoped>
.trace-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 20px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

/* HEADER */
.trace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  flex-shrink: 0;
}
.trace-head__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.trace-head__tag {
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: rgb(var(--accent));
}
.trace-head__count {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgb(var(--ink-mute));
  text-transform: uppercase;
}

/* SCROLL CONTAINER */
.trace-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  scrollbar-width: thin;
}
.trace-scroll::-webkit-scrollbar { width: 6px; }
.trace-scroll::-webkit-scrollbar-thumb { background: rgb(var(--rule) / 0.18); border-radius: 9999px; }

/* EMPTY STATE */
.trace-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 16px;
  gap: 8px;
}
.trace-empty__glyph {
  width: 56px;
  height: 56px;
  border-radius: 9999px;
  background: rgb(var(--accent) / 0.08);
  border: 1px solid rgb(var(--accent) / 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--accent));
  margin-bottom: 4px;
}
.trace-empty__sub {
  font-size: 11px;
  color: rgb(var(--ink-mute));
  max-width: 260px;
  line-height: 1.5;
}

/* ROW — fades in, lifts on hover, ripples gold when fresh */
.trace-row {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 12px;
  padding: 10px 8px 12px;
  margin: 2px 0;
  border-radius: 14px;
  position: relative;
  animation: trace-enter 480ms cubic-bezier(0.32, 0.72, 0, 1) both;
  transition:
    background-color var(--dur-240) var(--ease-out),
    transform var(--dur-240) var(--ease-out);
}
.trace-row:hover {
  background: rgb(var(--surface-2) / 0.65);
  transform: translateY(-1px);
}
.trace-row:hover .trace-copy { opacity: 1; }

@keyframes trace-enter {
  0%   { opacity: 0; transform: translateY(8px) translateX(-4px); filter: blur(6px); }
  100% { opacity: 1; transform: translateY(0) translateX(0); filter: blur(0); }
}

/* Fresh entries: gold ripple ring on the icon, soft accent background glow */
.trace-row[data-fresh="true"] {
  background: linear-gradient(
    90deg,
    rgb(var(--accent) / 0.10) 0%,
    rgb(var(--accent) / 0.04) 50%,
    transparent 100%
  );
  animation: trace-enter 480ms cubic-bezier(0.32, 0.72, 0, 1) both,
             trace-fresh-fade 4s cubic-bezier(0.45, 0, 0.55, 1) 480ms forwards;
}
@keyframes trace-fresh-fade {
  0%   { background-color: rgb(var(--accent) / 0.12); }
  100% { background-color: transparent; }
}

/* ICON MEDALLION */
.trace-icon {
  position: relative;
  width: 40px;
  height: 40px;
}
.trace-icon__core {
  position: relative;
  z-index: 1;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--accent) / 0.10);
  border: 1px solid rgb(var(--accent) / 0.25);
  color: rgb(var(--accent));
  transition:
    transform var(--dur-240) var(--ease-out),
    background-color var(--dur-240) var(--ease-out),
    border-color var(--dur-240) var(--ease-out);
}
.trace-icon__core svg { width: 18px; height: 18px; }
.trace-row:hover .trace-icon__core {
  transform: scale(1.08) rotate(-2deg);
}

/* Ripple ring — visible only when row is fresh */
.trace-icon__ring {
  position: absolute;
  inset: -4px;
  border-radius: 16px;
  border: 1.5px solid rgb(var(--accent) / 0.45);
  opacity: 0;
  pointer-events: none;
}
.trace-row[data-fresh="true"] .trace-icon__ring {
  animation: ring-ripple 1.4s cubic-bezier(0.32, 0.72, 0, 1) infinite;
}
@keyframes ring-ripple {
  0%   { opacity: 0.9; transform: scale(0.85); }
  60%  { opacity: 0.2; transform: scale(1.25); }
  100% { opacity: 0;   transform: scale(1.45); }
}

/* Tone-driven recoloring of the medallion */
.trace-row[data-tone="ok"]    .trace-icon__core { background: rgb(var(--ok) / 0.10);    border-color: rgb(var(--ok) / 0.30);    color: rgb(var(--ok)); }
.trace-row[data-tone="cyan"]  .trace-icon__core { background: rgb(var(--cyan) / 0.10);  border-color: rgb(var(--cyan) / 0.30);  color: rgb(var(--cyan)); }
.trace-row[data-tone="crit"]  .trace-icon__core { background: rgb(var(--crit) / 0.10);  border-color: rgb(var(--crit) / 0.30);  color: rgb(var(--crit)); }
.trace-row[data-tone="mute"]  .trace-icon__core { background: rgb(var(--ink) / 0.05);   border-color: rgb(var(--rule) / var(--rule-strong-alpha)); color: rgb(var(--ink-mute)); }
/* amber is the default gold accent (already styled) */

/* Tone-driven ripple color for the fresh ring */
.trace-row[data-tone="ok"][data-fresh="true"]   .trace-icon__ring { border-color: rgb(var(--ok) / 0.55); }
.trace-row[data-tone="cyan"][data-fresh="true"] .trace-icon__ring { border-color: rgb(var(--cyan) / 0.55); }
.trace-row[data-tone="crit"][data-fresh="true"] .trace-icon__ring { border-color: rgb(var(--crit) / 0.55); }
.trace-row[data-tone="mute"][data-fresh="true"] .trace-icon__ring { border-color: rgb(var(--ink-mute) / 0.40); }

/* BODY */
.trace-body { min-width: 0; padding-top: 2px; }
.trace-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.trace-meta__kind {
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: rgb(var(--accent));
}
.trace-row[data-tone="ok"]   .trace-meta__kind { color: rgb(var(--ok)); }
.trace-row[data-tone="cyan"] .trace-meta__kind { color: rgb(var(--cyan)); }
.trace-row[data-tone="crit"] .trace-meta__kind { color: rgb(var(--crit)); }
.trace-row[data-tone="mute"] .trace-meta__kind { color: rgb(var(--ink-mute)); }

.trace-meta__sep { color: rgb(var(--ink-mute)); font-size: 10px; }
.trace-meta__agent {
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 10.5px;
  color: rgb(var(--ink-2));
  letter-spacing: 0.04em;
}
.trace-meta__time {
  font-size: 10px;
  color: rgb(var(--ink-mute));
  font-variant-numeric: tabular-nums;
}

/* Verdict chips — animated entry sweep / shake */
.trace-verdict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 9px;
  border-radius: 9999px;
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
.trace-verdict--ok {
  background: rgb(var(--ok) / 0.10);
  color: rgb(var(--ok));
  border: 1px solid rgb(var(--ok) / 0.30);
}
.trace-verdict--crit {
  background: rgb(var(--crit) / 0.10);
  color: rgb(var(--crit));
  border: 1px solid rgb(var(--crit) / 0.30);
}
.trace-verdict[data-fresh="true"].trace-verdict--ok {
  animation: verdict-sweep 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.trace-verdict[data-fresh="true"].trace-verdict--crit {
  animation: verdict-shake 480ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
@keyframes verdict-sweep {
  0%   { transform: scale(0.6) translateX(-8px); opacity: 0; filter: blur(4px); }
  60%  { transform: scale(1.08) translateX(0);   opacity: 1; filter: blur(0); }
  100% { transform: scale(1) translateX(0);      opacity: 1; }
}
@keyframes verdict-shake {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-3px); }
  40%, 60% { transform: translateX(3px); }
}

/* Copy chip — hidden by default, fades in on row hover */
.trace-copy {
  margin-left: 6px;
  width: 22px;
  height: 22px;
  border-radius: 8px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  background: rgb(var(--surface));
  color: rgb(var(--ink-mute));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--dur-160) var(--ease-out),
              color var(--dur-160) var(--ease-out),
              background-color var(--dur-160) var(--ease-out);
}
.trace-copy:hover {
  color: rgb(var(--accent));
  background: rgb(var(--accent) / 0.08);
  border-color: rgb(var(--accent) / 0.30);
}

/* TEXT */
.trace-text {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: rgb(var(--ink));
  word-break: break-word;
}
.trace-text--mute { color: rgb(var(--ink-mute)); font-size: 12px; margin-top: 6px; }
.text-crit { color: rgb(var(--crit)); }

/* JSON grid */
.json-grid {
  display: grid;
  grid-template-columns: minmax(72px, max-content) 1fr;
  gap: 2px 12px;
  margin-top: 8px;
  padding: 10px 12px;
  background: rgb(var(--surface-2) / 0.5);
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 10px;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
}
.json-key {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgb(var(--accent));
  padding: 2px 0;
  line-height: 1.45;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.json-val {
  font-size: 11.5px;
  line-height: 1.45;
  padding: 2px 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.json-val.jv-str   { color: rgb(var(--ink)); }
.json-val.jv-num   { color: rgb(var(--cyan)); font-variant-numeric: tabular-nums; }
.json-val.jv-true  { color: rgb(var(--ok));   font-weight: 600; }
.json-val.jv-false { color: rgb(var(--crit)); font-weight: 600; }
.json-val.jv-null  { color: rgb(var(--ink-mute)); font-style: italic; }
.json-val.jv-empty { color: rgb(var(--ink-mute)); }

/* JUMP CTA */
.trace-jump {
  position: absolute;
  bottom: 14px;
  right: 14px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 9999px;
  border: 1px solid rgb(var(--ink));
  background: rgb(var(--ink));
  color: rgb(var(--surface));
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  box-shadow: var(--shadow-card-hover);
  transition: transform var(--dur-160) var(--ease-out);
}
.trace-jump:hover { transform: translateY(-1px); }
.trace-jump .btn-icon-nest {
  background: rgb(var(--surface) / 0.18);
  width: 22px;
  height: 22px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: -4px;
}

@media (prefers-reduced-motion: reduce) {
  .trace-row,
  .trace-row[data-fresh="true"],
  .trace-icon__ring,
  .trace-verdict {
    animation: none !important;
  }
}
</style>
