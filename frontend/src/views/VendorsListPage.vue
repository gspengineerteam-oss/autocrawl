<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import type { Vendor } from '@/api/types'
import PageHeader from '@/components/shell/PageHeader.vue'
import GeoAvatar from '@/components/GeoAvatar.vue'
import TagBadge from '@/components/TagBadge.vue'
import { exportCsv } from '@/composables/useCsvExport'
import { resolveCountry, flagEmoji } from '@/data/country_resolver'

const route = useRoute()
const router = useRouter()

const search = ref('')
const industry = ref('')
const country = ref(typeof route.query.country === 'string' ? route.query.country : '')
const status = ref('enriched')
const PAGE_SIZE = 250
const page = ref(1)
watch([search, industry, country, status], () => { page.value = 1 })

watch(
  () => route.query.country,
  (next) => { country.value = typeof next === 'string' ? next : '' },
)

const countryFlag = computed(() => {
  if (!country.value) return ''
  const rec = resolveCountry(country.value)
  return rec ? flagEmoji(rec.cca2) : ''
})

function clearCountryFilter() {
  country.value = ''
  const next = { ...route.query }
  delete next.country
  router.replace({ path: route.path, query: next })
}

const countriesQ = useQuery({
  queryKey: ['stats', 'countries-all'],
  queryFn: () => api.stats.countries(50),
})

// Semantic when the user typed a free-form query (2+ chars). LIKE/admin path
// when search is empty or one char, so industry/country/status filters still
// route through list_paginated. Result shape is unified into {items, total}
// downstream so the table doesn't need to branch.
const { data, isLoading } = useQuery({
  queryKey: ['vendors', { search, industry, country, status, page }],
  queryFn: async () => {
    const term = search.value.trim()
    if (term.length >= 2) {
      const res = await api.vendorsSemantic(
        term,
        Math.min(50, 200),
        country.value || undefined,
      )
      return {
        items: res.items,
        total: res.items.length,
        limit: res.limit,
        offset: 0,
        degraded: res.degraded,
        mode: res.mode,
      }
    }
    const res = await api.vendors({
      search: term,
      industry: industry.value,
      country: country.value,
      status: status.value || undefined,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
      sort: 'effective_scope:desc',
    })
    return { ...res, degraded: false, mode: null }
  },
  refetchInterval: 30000,
  refetchOnWindowFocus: true,
})

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const isDegraded = computed(() => Boolean((data.value as { degraded?: boolean } | undefined)?.degraded))
const searchMode = computed(() => (data.value as { mode?: string | null } | undefined)?.mode ?? null)
const semanticActive = computed(() => search.value.trim().length >= 2)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const canPrev = computed(() => page.value > 1 && !semanticActive.value)
const canNext = computed(() => page.value < totalPages.value && !semanticActive.value)
function goNext() { if (canNext.value) page.value += 1 }
function goPrev() { if (canPrev.value) page.value -= 1 }

function statusTone(s: string): { color: string; label: string } {
  if (s === 'enriched')           return { color: 'ok',    label: 'OK' }
  if (s === 'unresolved')         return { color: 'mute',  label: 'BELUM' }
  if (s === 'enrich_failed')      return { color: 'crit',  label: 'GAGAL' }
  if (s === 'scope_rejected')     return { color: 'warn',  label: 'OFF' }
  if (s === 'validation_rejected')return { color: 'warn',  label: 'TIPIS' }
  return { color: 'mute', label: s.toUpperCase() }
}

function handleExport() {
  exportCsv('vendors_export.csv', items.value, [
    { key: (v) => v.domain ?? '', label: 'Domain' },
    { key: 'company_name', label: 'Company' },
    { key: 'status', label: 'Status' },
    { key: (v) => v.industries.join('|'), label: 'Industries' },
    { key: (v) => v.address?.country ?? '', label: 'Country' },
    { key: (v) => Math.round((v.scope_match_score ?? 0) * 100), label: 'Scope %' },
    { key: (v) => (v.military_categories ?? []).join('|'), label: 'Military Categories' },
    { key: (v) => v.contacts.find((c) => c.type === 'email')?.value ?? '', label: 'Email' },
    { key: (v) => v.contacts.find((c) => c.type === 'phone')?.value ?? '', label: 'Phone' },
    { key: (v) => v.canonical_url ?? '', label: 'URL' },
    { key: (v) => v.catalog_count ?? 0, label: 'Catalog Count' },
    { key: (v) => v.expos_seen.join('|'), label: 'Expos' },
  ])
}

function scopePct(v: Vendor): number {
  return Math.round(Math.min(100, (v.scope_match_score ?? 0) * 100))
}
function dataPct(v: Vendor): number {
  return Math.round(Math.min(100, (v.enrichment_completeness ?? 0) * 100))
}
function effectivePct(v: Vendor): number {
  if (typeof v.effective_scope === 'number') {
    return Math.round(Math.min(100, v.effective_scope * 100))
  }
  const s = v.scope_match_score ?? 0
  const e = v.enrichment_completeness ?? 0
  return Math.round(Math.min(100, s * (0.4 + 0.6 * e) * 100))
}
// Color zone: "ok" both ≥60, "thin" either <30, else "mid".
function scopeDataTone(v: Vendor): 'ok' | 'mid' | 'thin' {
  const s = scopePct(v), d = dataPct(v)
  if (s >= 60 && d >= 60) return 'ok'
  if (s < 30 || d < 30) return 'thin'
  return 'mid'
}
function contactTag(v: Vendor): string {
  const bits: string[] = []
  if (v.has_email) bits.push('EML')
  if (v.has_phone) bits.push('TLP')
  if (v.has_website) bits.push('WEB')
  if (v.catalog_count && v.catalog_count > 0) bits.push('KAT')
  return bits.join(' · ') || '—'
}

const stats = computed(() => [
  { label: 'Total', value: total.value.toLocaleString(), tone: 'amber' as const },
  { label: 'Termuat', value: items.value.length, tone: 'mute' as const },
])

const STATUS_OPTIONS = [
  { value: '',                    label: 'Semua status' },
  { value: 'enriched',            label: 'Enriched' },
  { value: 'unresolved',          label: 'Belum resolve' },
  { value: 'enrich_failed',       label: 'Gagal' },
  { value: 'scope_rejected',      label: 'Off-scope' },
  { value: 'validation_rejected', label: 'Tipis' },
]
const INDUSTRY_OPTIONS = [
  { value: '',                label: 'Semua industri' },
  { value: 'defense',         label: 'Defense' },
  { value: 'cybersecurity',   label: 'Cybersecurity' },
  { value: 'law_enforcement', label: 'Law Enforcement' },
  { value: 'surveillance',    label: 'Surveillance' },
  { value: 'aerospace',       label: 'Aerospace' },
]
</script>

<template>
  <div class="flex flex-col">
    <PageHeader
      title="Vendor Registry"
      subtitle="Indeks semua exhibitor yang sudah ter-enriched + yang menunggu resolusi"
      :stats="stats"
    >
      <template #actions>
        <button class="btn btn-ghost h-9" :disabled="!items.length" @click="handleExport">
          <FaIcon :icon="['fas', 'arrow-up-right-from-square']" class="text-[10px]" />
          <span>Export CSV</span>
        </button>
      </template>
    </PageHeader>

    <!-- Active filter chip -->
    <div v-if="country" class="flex items-center justify-between bg-amber/5 rule-b border-amber/30 px-6 py-2.5">
      <div class="flex items-center gap-2 text-[12px]">
        <span class="text-[15px]">{{ countryFlag }}</span>
        <span class="label label-amber">Filter Negara</span>
        <span class="text-ink">{{ country }}</span>
      </div>
      <button class="btn btn-ghost h-7 px-2" type="button" title="Hapus filter" @click="clearCountryFilter">
        <FaIcon :icon="['fas', 'xmark']" class="text-[10px]" />
        Hapus
      </button>
    </div>

    <!-- Filter command bar -->
    <div class="rule-b bg-bg flex items-center gap-2 px-6 py-3">
      <div class="relative flex-1 max-w-md">
        <FaIcon :icon="['fas', 'magnifying-glass']"
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-mute" />
        <input
          v-model="search"
          type="text"
          placeholder="Cari berdasarkan keahlian, produk, atau industri"
          class="input pl-8 h-9"
        />
      </div>
      <template v-if="!semanticActive">
        <select v-model="status" class="input h-9 w-44">
          <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="industry" class="input h-9 w-44">
          <option v-for="o in INDUSTRY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </template>
      <select v-model="country" class="input h-9 w-44">
        <option value="">Semua negara</option>
        <option v-for="c in countriesQ.data.value ?? []" :key="c.country" :value="c.country">
          {{ c.country }} ({{ c.count }})
        </option>
      </select>
      <RouterLink
        v-if="semanticActive"
        to="/cari"
        class="label label-amber flex items-center gap-1.5 hover:underline"
        title="Buka ruang pencarian penuh"
      >
        <FaIcon :icon="['fas', 'expand']" class="text-[9px]" />
        Buka Hero
      </RouterLink>
      <span v-if="isLoading" class="ml-auto label label-amber flex items-center gap-1.5">
        <span class="dot dot-amber pulse-amber"></span>Memuat
      </span>
      <span v-else-if="isDegraded" class="ml-auto label label-warn">Cadangan Leksikal</span>
      <span v-else-if="searchMode === 'semantic'" class="ml-auto label label-amber">Semantik</span>
      <span v-else class="ml-auto label label-mute">Live 30s</span>
    </div>

    <!-- Ledger table -->
    <div class="flex-1 overflow-auto">
      <table v-if="items.length > 0" class="ledger w-full">
        <thead>
          <tr>
            <th class="w-[22%]">Perusahaan</th>
            <th class="w-[14%]">Domain</th>
            <th class="w-[7%] text-center">Status</th>
            <th class="w-[16%]">Industri</th>
            <th class="w-[9%]">Negara</th>
            <th class="w-[14%]">Tech Stack</th>
            <th class="w-[12%] text-right">Scope · Data</th>
            <th class="w-[8%] text-center">Sinyal</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.vendor_id" class="vendor-row cursor-pointer">
            <td>
              <RouterLink
                :to="`/vendors/${row.vendor_id || row.domain}`"
                class="flex items-center gap-3 group"
              >
                <span
                  class="vendor-row__avatar"
                  :data-elite="(row.scope_match_score ?? 0) >= 0.5 ? 'true' : 'false'"
                  data-elite-style="inset"
                >
                  <img
                    v-if="row.logo_url"
                    :src="row.logo_url"
                    :alt="row.company_name"
                    class="vendor-row__logo"
                    referrerpolicy="no-referrer"
                  />
                  <GeoAvatar
                    v-else
                    :seed="row.vendor_id || row.domain || row.company_name"
                    :fallback="row.company_name"
                    :size="36"
                  />
                </span>
                <span class="truncate text-ink group-hover:text-amber transition-colors">{{ row.company_name }}</span>
              </RouterLink>
            </td>
            <td>
              <span v-if="row.domain" class="num-display text-[11.5px] text-ink-2 truncate block">{{ row.domain }}</span>
              <span v-else class="text-ink-mute">—</span>
            </td>
            <td class="text-center">
              <span class="pill" :class="`pill-${statusTone(row.status).color}`">
                {{ statusTone(row.status).label }}
              </span>
            </td>
            <td>
              <div class="flex flex-wrap gap-1">
                <TagBadge
                  v-for="tag in row.industries.slice(0, 2)"
                  :key="tag"
                  :raw="tag"
                  size="xs"
                />
                <span v-if="row.industries.length > 2" class="text-[10px] text-ink-mute self-center">+{{ row.industries.length - 2 }}</span>
              </div>
            </td>
            <td>
              <span v-if="row.address?.country" class="flex items-center gap-1.5 text-[12.5px]">
                <span class="text-[14px]">{{ flagEmoji(resolveCountry(row.address.country)?.cca2 ?? '') }}</span>
                <span class="truncate">{{ row.address.country }}</span>
              </span>
              <span v-else class="text-ink-mute">—</span>
            </td>
            <td>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="tech in (row.tech_stack ?? []).slice(0, 3)"
                  :key="tech"
                  class="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-surface-2 text-ink-2 border border-rule"
                >
                  {{ tech }}
                </span>
                <span v-if="!row.tech_stack?.length" class="text-ink-mute">—</span>
              </div>
            </td>
            <td class="text-right" :title="`Effective ${effectivePct(row)}% — scope ${scopePct(row)}% × data ${dataPct(row)}%`">
              <div class="flex flex-col items-end gap-0.5">
                <div class="flex items-center gap-1.5">
                  <div class="w-10 h-[3px] rounded-[1px] bg-surface-2 overflow-hidden">
                    <div
                      class="h-full rounded-[1px]"
                      :class="{
                        'bg-amber': scopeDataTone(row) === 'ok',
                        'bg-warn': scopeDataTone(row) === 'mid',
                        'bg-ink-mute': scopeDataTone(row) === 'thin',
                      }"
                      :style="{ width: `${scopePct(row)}%` }"
                    />
                  </div>
                  <span class="num-display text-[11px] tabular-nums w-8 text-ink">S {{ scopePct(row) }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="w-10 h-[3px] rounded-[1px] bg-surface-2 overflow-hidden">
                    <div
                      class="h-full rounded-[1px]"
                      :class="{
                        'bg-amber': scopeDataTone(row) === 'ok',
                        'bg-warn': scopeDataTone(row) === 'mid',
                        'bg-ink-mute': scopeDataTone(row) === 'thin',
                      }"
                      :style="{ width: `${dataPct(row)}%` }"
                    />
                  </div>
                  <span class="num-display text-[10.5px] tabular-nums w-8 text-ink-2">D {{ dataPct(row) }}</span>
                </div>
              </div>
            </td>
            <td class="text-center">
              <span class="pill text-[9.5px]">{{ contactTag(row) }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
        <FaIcon :icon="['fas', 'building']" class="text-[28px] text-ink-mute" />
        <span class="label label-mute">Tiada vendor yang cocok dengan filter</span>
        <span class="text-[12px] text-ink-mute">Ubah filter atau jalankan operasi crawl baru</span>
      </div>
    </div>

    <div
      v-if="!semanticActive && total > 0"
      class="rule-t bg-bg flex items-center justify-between px-6 py-3 text-[12px]"
    >
      <span class="text-ink-mute">
        Halaman {{ page }} dari {{ totalPages }}
        <span class="num-display text-ink ml-2">{{ total.toLocaleString() }} total</span>
        <span class="num-display text-ink-mute ml-1">({{ items.length }} di halaman ini)</span>
      </span>
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost h-8" :disabled="!canPrev" @click="goPrev">
          <FaIcon :icon="['fas', 'chevron-left']" class="text-[10px]" />
          Sebelumnya
        </button>
        <button class="btn btn-ghost h-8" :disabled="!canNext" @click="goNext">
          Selanjutnya
          <FaIcon :icon="['fas', 'chevron-right']" class="text-[10px]" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vendor-row__avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgb(var(--surface-2));
}
.vendor-row__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 4px;
  background: rgb(var(--surface));
  border-radius: inherit;
}
</style>
