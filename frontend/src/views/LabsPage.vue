<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import axios from 'axios'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { api } from '@/api/client'
import type { Fusion, FusionSuggestion, VendorCandidate } from '@/api/types'
import ConfirmCountdownModal from '@/components/ConfirmCountdownModal.vue'
import LabsFusionResult from '@/components/LabsFusionResult.vue'
import LabsSuggestionCard from '@/components/LabsSuggestionCard.vue'
import LabsVendorCard from '@/components/LabsVendorCard.vue'

/**
 * Labs — Fusion Composer, Bench archetype.
 *
 * Layout intent: split-canvas. LEFT 4-col sticky control rail with the
 * cinema-scale selected count + AI suggest CTA + search + filter + hint
 * + combine button. RIGHT 8-col composer canvas with suggestions, vendor
 * grid, and the live fusion result. No more tab-then-sequential-cards.
 *
 * Real data only: /labs/candidates, /labs/suggestions, /labs/fusions.
 */

type Tab = 'create' | 'history'
const activeTab = ref<Tab>('create')

const search = ref('')
const onlyWithEmail = ref(false)
const onlyWithProducts = ref(true)
const createIndustryFilter = ref<Set<string>>(new Set())
const selected = ref<Set<string>>(new Set())
const hint = ref('')
const showConfirm = ref(false)

const PAGE_SIZE = 100
const loadedCandidates = ref<VendorCandidate[]>([])
const candidatesTotal = ref(0)
const candidatesHasMore = ref(false)
const candidatesLoading = ref(false)
const candidatesError = ref<string | null>(null)
const loadMoreBusy = ref(false)

const industriesQuery = useQuery({
  queryKey: ['labs-candidate-industries', onlyWithProducts, onlyWithEmail],
  queryFn: () => api.labs.candidateIndustries({
    only_with_products: onlyWithProducts.value,
    only_with_email: onlyWithEmail.value,
  }),
})

const availableCreateIndustries = computed(() => industriesQuery.data.value?.items ?? [])

async function loadCandidatesPage(offset: number, append: boolean) {
  const params = {
    search: search.value || undefined,
    only_with_email: onlyWithEmail.value,
    only_with_products: onlyWithProducts.value,
    industries: createIndustryFilter.value.size ? Array.from(createIndustryFilter.value) : undefined,
    limit: PAGE_SIZE,
    offset,
  }
  if (append) loadMoreBusy.value = true
  else candidatesLoading.value = true
  candidatesError.value = null
  try {
    const res = await api.labs.candidates(params)
    const items = res.items ?? []
    if (append) loadedCandidates.value = [...loadedCandidates.value, ...items]
    else loadedCandidates.value = items
    candidatesTotal.value = res.total ?? items.length
    candidatesHasMore.value = Boolean(res.has_more)
  } catch (e) {
    candidatesError.value = 'Gagal load kandidat'
    if (!append) loadedCandidates.value = []
  } finally {
    candidatesLoading.value = false
    loadMoreBusy.value = false
  }
}

async function refreshCandidates() {
  await loadCandidatesPage(0, false)
}

async function loadMoreCandidates() {
  if (!candidatesHasMore.value || loadMoreBusy.value) return
  await loadCandidatesPage(loadedCandidates.value.length, true)
}

async function loadAllCandidates() {
  while (candidatesHasMore.value && !loadMoreBusy.value) {
    await loadCandidatesPage(loadedCandidates.value.length, true)
  }
}

function toggleCreateIndustry(name: string) {
  const next = new Set(createIndustryFilter.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  createIndustryFilter.value = next
}

function clearCreateIndustries() {
  createIndustryFilter.value = new Set()
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch([search, onlyWithEmail, onlyWithProducts, createIndustryFilter], () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(refreshCandidates, 250)
}, { deep: true })

refreshCandidates()

const candidates = computed<VendorCandidate[]>(() => loadedCandidates.value)
const candidateMap = computed(() => {
  const m = new Map<string, VendorCandidate>()
  for (const v of candidates.value) m.set(v.vendor_id, v)
  return m
})

const suggestions = ref<FusionSuggestion[]>([])
const suggestLoading = ref(false)

async function fetchSuggestions() {
  suggestLoading.value = true
  try {
    const res = await api.labs.suggest({})
    suggestions.value = res.suggestions
    if (res.suggestions.length === 0) {
      toast.info('Belum ada saran yang masuk akal. Coba lagi atau periksa data vendor.')
    }
  } catch {
    toast.error('Gagal ngambil saran AI')
  } finally {
    suggestLoading.value = false
  }
}

function useSuggestion(vendorIds: string[]) {
  selected.value = new Set(vendorIds)
  toast.success(`${vendorIds.length} vendor terpilih dari saran`)
}

function toggleVendor(vendorId: string) {
  const next = new Set(selected.value)
  if (next.has(vendorId)) next.delete(vendorId)
  else next.add(vendorId)
  selected.value = next
}

const selectedVendors = computed(() =>
  Array.from(selected.value)
    .map((id) => candidateMap.value.get(id))
    .filter((v): v is VendorCandidate => Boolean(v)),
)

const missingEmail = computed(() => selectedVendors.value.filter((v) => !v.has_verified_email))
const canCombine = computed(() => selected.value.size >= 2)

const deepenBusy = ref<Set<string>>(new Set())

async function deepenVendor(vendorId: string) {
  const next = new Set(deepenBusy.value)
  next.add(vendorId)
  deepenBusy.value = next
  try {
    await api.deepenVendor(vendorId)
    toast.success('Deepen request dikirim. Tunggu beberapa menit, refresh kandidat.')
  } catch {
    toast.error('Gagal trigger deepen')
  } finally {
    const after = new Set(deepenBusy.value)
    after.delete(vendorId)
    deepenBusy.value = after
  }
}

const combineLoading = ref(false)
const lastFusion = ref<Fusion | null>(null)

function openCombine() {
  if (!canCombine.value) return
  showConfirm.value = true
}

async function doCombine() {
  combineLoading.value = true
  lastFusion.value = null
  try {
    const fusion = await api.labs.create({
      vendor_ids: Array.from(selected.value),
      hint: hint.value || undefined,
    })
    lastFusion.value = fusion
    toast.success(`Fusion "${fusion.name}" berhasil dibikin`)
    selected.value = new Set()
    hint.value = ''
    historyQuery.refetch()
  } catch (e) {
    let msg = 'Combine gagal'
    if (axios.isAxiosError(e) && e.response?.data) {
      const detail = e.response.data.detail
      if (typeof detail === 'string') msg = detail
      else if (detail?.hint) msg = detail.hint
    }
    toast.error(msg)
  } finally {
    combineLoading.value = false
  }
}

const historyQuery = useQuery({
  queryKey: ['labs-history'],
  queryFn: () => api.labs.list({ limit: 50 }),
})

const categoryFilter = ref<string>('')

const historyItems = computed(() => historyQuery.data.value?.items ?? [])

const availableCategories = computed<{ name: string; count: number }[]>(() => {
  const counts = new Map<string, number>()
  for (const f of historyItems.value) {
    for (const ind of f.industries ?? []) {
      const key = (ind ?? '').trim()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const filteredHistoryItems = computed(() => {
  if (!categoryFilter.value) return historyItems.value
  return historyItems.value.filter((f) =>
    (f.industries ?? []).some((i) => i === categoryFilter.value),
  )
})

const historyDetail = ref<Fusion | null>(null)

async function openHistoryDetail(fusionId: string) {
  try {
    historyDetail.value = await api.labs.detail(fusionId)
  } catch {
    toast.error('Gagal load detail fusion')
  }
}

watch(activeTab, () => {
  if (activeTab.value === 'history') historyQuery.refetch()
})

const formatNum = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('id-ID').format(n)
}
</script>

<template>
  <div class="labs-canvas">
    <!-- ============================================================== -->
    <!-- HERO STRIP — eyebrow + selected-count cinema numeral             -->
    <!-- ============================================================== -->
    <section class="labs-hero">
      <div class="labs-hero__ticker fade-up" style="animation-delay: 0ms">
        <span class="dot dot-amber dot-glow" />
        <span class="atlas-hero__ticker-tag">FUSION COMPOSER</span>
        <span class="atlas-hero__ticker-msg">
          {{ candidates.length }} KANDIDAT AKTIF &middot;
          {{ historyQuery.data.value?.items?.length ?? 0 }} FUSION HISTORIS &middot;
          EKSPERIMEN AI &middot; HASIL TIDAK DETERMINISTIK
        </span>
        <span class="atlas-hero__ticker-stamp">LABS-01</span>
      </div>

      <div class="labs-hero__stencil fade-up" style="animation-delay: 40ms" aria-hidden="true">
        AUTOCRAWL &middot; LABS &middot; FUSION COMPOSER &middot; EKSPERIMENTAL STUDIO
      </div>

      <div class="labs-hero__body fade-up" style="animation-delay: 100ms">
        <div class="labs-hero__copy">
          <span class="eyebrow eyebrow-accent">// 01 LABS</span>
          <h1 class="display-hero mt-4">
            Vendor <span class="text-amber">Fusion</span>.
          </h1>
          <p class="text-ink-2 mt-3 max-w-xl">
            Pilih dua atau lebih kandidat vendor, beri petunjuk produk, AI komposit jadi
            satu nama dagang baru dengan draft email outreach. Eksperimen, jangan didewakan.
          </p>
        </div>

        <!-- Tabs as pills, right-aligned -->
        <div class="labs-hero__tabs">
          <button
            type="button"
            class="labs-tab"
            :class="{ 'labs-tab--active': activeTab === 'create' }"
            @click="activeTab = 'create'"
          >
            Bikin Baru
            <span class="num labs-tab__num">{{ selected.size }}</span>
          </button>
          <button
            type="button"
            class="labs-tab"
            :class="{ 'labs-tab--active': activeTab === 'history' }"
            @click="activeTab = 'history'"
          >
            Riwayat
            <span class="num labs-tab__num">{{ historyQuery.data.value?.items?.length ?? 0 }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- BENCH — sticky control rail + composer canvas                    -->
    <!-- ============================================================== -->
    <section v-if="activeTab === 'create'" class="labs-bench">
      <!-- LEFT 4: control rail, sticky -->
      <aside class="labs-rail">
        <div class="bezel bezel-lg">
          <div class="bezel-core p-6 flex flex-col gap-5">
            <!-- Cinema selected count -->
            <div>
              <span class="eyebrow">// TERPILIH</span>
              <div class="labs-rail__num num">
                {{ selected.size === 0 ? '00' : formatNum(selected.size) }}
              </div>
              <span class="text-ink-mute text-xs">vendor di mejakerja</span>
            </div>

            <!-- AI suggestion CTA -->
            <button
              class="btn btn-amber btn-lg w-full justify-between"
              type="button"
              :disabled="suggestLoading"
              @click="fetchSuggestions"
            >
              <span>{{ suggestLoading ? 'Mencari Saran…' : 'Cari Saran AI' }}</span>
              <span class="btn-icon-nest">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M7 2v3M7 9v3M2 7h3M9 7h3M3.5 3.5l2 2M8.5 8.5l2 2M3.5 10.5l2-2M8.5 5.5l2-2" />
                </svg>
              </span>
            </button>

            <!-- Search + filter -->
            <div class="space-y-3">
              <span class="eyebrow">// FILTER KANDIDAT</span>
              <input
                v-model="search"
                type="text"
                placeholder="Cari nama vendor"
                class="input"
              >
              <label class="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                <input v-model="onlyWithProducts" type="checkbox" class="h-4 w-4 cursor-pointer accent-amber">
                <span>Hanya enriched dan punya katalog produk</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                <input v-model="onlyWithEmail" type="checkbox" class="h-4 w-4 cursor-pointer accent-amber">
                <span>Hanya yang punya email tervalidasi</span>
              </label>
            </div>

            <!-- Multi category filter chips -->
            <div class="space-y-2 pt-3 rule-t">
              <div class="flex items-center justify-between">
                <span class="eyebrow">// KATEGORI</span>
                <button
                  v-if="createIndustryFilter.size"
                  type="button"
                  class="text-xs text-ink-mute hover:text-amber"
                  @click="clearCreateIndustries"
                >
                  reset
                </button>
              </div>
              <div v-if="industriesQuery.isLoading.value" class="text-xs text-ink-mute">
                Memuat kategori
              </div>
              <div v-else-if="availableCreateIndustries.length === 0" class="text-xs text-ink-mute">
                Belum ada kategori
              </div>
              <div v-else class="labs-rail-cats flex flex-wrap gap-1.5">
                <button
                  v-for="cat in availableCreateIndustries"
                  :key="cat.name"
                  type="button"
                  class="labs-cat-chip labs-cat-chip--sm"
                  :class="{ 'labs-cat-chip--active': createIndustryFilter.has(cat.name) }"
                  @click="toggleCreateIndustry(cat.name)"
                >
                  <span class="labs-cat-chip__label">{{ cat.name }}</span>
                  <span class="num labs-cat-chip__num">{{ cat.count }}</span>
                </button>
              </div>
              <div v-if="createIndustryFilter.size" class="text-xs text-ink-mute">
                {{ createIndustryFilter.size }} kategori aktif
              </div>
            </div>

            <!-- Hint + combine -->
            <div class="space-y-3 pt-3 rule-t">
              <span class="eyebrow">// PETUNJUK COMBINE</span>
              <input
                v-model="hint"
                type="text"
                placeholder="Contoh: layanan B2B sektor pertahanan"
                class="input"
              >
              <span v-if="missingEmail.length" class="pill pill-warn">
                {{ missingEmail.length }} tanpa email
              </span>

              <button
                class="btn btn-amber btn-lg w-full justify-between"
                type="button"
                :disabled="!canCombine || combineLoading"
                @click="openCombine"
              >
                <span>{{ combineLoading ? 'Generating…' : 'Combine ' + selected.size }}</span>
                <span class="btn-icon-nest">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M3 7h8M7 3l4 4-4 4" />
                  </svg>
                </span>
              </button>
              <button
                v-if="selected.size > 0"
                class="btn btn-ghost btn-sm w-full"
                type="button"
                @click="selected = new Set()"
              >
                <span>Bersihkan Pilihan</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- RIGHT 8: composer canvas -->
      <div class="labs-canvas-right">
        <!-- Fusion result spotlight when present -->
        <div v-if="lastFusion" class="labs-spotlight">
          <div class="bezel bezel-lg">
            <div class="bezel-core p-6">
              <div class="flex items-center justify-between mb-4">
                <span class="eyebrow eyebrow-accent">
                  <span class="live-dot" />
                  HASIL FUSION BARU
                </span>
                <span class="num text-ink" style="font-size: 14px; font-weight: 600">
                  {{ lastFusion.name }}
                </span>
              </div>
              <LabsFusionResult :fusion="lastFusion" />
            </div>
          </div>
        </div>

        <!-- Suggestions row -->
        <div v-if="suggestions.length > 0" class="labs-suggestions">
          <div class="flex items-center justify-between mb-3 px-2">
            <span class="eyebrow">// SARAN AI</span>
            <span class="text-ink-mute text-xs num">{{ suggestions.length }} saran</span>
          </div>
          <div class="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            <LabsSuggestionCard
              v-for="(s, idx) in suggestions"
              :key="idx"
              :suggestion="s"
              :vendor-map="candidateMap"
              @use-suggestion="useSuggestion"
            />
          </div>
        </div>

        <!-- Vendor candidate grid -->
        <div class="labs-grid">
          <div class="flex items-center justify-between mb-3 px-2">
            <span class="eyebrow">// KANDIDAT VENDOR &middot; {{ candidates.length }} / {{ candidatesTotal }}</span>
            <span class="num text-ink-mute text-xs">
              {{ candidatesHasMore ? 'masih ada' : 'habis' }}
            </span>
          </div>
          <div v-if="candidatesLoading" class="py-16 text-center">
            <span class="dot dot-amber pulse-soft mx-auto inline-block" />
            <p class="label label-mute mt-3">Memuat kandidat</p>
          </div>
          <div v-else-if="candidatesError" class="py-16 text-center">
            <span class="text-ink-mute" style="font-size: 48px">!</span>
            <p class="label label-mute mt-3">{{ candidatesError }}</p>
            <button class="btn btn-ghost btn-sm mt-3" type="button" @click="refreshCandidates">
              <span>Coba lagi</span>
            </button>
          </div>
          <div v-else-if="candidates.length === 0" class="py-16 text-center">
            <span class="text-ink-mute" style="font-size: 48px">0</span>
            <p class="label label-mute mt-3">Belum ada kandidat</p>
            <p class="text-xs text-ink-mute mt-1">
              Filter aktif terlalu sempit. Lepas kategori atau enrich vendor dulu.
            </p>
          </div>
          <div v-else>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <LabsVendorCard
                v-for="v in candidates"
                :key="v.vendor_id"
                :vendor="v"
                :selected="selected.has(v.vendor_id)"
                :busy-deepen="deepenBusy.has(v.vendor_id)"
                @toggle="toggleVendor"
                @deepen="deepenVendor"
              />
            </div>
            <div v-if="candidatesHasMore" class="labs-loadmore mt-5 flex flex-col items-center gap-2">
              <div class="flex gap-2">
                <button
                  class="btn btn-ghost btn-sm"
                  type="button"
                  :disabled="loadMoreBusy"
                  @click="loadMoreCandidates"
                >
                  <span>
                    {{ loadMoreBusy ? 'Loading' : 'Muat 100 berikutnya' }}
                  </span>
                </button>
                <button
                  class="btn btn-amber btn-sm"
                  type="button"
                  :disabled="loadMoreBusy"
                  @click="loadAllCandidates"
                >
                  <span>
                    {{ loadMoreBusy ? 'Muat semua' : 'Muat semua sisa' }}
                  </span>
                </button>
              </div>
              <span class="text-xs text-ink-mute">
                {{ candidates.length }} dari {{ candidatesTotal }} loaded
              </span>
            </div>
            <div v-else class="mt-5 text-center text-xs text-ink-mute">
              Semua {{ candidatesTotal }} kandidat sudah ditampilkan
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- HISTORY tab                                                      -->
    <!-- ============================================================== -->
    <section v-else class="labs-history">
      <article v-if="historyDetail" class="bezel bezel-lg">
        <div class="bezel-core p-6">
          <div class="flex items-center justify-between mb-4">
            <span class="eyebrow eyebrow-accent">// DETAIL FUSION</span>
            <button class="btn btn-ghost btn-sm" type="button" @click="historyDetail = null">
              <span>Tutup</span>
            </button>
          </div>
          <LabsFusionResult :fusion="historyDetail" />
        </div>
      </article>

      <article v-else class="labs-history__list">
        <div class="flex items-center justify-between mb-4 px-2">
          <span class="eyebrow">// SEMUA FUSION HISTORIS</span>
          <span class="num text-ink-mute text-xs">
            {{ filteredHistoryItems.length }} dari {{ historyItems.length }} record
          </span>
        </div>

        <div
          v-if="availableCategories.length"
          class="labs-history__filter mb-4 px-2 flex flex-wrap items-center gap-1.5"
        >
          <span class="eyebrow eyebrow-mute mr-2">// KATEGORI</span>
          <button
            type="button"
            class="labs-cat-chip"
            :class="{ 'labs-cat-chip--active': !categoryFilter }"
            @click="categoryFilter = ''"
          >
            Semua
            <span class="num labs-cat-chip__num">{{ historyItems.length }}</span>
          </button>
          <button
            v-for="cat in availableCategories"
            :key="cat.name"
            type="button"
            class="labs-cat-chip"
            :class="{ 'labs-cat-chip--active': categoryFilter === cat.name }"
            @click="categoryFilter = categoryFilter === cat.name ? '' : cat.name"
          >
            {{ cat.name }}
            <span class="num labs-cat-chip__num">{{ cat.count }}</span>
          </button>
        </div>

        <div v-if="historyQuery.isLoading.value" class="py-16 text-center">
          <span class="dot dot-amber pulse-soft mx-auto inline-block" />
          <p class="label label-mute mt-3">Memuat…</p>
        </div>
        <div v-else-if="historyItems.length === 0" class="py-16 text-center">
          <span class="text-ink-mute" style="font-size: 48px">∅</span>
          <p class="label label-mute mt-3">Belum ada fusion</p>
          <p class="text-xs text-ink-mute mt-1">Bikin yang pertama di tab Bikin Baru</p>
        </div>
        <div v-else-if="filteredHistoryItems.length === 0" class="py-16 text-center">
          <span class="text-ink-mute" style="font-size: 32px">∅</span>
          <p class="label label-mute mt-3">Tidak ada fusion di kategori "{{ categoryFilter }}"</p>
          <button class="btn btn-ghost btn-sm mt-3" type="button" @click="categoryFilter = ''">
            Reset filter
          </button>
        </div>
        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <LabsFusionResult
            v-for="f in filteredHistoryItems"
            :key="f.fusion_id"
            :fusion="(f as unknown as Fusion)"
            compact
            @open-detail="openHistoryDetail"
          />
        </div>
      </article>
    </section>

    <ConfirmCountdownModal
      v-model:open="showConfirm"
      title="Yakin mau combine?"
      :body="'Ini eksperimen, hasilnya bisa ga sesuai ekspektasi. AI bisa salah saran produk dan email draft.\nLo bertanggung jawab review hasilnya sebelum kirim email beneran ke vendor.\n\nLanjut?'"
      :countdown="3"
      confirm-label="Setuju, Combine"
      cancel-label="Batal"
      tone="danger"
      @confirm="doCombine"
    />
  </div>
</template>

<style scoped>
.labs-canvas { position: relative; min-height: 100dvh; }

/* HERO */
.labs-hero {
  position: relative;
  padding: 12px 28px 32px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  overflow: hidden;
}
.labs-hero::before {
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
.labs-hero > * { position: relative; z-index: 1; }

.labs-hero__ticker {
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
.labs-hero__ticker .atlas-hero__ticker-tag { color: rgb(var(--accent)); font-weight: 600; }
.labs-hero__ticker .atlas-hero__ticker-msg {
  flex: 1;
  color: rgb(var(--ink));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.labs-hero__ticker .atlas-hero__ticker-stamp { color: rgb(var(--ink-mute)); }

.labs-hero__stencil {
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

.labs-hero__body {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;
  padding: 8px 8px 0;
  flex-wrap: wrap;
}
.labs-hero__copy { max-width: 720px; }

.labs-hero__tabs {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.labs-tab {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 22px;
  border-radius: 9999px;
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  background: rgb(var(--surface));
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: rgb(var(--ink-2));
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: all var(--dur-240) var(--ease-out);
}
.labs-tab:hover { transform: translateY(-1px); box-shadow: var(--shadow-card-hover); }
.labs-tab--active {
  background: rgb(var(--ink));
  border-color: rgb(var(--ink));
  color: rgb(var(--surface));
}
.labs-tab__num {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 9999px;
  background: rgb(var(--ink) / 0.08);
  color: inherit;
  font-weight: 600;
}
.labs-tab--active .labs-tab__num { background: rgb(var(--surface) / 0.16); }

/* BENCH */
.labs-bench {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  padding: 24px 28px 56px;
  align-items: start;
}
.labs-rail { position: sticky; top: 12px; }
.labs-rail__num {
  font-family: 'Geist Variable', 'Geist', sans-serif;
  font-weight: 700;
  font-size: clamp(3rem, 6vw, 5rem);
  line-height: 1.0;
  letter-spacing: -0.06em;
  padding-block: 0.04em;
  margin-top: 6px;
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

.labs-canvas-right {
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-width: 0;
}
.labs-spotlight { min-width: 0; }
.labs-suggestions { min-width: 0; }
.labs-grid { min-width: 0; }

/* HISTORY */
.labs-history { padding: 24px 28px 56px; }
.labs-history__list { padding: 8px 0; }

@media (max-width: 1100px) {
  .labs-hero { padding: 8px 16px 24px; }
  .labs-hero__stencil { display: none; }
  .labs-hero__body { flex-direction: column; align-items: flex-start; }
  .labs-hero__tabs { width: 100%; }
  .labs-bench {
    grid-template-columns: 1fr;
    padding: 16px 16px 36px;
  }
  .labs-rail { position: static; }
  .labs-history { padding: 16px 16px 36px; }
}

.labs-cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px 4px 10px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(var(--ink-2, 60 55 45));
  border: 1px solid rgb(var(--rule, 200 180 140) / 0.6);
  background: rgb(var(--surface-2, 252 248 240) / 0.7);
  border-radius: 4px;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease, transform 180ms ease;
}
.labs-cat-chip:hover {
  border-color: rgb(212 162 80 / 0.55);
  color: rgb(var(--ink, 30 25 18));
  transform: translateY(-1px);
}
.labs-cat-chip--active {
  color: rgb(var(--surface, 252 248 240));
  background: linear-gradient(135deg, rgb(184 137 58) 0%, rgb(212 162 80) 55%, rgb(232 178 100) 100%);
  border-color: rgb(154 111 38);
  box-shadow: 0 4px 12px -4px rgb(184 137 58 / 0.55);
}
.labs-cat-chip__num {
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgb(0 0 0 / 0.08);
}
.labs-cat-chip--active .labs-cat-chip__num {
  background: rgb(0 0 0 / 0.18);
  color: rgb(var(--surface, 252 248 240));
}
.labs-cat-chip--sm {
  padding: 3px 7px 3px 8px;
  font-size: 10px;
  letter-spacing: 0.03em;
  gap: 5px;
}
.labs-cat-chip--sm .labs-cat-chip__num {
  font-size: 9px;
  padding: 1px 4px;
}
.labs-rail-cats {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 2px;
  border: 1px solid rgb(var(--rule, 200 180 140) / 0.4);
  border-radius: 4px;
  background: rgb(var(--surface, 252 248 240) / 0.5);
}
.labs-rail-cats::-webkit-scrollbar {
  width: 6px;
}
.labs-rail-cats::-webkit-scrollbar-thumb {
  background: rgb(var(--rule, 200 180 140) / 0.6);
  border-radius: 3px;
}
.labs-loadmore .btn {
  min-width: 160px;
}
</style>
