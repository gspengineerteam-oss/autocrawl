<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { api } from '@/api/client'
import type { Vendor, Expo } from '@/api/types'
import HudThemeToggle from '@/components/HudThemeToggle.vue'
import VendorCard from '@/components/VendorCard.vue'

/**
 * Operator topbar - mission-control density.
 *
 *   [A AUTOCRAWL/OPS] [⌘K Cari…] [●LIVE 3W ▮▮▮▱▱▱▱▱ 12m] [09 MAY 12:48:53] [ENGAGE] [☀]
 *     brand+badge       search       live status meter     date+time clock   action  theme
 *
 * Inline live worker meter shows real /orchestrator/throughput data:
 * filled cells = current active workers out of 8-cell visual capacity.
 * Run duration counter ticks every second when active.
 */

const router = useRouter()
const queryClient = useQueryClient()

/* ------------------------------------------------------------------ */
/* Live clock + run state                                               */
/* ------------------------------------------------------------------ */
const now = ref(new Date())
let tickHandle = 0
onMounted(() => { tickHandle = window.setInterval(() => { now.value = new Date() }, 1000) })
onBeforeUnmount(() => { if (tickHandle) window.clearInterval(tickHandle) })

const dateLabel = computed(() => {
  const d = now.value
  const day = String(d.getDate()).padStart(2, '0')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${day} ${months[d.getMonth()]}`
})
const clockHMS = computed(() => {
  const h = String(now.value.getHours()).padStart(2, '0')
  const m = String(now.value.getMinutes()).padStart(2, '0')
  const s = String(now.value.getSeconds()).padStart(2, '0')
  return { h, m, s }
})

const activeQuery = useQuery({
  queryKey: ['runs', 'active'],
  queryFn: api.activeRun,
  refetchInterval: 5000,
})
const throughputQuery = useQuery({
  queryKey: ['orchestrator', 'throughput', 'topbar'],
  queryFn: () => api.orchestrator.throughput(60),
  refetchInterval: 4000,
})
const currentQuery = useQuery({
  queryKey: ['orchestrator', 'current', 'topbar'],
  queryFn: api.orchestrator.current,
  refetchInterval: 4000,
})

const isRunning = computed(() => Boolean(activeQuery.data.value?.active))
const stopRequested = computed(() => {
  const a = activeQuery.data.value?.active as { stop_requested?: boolean } | null | undefined
  return Boolean(a?.stop_requested)
})

const workerCount = computed(() => throughputQuery.data.value?.active_workers_total ?? 0)

const runDuration = computed(() => {
  const startedAt = currentQuery.data.value?.active_run?.started_at
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return null
  const sec = Math.max(0, Math.floor((now.value.getTime() - start) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}j ${m}m`
  return `${m}m ${sec % 60}d`
})

const submitting = ref(false)
const showModeMenu = ref(false)

async function trigger(mode: 'dev' | 'normal' | 'aggressive' = 'normal') {
  showModeMenu.value = false
  if (isRunning.value || submitting.value) return
  submitting.value = true
  try {
    await api.triggerRun(mode)
    toast.success('Operasi diluncurkan', { description: `Mode ${mode.toUpperCase()} berjalan di background.` })
    ;['runs','vendors','expos','pdfs','overview','stats','exhibitor-refs'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    )
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } }
    if (e.response?.status === 409) toast.warning('Operasi masih aktif')
    else toast.error('Gagal meluncurkan operasi')
  } finally { submitting.value = false }
}

/* ------------------------------------------------------------------ */
/* Omnisearch                                                           */
/* ------------------------------------------------------------------ */
const search = ref('')
const debouncedTerm = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const searchWrap = ref<HTMLDivElement | null>(null)
const searchOpen = ref(false)
const searchLoading = ref(false)
const vendorResults = ref<Array<Vendor & { similarity?: number | null }>>([])
const expoResults = ref<Expo[]>([])
const activeIdx = ref(-1)
const searchDegraded = ref(false)
const searchMode = ref<'semantic' | 'lexical' | 'semantic_empty_fallback' | null>(null)

const flatResults = computed(() => {
  const out: Array<{ kind: 'vendor' | 'expo'; v?: Vendor; e?: Expo }> = []
  for (const v of vendorResults.value) out.push({ kind: 'vendor', v })
  for (const e of expoResults.value) out.push({ kind: 'expo', e })
  return out
})

const setDebounced = useDebounceFn((value: string) => { debouncedTerm.value = value }, 250)
watch(search, (v) => { setDebounced(v.trim()); activeIdx.value = -1 })

watch(debouncedTerm, async (term) => {
  if (term.length < 2) {
    vendorResults.value = []
    expoResults.value = []
    searchLoading.value = false
    searchDegraded.value = false
    searchMode.value = null
    return
  }
  searchLoading.value = true
  try {
    const [vRes, eRes] = await Promise.all([
      api
        .vendorsSemantic(term, 6)
        .catch(() => ({ items: [] as Array<Vendor & { similarity: number | null }>, degraded: false, mode: 'semantic' as const, query: term, limit: 6 })),
      api.expos({ search: term, limit: 6 }).catch(() => ({ items: [] as Expo[] } as { items: Expo[] })),
    ])
    vendorResults.value = (vRes.items ?? []) as Array<Vendor & { similarity?: number | null }>
    expoResults.value = (eRes.items ?? []) as Expo[]
    searchDegraded.value = vRes.degraded ?? false
    searchMode.value = vRes.mode ?? null
  } finally { searchLoading.value = false }
})

function focusSearch() { searchInput.value?.focus(); searchOpen.value = true }
function closeSearch() { searchOpen.value = false; activeIdx.value = -1 }

function selectVendor(v: Vendor) {
  const target = v.vendor_id || v.domain
  if (!target) return
  router.push(`/vendors/${encodeURIComponent(target)}`)
  search.value = ''
  closeSearch()
}
function selectExpo(e: Expo) {
  router.push(`/expos/${encodeURIComponent(e.expo_id)}`)
  search.value = ''
  closeSearch()
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { closeSearch(); searchInput.value?.blur(); return }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (flatResults.value.length === 0) return
    activeIdx.value = (activeIdx.value + 1) % flatResults.value.length
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (flatResults.value.length === 0) return
    activeIdx.value = activeIdx.value <= 0 ? flatResults.value.length - 1 : activeIdx.value - 1
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const idx = activeIdx.value >= 0 ? activeIdx.value : 0
    const item = flatResults.value[idx]
    if (!item) return
    if (item.kind === 'vendor' && item.v) selectVendor(item.v)
    else if (item.kind === 'expo' && item.e) selectExpo(item.e)
  }
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); focusSearch()
  }
}
onMounted(() => { window.addEventListener('keydown', onGlobalKeyDown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onGlobalKeyDown) })

useEventListener('click', (e: MouseEvent) => {
  if (!searchWrap.value) return
  if (!searchWrap.value.contains(e.target as Node)) closeSearch()
})
</script>

<template>
  <header class="autocrawl-topbar rule-b bg-bg relative z-50 flex h-[64px] shrink-0 items-stretch">
    <!-- Brand block - hex monogram + wordmark + path -->
    <div class="flex w-[220px] shrink-0 items-center gap-3 px-5 rule-r">
      <!-- Hex monogram -->
      <div class="relative shrink-0">
        <svg width="34" height="34" viewBox="0 0 34 34">
          <polygon points="17,2 31,9.5 31,24.5 17,32 3,24.5 3,9.5"
                   fill="#FFB840" stroke="#FF9230" stroke-width="0.8"/>
          <text x="17" y="22" text-anchor="middle"
                font-family="Geist Variable, system-ui"
                font-weight="800" font-size="14"
                fill="#0A1525" style="letter-spacing:-0.04em">AC</text>
        </svg>
        <!-- Live indicator dot on hex corner -->
        <span
          v-if="isRunning"
          class="absolute -top-0.5 -right-0.5 dot dot-amber dot-glow blink"
          style="width:8px;height:8px"
        ></span>
      </div>
      <div class="flex flex-col leading-[1.0] min-w-0">
        <!-- Geist variable serif at display opsz; the masthead, not a label. -->
        <span class="brand-wordmark text-ink">Autocrawl</span>
        <span class="brand-eyebrow text-amber">/ Ops &middot; Overview</span>
      </div>
    </div>

    <!-- Search -->
    <div ref="searchWrap" class="flex flex-1 items-center px-5 relative min-w-0">
      <div class="flex w-full items-center gap-3">
        <FaIcon :icon="['fas', 'star']" class="text-[12px] text-amber" />
        <input
          ref="searchInput"
          v-model="search"
          type="text"
          placeholder="Cari berdasarkan keahlian, produk, atau industri"
          class="flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-ink-mute text-ink"
          autocomplete="off"
          spellcheck="false"
          @focus="searchOpen = true"
          @keydown="onSearchKeydown"
        />
        <span v-if="searchLoading" class="dot dot-amber pulse-amber"></span>
        <span v-if="searchDegraded" class="topbar-degraded-chip">Cadangan Leksikal</span>
        <kbd class="text-[10px] tracking-widest border border-rule-strong px-1.5 py-0.5 text-ink-mute" style="border-radius: 3px;">⌘K</kbd>
      </div>

      <!-- Results dropdown -->
      <div
        v-if="searchOpen && search.trim().length >= 2"
        class="absolute left-5 right-5 top-[3.6rem] z-[60] card shadow-[0_18px_40px_rgb(0_0_0/0.55)] max-h-[26rem] overflow-y-auto"
      >
        <div v-if="vendorResults.length > 0">
          <div class="px-4 py-2 rule-b flex items-baseline justify-between">
            <span class="label">Vendor</span>
            <span class="label label-mute">{{ vendorResults.length }}</span>
          </div>
          <div
            v-for="(v, i) in vendorResults"
            :key="`v-${v.vendor_id}`"
            class="topbar-result-wrap rule-b last:border-b-0"
            :class="activeIdx === i ? 'bg-surface-2' : ''"
            @mouseenter="activeIdx = i"
          >
            <VendorCard
              :vendor="{
                vendor_id: v.vendor_id,
                company_name: v.company_name || v.domain || '(tanpa nama)',
                domain: v.domain,
                logo_url: v.logo_url,
                industries: v.industries ?? [],
                enrichment_gap: v.enrichment_gap ?? [],
                country: v.address?.country ?? v.registrar_country ?? null,
                similarity: v.similarity ?? undefined,
              }"
              size="compact"
              :show-enrichment="true"
              :industry-limit="2"
              @click="selectVendor(v)"
            />
          </div>
        </div>

        <div v-if="expoResults.length > 0" :class="vendorResults.length > 0 ? 'rule-t' : ''">
          <div class="px-4 py-2 rule-b flex items-baseline justify-between">
            <span class="label">Ekspo</span>
            <span class="label label-mute">{{ expoResults.length }}</span>
          </div>
          <button
            v-for="(e, i) in expoResults"
            :key="`e-${e.expo_id}`"
            class="w-full text-left px-4 py-2.5 rule-b last:border-b-0 hover:bg-surface-2/60"
            :class="activeIdx === vendorResults.length + i ? 'bg-surface-2' : ''"
            @click="selectExpo(e)"
            @mouseenter="activeIdx = vendorResults.length + i"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-[14px] text-ink truncate">{{ e.name }}</span>
              <span v-if="e.country" class="label label-mute shrink-0">{{ e.country }}</span>
            </div>
            <div v-if="e.location || e.start_date" class="mt-0.5 flex items-baseline gap-2">
              <span v-if="e.location" class="text-[12px] text-ink-2 truncate">{{ e.location }}</span>
              <span v-if="e.start_date" class="label label-mute">{{ e.start_date }}</span>
            </div>
          </button>
        </div>

        <div
          v-if="!searchLoading && vendorResults.length === 0 && expoResults.length === 0"
          class="px-4 py-6 text-center"
        >
          <span class="label label-mute">Tiada hasil untuk "{{ search.trim() }}"</span>
        </div>
      </div>
    </div>

    <!-- Live status cluster - compact: dot · LABEL · count · duration -->
    <div class="flex items-center px-3 gap-2 rule-l">
      <span class="dot dot-glow" :class="isRunning ? 'dot-amber pulse-amber' : 'dot-mute'"></span>
      <span class="label" :class="isRunning ? 'label-amber' : 'label-mute'">
        {{ isRunning ? 'LIVE' : 'IDLE' }}
      </span>
      <span class="text-ink-mute text-[10px] leading-none select-none" aria-hidden="true">·</span>
      <span class="num-display text-[12.5px] tabular-nums leading-none"
            :class="workerCount > 0 ? 'num-amber' : 'text-ink-mute'">
        {{ workerCount }}<span class="text-[9.5px] ml-0.5"
                                :class="workerCount > 0 ? 'text-amber/70' : 'text-ink-mute'">W</span>
      </span>
      <template v-if="runDuration">
        <span class="text-ink-mute text-[10px] leading-none select-none" aria-hidden="true">·</span>
        <span class="num-display text-[12px] text-ink-2 tabular-nums leading-none">
          {{ runDuration }}
        </span>
      </template>
    </div>

    <!-- Date + Time block -->
    <div class="flex items-center px-4 gap-3 rule-l">
      <span class="num-display text-[10.5px] tracking-[0.18em] text-ink-mute font-semibold">{{ dateLabel }}</span>
      <div class="flex items-baseline gap-0.5">
        <span class="num-display text-[16px] font-medium">{{ clockHMS.h }}</span>
        <span class="text-ink-mute text-[16px] blink">:</span>
        <span class="num-display text-[16px] font-medium">{{ clockHMS.m }}</span>
        <span class="text-ink-mute text-[16px] blink">:</span>
        <span class="num-display text-[14px] text-ink-mute">{{ clockHMS.s }}</span>
      </div>
    </div>

    <!-- Engage SPLIT button - clearly two halves divided by a hairline -->
    <div class="flex items-center px-3 rule-l relative">
      <div
        class="split-btn"
        :class="[
          isRunning || submitting ? 'is-disabled' : '',
          isRunning && !stopRequested ? 'is-running' : '',
          stopRequested ? 'is-stopping' : '',
        ]"
      >
        <button
          class="split-btn-main"
          :disabled="isRunning || submitting"
          @click="trigger('normal')"
        >
          <FaIcon
            :icon="['fas', submitting ? 'circle-notch' : (isRunning ? 'tower-broadcast' : 'play')]"
            :class="submitting ? 'animate-spin text-[10px]' : 'text-[10px]'"
          />
          <span>{{ isRunning ? (stopRequested ? 'STOP…' : 'BERJALAN') : 'ENGAGE' }}</span>
        </button>
        <span class="split-btn-divider" aria-hidden="true"></span>
        <button
          class="split-btn-menu"
          :disabled="isRunning || submitting"
          aria-label="Pilih mode"
          :aria-expanded="showModeMenu"
          @click="showModeMenu = !showModeMenu"
        >
          <FaIcon :icon="['fas', 'chevron-down']" class="text-[10px]" />
        </button>
      </div>
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showModeMenu"
          class="absolute right-3 top-[3.6rem] z-[55] w-56 card shadow-[0_18px_40px_rgb(0_0_0/0.55)]"
        >
          <button class="flex w-full items-center justify-between px-4 py-2.5 text-left rule-b hover:bg-surface-2" @click="trigger('dev')">
            <span class="label label-ink text-[12px]">Dev</span>
            <span class="label label-mute">Sampel kecil</span>
          </button>
          <button class="flex w-full items-center justify-between px-4 py-2.5 text-left rule-b hover:bg-surface-2" @click="trigger('normal')">
            <span class="label label-ink text-[12px]">Normal</span>
            <span class="label label-mute">Default</span>
          </button>
          <button class="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-surface-2" @click="trigger('aggressive')">
            <span class="label label-ink text-[12px]">Agresif</span>
            <span class="label label-mute">Full throttle</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- Theme toggle - sun (current dark, click for light) / moon (current light, click for dark).
         Lives in its own rule-l cluster at the far right per the header layout doc above. -->
    <div class="flex items-center px-3 rule-l">
      <HudThemeToggle />
    </div>

  </header>
</template>

<style scoped>
/* Editorial masthead — Geist variable serif. Lowercase, italic-leaning
 * via SOFT axis; the Dossier Console wordmark signature. */
.brand-wordmark {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 0;
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.025em;
  line-height: 0.95;
}
.brand-eyebrow {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 14, 'SOFT' 100;
  font-style: italic;
  font-weight: 500;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  margin-top: 1px;
}
.topbar-result-wrap {
  cursor: pointer;
  transition: background var(--dur-160) var(--ease-out);
}
.topbar-result-wrap:hover {
  background: rgb(var(--surface-2) / 0.6);
}
.topbar-degraded-chip {
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: var(--tracking-stencil);
  text-transform: uppercase;
  color: rgb(var(--warn));
  border: 1px solid rgb(var(--warn) / 0.4);
  background: rgb(var(--warn) / 0.06);
  padding: 3px 7px;
  border-radius: 2px;
}
</style>
