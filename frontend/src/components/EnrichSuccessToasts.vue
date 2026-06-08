<script setup lang="ts">
// Snowglobe Phase 2 — bottom-right transient toast confirming each
// successfully-persisted vendor. Polls /system/enrich-success-feed every
// 4s; new events surface as fading cards (6s lifespan), clickable to the
// vendor detail page. Stacks max 3, oldest auto-evicts.
//
// Visual: amber accent for fresh, fades to ink-mute. Numbers show Scope ·
// Data · Eff so the operator sees the truthful triplet at a glance.

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import type { EnrichSuccessEvent } from '@/api/types'

const router = useRouter()
const MAX_VISIBLE = 3
const TOAST_TTL_MS = 6000
const POLL_INTERVAL_MS = 4000

interface ToastEntry extends EnrichSuccessEvent {
  // local id so Vue's :key is stable across re-renders.
  uid: string
  shownAt: number
}

const queue = ref<ToastEntry[]>([])
const lastSeen = ref<number>(0)
let pollTimer: number | null = null
let tickTimer: number | null = null

function evictExpired() {
  const now = Date.now()
  queue.value = queue.value.filter((t) => now - t.shownAt < TOAST_TTL_MS)
}

async function poll() {
  try {
    const res = await api.system.enrichSuccessFeed(lastSeen.value, 10)
    if (!res?.items?.length) return
    // events arrive newest-first; reverse so the visually-stacked oldest
    // is at the top — feels more natural than a top-loading flicker.
    const ordered = [...res.items].reverse()
    const now = Date.now()
    for (const ev of ordered) {
      if (ev.ts <= lastSeen.value) continue
      lastSeen.value = Math.max(lastSeen.value, ev.ts)
      queue.value.push({
        ...ev,
        uid: `${ev.vendor_id}-${ev.ts}`,
        shownAt: now,
      })
    }
    if (queue.value.length > MAX_VISIBLE) {
      queue.value = queue.value.slice(-MAX_VISIBLE)
    }
  } catch {
    /* network hiccup, retry next tick */
  }
}

function onClickToast(t: ToastEntry) {
  // Dismiss immediately on navigate so the toast doesn't linger over the
  // detail page.
  queue.value = queue.value.filter((x) => x.uid !== t.uid)
  router.push(`/vendors/${t.vendor_id}`)
}

function dismiss(t: ToastEntry) {
  queue.value = queue.value.filter((x) => x.uid !== t.uid)
}

function tone(eff: number, data: number): 'ok' | 'mid' | 'thin' {
  if (eff >= 60 && data >= 60) return 'ok'
  if (eff < 30 || data < 30) return 'thin'
  return 'mid'
}

onMounted(() => {
  // First poll uses since=now-30s so the operator sees recent activity
  // immediately on page load without backfilling the entire buffer.
  lastSeen.value = Date.now() / 1000 - 30
  void poll()
  pollTimer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
  tickTimer = window.setInterval(evictExpired, 500)
})

onUnmounted(() => {
  if (pollTimer != null) window.clearInterval(pollTimer)
  if (tickTimer != null) window.clearInterval(tickTimer)
})

const visible = computed(() => queue.value.slice(0, MAX_VISIBLE))
</script>

<template>
  <Teleport to="body">
    <div class="est-stack" aria-live="polite">
      <TransitionGroup name="est">
        <button
          v-for="t in visible"
          :key="t.uid"
          class="est-card"
          :data-tone="tone(t.eff, t.data)"
          :title="`Klik untuk buka detail ${t.company_name}`"
          @click="onClickToast(t)"
        >
          <span class="est-pulse" aria-hidden="true" />
          <div class="est-body">
            <div class="est-row1">
              <span class="est-tag">ENRICHED</span>
              <span class="est-name">{{ t.company_name }}</span>
            </div>
            <div class="est-row2">
              <span v-if="t.domain" class="est-domain">{{ t.domain }}</span>
              <span class="est-nums num-display">
                S {{ t.scope }} · D {{ t.data }} · <b>E {{ t.eff }}</b>
              </span>
            </div>
            <div v-if="t.catalog_count || t.has_email || t.has_phone" class="est-row3">
              <span v-if="t.has_email" class="est-mini">EML</span>
              <span v-if="t.has_phone" class="est-mini">TLP</span>
              <span v-if="t.catalog_count" class="est-mini">KAT·{{ t.catalog_count }}</span>
            </div>
          </div>
          <span class="est-close" @click.stop="dismiss(t)" :title="`Tutup`">×</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.est-stack {
  position: fixed;
  bottom: 18px;
  right: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9000;
  pointer-events: none;
}
.est-card {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 10px;
  min-width: 280px;
  max-width: 340px;
  padding: 8px 28px 8px 12px;
  background: var(--c-surface, #0e0f12);
  border: 1px solid var(--c-rule, #1f2228);
  border-radius: 4px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  color: var(--c-ink, #d6d7da);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 120ms ease, transform 120ms ease;
}
.est-card:hover { border-color: var(--c-amber, #f5b53a); transform: translateY(-1px); }
.est-card[data-tone="ok"]   { border-left: 3px solid var(--c-ok, #5ed27f); }
.est-card[data-tone="mid"]  { border-left: 3px solid var(--c-amber, #f5b53a); }
.est-card[data-tone="thin"] { border-left: 3px solid var(--c-ink-mute, #6b6e74); }
.est-pulse {
  position: absolute;
  top: 8px; left: -1px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--c-amber, #f5b53a);
  box-shadow: 0 0 8px var(--c-amber, #f5b53a);
  animation: est-pulse 1.4s ease-in-out infinite;
}
@keyframes est-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%      { opacity: 1.0; transform: scale(1.0); }
}
.est-body { flex: 1; min-width: 0; }
.est-row1 { display: flex; align-items: center; gap: 6px; }
.est-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 1px 5px;
  background: var(--c-amber, #f5b53a);
  color: var(--c-bg, #0a0b0d);
  border-radius: 2px;
}
.est-name {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.est-row2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--c-ink-2, #a0a3a8);
}
.est-domain {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
  font-family: monospace;
}
.est-nums { font-size: 10.5px; }
.est-nums b { color: var(--c-amber, #f5b53a); font-weight: 700; }
.est-row3 { display: flex; gap: 4px; margin-top: 3px; }
.est-mini {
  font-size: 9px;
  padding: 1px 4px;
  border: 1px solid var(--c-rule, #1f2228);
  border-radius: 2px;
  color: var(--c-ink-mute, #6b6e74);
  letter-spacing: 0.05em;
}
.est-close {
  position: absolute;
  top: 4px; right: 6px;
  font-size: 14px;
  line-height: 1;
  color: var(--c-ink-mute, #6b6e74);
  cursor: pointer;
  padding: 2px 4px;
}
.est-close:hover { color: var(--c-amber, #f5b53a); }

/* Enter from right, leave fading down. */
.est-enter-active { transition: transform 240ms cubic-bezier(0.2, 0.6, 0.2, 1), opacity 240ms; }
.est-leave-active { transition: transform 320ms ease-in, opacity 320ms ease-in; }
.est-enter-from { transform: translateX(40px); opacity: 0; }
.est-leave-to   { transform: translateY(8px); opacity: 0; }
</style>
