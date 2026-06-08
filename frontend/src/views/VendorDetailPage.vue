<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { api } from '@/api/client'
import VendorProductCatalog from '@/components/VendorProductCatalog.vue'
import VendorEmailDraftModal from '@/components/VendorEmailDraftModal.vue'
import GeoAvatar from '@/components/GeoAvatar.vue'
import TagBadge from '@/components/TagBadge.vue'
import EnrichmentBadge from '@/components/EnrichmentBadge.vue'
import { downloadVendorDossierPdf } from '@/services/vendorPdfBuilder'

/**
 * Vendor Detail — Folio archetype, refined-cinematic register.
 *
 * Layout intent: a cinema-scale dossier opening. Vendor identity on the
 * LEFT (logo + name + tagline + description), confidence + scope score
 * on the RIGHT in editorial margin column with stacked giant numerals.
 * Below: pill segmented tabs, then content arranged as 8:4 Folio.
 *
 * Every figure traces to the real /api/vendors/{domain} payload.
 * Bahasa Indonesia copy. Gold accent locked.
 */

const props = defineProps<{ domain: string }>()
const queryClient = useQueryClient()
const deepening = ref(false)
const downloadingPdf = ref(false)
const emailDraftOpen = ref(false)

const { data, isLoading, isError } = useQuery({
  queryKey: ['vendor', () => props.domain],
  queryFn: () => api.vendor(props.domain),
  refetchInterval: () => (deepening.value ? 4000 : false),
})

async function deepenVendor() {
  if (!data.value || deepening.value) return
  const target = data.value.vendor_id || data.value.domain
  if (!target) return
  deepening.value = true
  toast.info('Perdalam vendor diluncurkan', {
    description: 'AI re-enrich sedang berjalan. Skor akan update otomatis.',
  })
  try {
    await api.deepenVendor(target)
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['vendor', () => props.domain] })
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    }, 6000)
    setTimeout(() => {
      deepening.value = false
      queryClient.invalidateQueries({ queryKey: ['vendor', () => props.domain] })
    }, 30000)
  } catch {
    deepening.value = false
    toast.error('Gagal meluncurkan deepen')
  }
}

async function onDownloadPdf() {
  if (!data.value || downloadingPdf.value) return
  const target = data.value.vendor_id || data.value.domain
  if (!target) return
  downloadingPdf.value = true
  toast.info('Menyusun dosir vendor', {
    description: 'AI menulis konten dan diagram. Bisa 30 hingga 60 detik.',
  })
  try {
    const resp = await api.vendorDossierContent(target, 'id')
    await downloadVendorDossierPdf(resp)
    toast.success('PDF tersusun', { description: 'File diunduh ke browser.' })
  } catch (err: unknown) {
    const e = err as {
      response?: { data?: { detail?: string }; status?: number }
      message?: string
      code?: string
    }
    const detail =
      e.response?.data?.detail
      ?? (e.code === 'ECONNABORTED' ? 'Request timeout, coba lagi karena LLM lambat.' : null)
      ?? (e.response?.status ? `HTTP ${e.response.status}` : null)
      ?? e.message
      ?? 'Cek Ollama atau log API.'
    console.error('[vendorPdf] dossier failed:', err)
    toast.error('Gagal menyusun PDF', { description: detail })
  } finally {
    downloadingPdf.value = false
  }
}

async function onDeepenProducts() {
  if (!data.value) return
  const target = data.value.vendor_id || data.value.domain
  if (!target) return
  toast.info('Enrich produk diluncurkan', {
    description: 'Katalog akan terisi dalam sekitar 1 menit. Refresh halaman.',
  })
  try {
    await api.deepenVendorProducts(target)
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['vendor', () => props.domain] })
    }, 90000)
  } catch {
    toast.error('Gagal meluncurkan enrich produk')
  }
}

const logoFailed = ref(false)

const showOriginal = ref(false)
const isTranslated = computed(
  () => data.value?.language_code === 'id' && Boolean(data.value?.translation_method),
)
const displayDescription = computed(() =>
  showOriginal.value && data.value?.description_original
    ? data.value.description_original
    : data.value?.description ?? null,
)
const displayTagline = computed(() =>
  showOriginal.value && data.value?.tagline_original
    ? data.value.tagline_original
    : data.value?.tagline ?? null,
)
const displayProducts = computed(() =>
  showOriginal.value && data.value?.products_original?.length
    ? data.value.products_original
    : data.value?.products ?? [],
)
const displayIndustries = computed(() =>
  showOriginal.value && data.value?.industries_original?.length
    ? data.value.industries_original
    : data.value?.industries ?? [],
)

type Tab = 'katalog' | 'profil' | 'kontak' | 'json'
const tab = ref<Tab>('katalog')
// Snowglobe rule 6 (2026-05-25): KATALOG = outreach priority, jadi tab pertama
// dan disembunyikan kalau vendor belum punya website (canonical_url null).
// SUMBER (provenance) dimatikan sepenuhnya — kita ga klaim source confidence lagi.
const TABS = computed<Array<{ id: Tab; label: string }>>(() => {
  const out: Array<{ id: Tab; label: string }> = []
  const hasSite = Boolean(data.value?.canonical_url)
  if (hasSite) out.push({ id: 'katalog', label: 'Katalog' })
  out.push({ id: 'profil',  label: 'Profil' })
  out.push({ id: 'kontak',  label: 'Kontak' })
  out.push({ id: 'json',    label: 'JSON' })
  return out
})
watch(TABS, (next) => {
  if (!next.some((t) => t.id === tab.value)) {
    tab.value = next[0]?.id ?? 'profil'
  }
})

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

const jsonView = computed(() => (data.value ? JSON.stringify(data.value, null, 2) : ''))
function copyJson() {
  if (!jsonView.value) return
  navigator.clipboard.writeText(jsonView.value)
  toast.success('JSON tersalin')
}

// confidence_score / confidenceTone removed 2026-05-25 — snowglobe reset
// rule 6 drops invented per-source confidence in favor of observable signals
// (contact_count, has_email, has_phone, has_website, scope_match_score).

// True completeness from enrichment_gap (4 default categories: contacts,
// socials, address, products). Falls back to confidence_score when the
// vendor has no gap data (legacy rows pre-2026-05-21).
const GAP_TOTAL = 4
const completenessPct = computed(() => {
  const v = data.value
  if (!v) return 0
  const gap = v.enrichment_gap ?? []
  if (gap.length === 0 && (v.confidence_score ?? 0) > 0) {
    // Legacy enriched without gap tracking — use confidence_score
    return Math.round((v.confidence_score ?? 0) * 100)
  }
  const filled = Math.max(0, GAP_TOTAL - gap.length)
  return Math.round((filled / GAP_TOTAL) * 100)
})
const completenessTone = computed<'ok' | 'amber' | 'crit'>(() => {
  if (completenessPct.value >= 75) return 'ok'
  if (completenessPct.value >= 40) return 'amber'
  return 'crit'
})
const scopePct = computed(() =>
  data.value?.overall_scope_score != null
    ? Math.round(data.value.overall_scope_score * 100)
    : null,
)

// Snowglobe Phase 2: military scope_match × enrichment completeness.
// Two-axis truth so "scope 100% / info 0%" can't happen on the card.
const militaryScopePct = computed(() =>
  data.value?.scope_match_score != null
    ? Math.round(Math.min(100, data.value.scope_match_score * 100))
    : null,
)
const dataCompletenessPct = computed(() =>
  data.value?.enrichment_completeness != null
    ? Math.round(Math.min(100, data.value.enrichment_completeness * 100))
    : null,
)
const effectiveScopePct = computed(() => {
  const d = data.value
  if (!d) return null
  if (typeof d.effective_scope === 'number') {
    return Math.round(Math.min(100, d.effective_scope * 100))
  }
  const s = d.scope_match_score ?? 0
  const e = d.enrichment_completeness ?? 0
  return Math.round(Math.min(100, s * (0.4 + 0.6 * e) * 100))
})
const effectiveTone = computed<'is-ok' | 'is-amber' | 'is-crit'>(() => {
  const v = effectiveScopePct.value ?? 0
  if (v >= 60) return 'is-ok'
  if (v >= 30) return 'is-amber'
  return 'is-crit'
})
</script>

<template>
  <div class="vd-canvas">
    <!-- BACK LINK + TICKER -->
    <div class="vd-topbar fade-up" style="animation-delay: 0ms">
      <RouterLink to="/vendors" class="vd-back">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 3 5 7l4 4" />
        </svg>
        <span>Kembali ke armada</span>
      </RouterLink>
      <div class="vd-ticker" v-if="data">
        <span class="dot" :class="deepening ? 'dot-amber dot-glow' : 'dot-mute'" />
        <span class="vd-ticker__tag num">VENDOR</span>
        <span class="vd-ticker__msg">
          {{ (data.domain || 'tanpa-domain').toUpperCase() }} &middot;
          {{ deepening ? 'MEMPERDALAM' : 'STABIL' }} &middot;
          PERKAYAAN {{ formatDate(data.last_enriched_at).toUpperCase() }}
        </span>
        <span class="vd-ticker__stamp">
          {{ data.vendor_id ? data.vendor_id.slice(0, 8) : '———' }}
        </span>
      </div>
    </div>

    <!-- LOADING / ERROR -->
    <div v-if="isLoading" class="vd-empty">
      <div class="vd-empty__pulse" />
      <span class="label label-mute mt-3">Memuat dosir vendor&hellip;</span>
    </div>

    <article v-else-if="isError" class="vd-empty">
      <div class="vd-empty__glyph">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="m9 9 6 6M15 9l-6 6" />
        </svg>
      </div>
      <h3 class="display-sans text-ink mt-4" style="font-size: 22px">Vendor tidak ditemukan</h3>
      <p class="text-ink-2 mt-2 max-w-md text-center">
        Vendor dengan domain ini belum terkoleksi atau telah dihapus dari database.
      </p>
    </article>

    <template v-else-if="data">
      <!-- ========================================================== -->
      <!-- HERO — Folio dossier opening                                  -->
      <!-- ========================================================== -->
      <section class="vd-hero">
        <!-- Vertical stencil left edge -->
        <div class="vd-stencil" aria-hidden="true">
          VENDOR &middot; {{ (data.domain || 'TANPA-DOMAIN').toUpperCase() }} &middot; DOSSIER
        </div>

        <div class="vd-hero__layout">
          <!-- LEFT identity column -->
          <div class="vd-identity fade-up" style="animation-delay: 80ms">
            <div class="vd-logo" :data-elite="(data.scope_match_score ?? 0) >= 0.5 ? 'true' : 'false'">
              <img
                v-if="data.logo_url && !logoFailed"
                :src="data.logo_url"
                :alt="`Logo ${data.company_name}`"
                referrerpolicy="no-referrer"
                @error="logoFailed = true"
              />
              <GeoAvatar
                v-else
                :seed="data.vendor_id || data.domain || data.company_name"
                :fallback="data.company_name"
                :size="168"
              />
              <span class="vd-logo__corner" aria-hidden="true" />
            </div>

            <div class="vd-identity__body">
              <span class="eyebrow eyebrow-accent">
                // 01 &middot; INTELLIGENCE DOSSIER
              </span>
              <h1 class="vd-name">{{ data.company_name }}</h1>
              <a
                v-if="data.canonical_url"
                :href="data.canonical_url"
                target="_blank"
                rel="noopener noreferrer"
                class="vd-domain"
              >
                {{ data.domain ?? 'tanpa domain' }}
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 9 9 5M5 5h4v4" />
                </svg>
              </a>
              <span v-else class="vd-domain vd-domain--mute">
                {{ data.domain ?? 'belum ter-resolve' }}
              </span>

              <blockquote v-if="displayTagline" class="vd-tagline">
                <span class="vd-tagline__mark">&ldquo;</span>{{ displayTagline }}<span class="vd-tagline__mark">&rdquo;</span>
              </blockquote>

              <p v-if="data.focus_summary" class="vd-focus">
                {{ data.focus_summary }}
              </p>

              <p v-if="displayDescription" class="vd-description">
                {{ displayDescription }}
              </p>

              <!-- Industries -->
              <div v-if="displayIndustries.length" class="vd-chips vd-chips--industries">
                <TagBadge v-for="tag in displayIndustries" :key="tag" :raw="tag" size="sm" />
              </div>

              <!-- DoI -->
              <div v-if="data.domain_of_interest?.length" class="vd-chips">
                <TagBadge v-for="doi in data.domain_of_interest" :key="doi" :raw="doi" size="sm" variant="outline" />
              </div>
            </div>
          </div>

          <!-- RIGHT margin column — confidence + scope giant numerals + actions -->
          <aside class="vd-margin fade-up" style="animation-delay: 160ms">
            <!-- Completeness derived from enrichment_gap (4 categories) -->
            <div class="vd-stat">
              <span class="label label-mute">Skor Kelengkapan</span>
              <div
                class="vd-stat__num"
                :class="{
                  'is-ok':    completenessTone === 'ok',
                  'is-amber': completenessTone === 'amber',
                  'is-crit':  completenessTone === 'crit',
                }"
              >
                <span class="num">{{ completenessPct }}</span>
                <span class="vd-stat__unit">%</span>
              </div>
              <div class="vd-stat__bar">
                <div
                  class="vd-stat__bar-fill"
                  :class="{
                    'is-ok':    completenessTone === 'ok',
                    'is-amber': completenessTone === 'amber',
                    'is-crit':  completenessTone === 'crit',
                  }"
                  :style="{ width: completenessPct + '%' }"
                />
              </div>
              <span v-if="data.enrichment_gap?.length" class="text-xs text-ink-mute mt-1 block">
                {{ data.enrichment_gap.length }} dari {{ GAP_TOTAL }} field belum terisi
              </span>
            </div>

            <!-- Snowglobe rule 6: Konfidensi Sumber dihapus. Diganti dengan
                 kontak count (jumlah email + telepon nyata yang ke-extract). -->
            <div class="vd-stat" v-if="(data.contact_count ?? 0) > 0">
              <span class="label label-mute">Kontak Nyata</span>
              <div class="vd-stat__num is-ok">
                <span class="num">{{ data.contact_count ?? 0 }}</span>
                <span class="vd-stat__unit">titik</span>
              </div>
              <span class="text-xs text-ink-mute mt-1 block">
                {{ data.has_email ? 'email' : '' }}{{ data.has_email && data.has_phone ? ' · ' : '' }}{{ data.has_phone ? 'telepon' : '' }}
              </span>
            </div>

            <!-- Scope (if available) -->
            <div v-if="scopePct !== null" class="vd-stat">
              <span class="label label-mute">Scope Vendor</span>
              <div
                class="vd-stat__num"
                :class="{
                  'is-ok':    scopePct >= 70,
                  'is-amber': scopePct >= 40 && scopePct < 70,
                  'is-crit':  scopePct < 40,
                }"
              >
                <span class="num">{{ scopePct }}</span>
                <span class="vd-stat__unit">%</span>
              </div>
              <div class="vd-stat__bar">
                <div
                  class="vd-stat__bar-fill"
                  :class="{
                    'is-ok':    scopePct >= 70,
                    'is-amber': scopePct >= 40 && scopePct < 70,
                    'is-crit':  scopePct < 40,
                  }"
                  :style="{ width: scopePct + '%' }"
                />
              </div>
            </div>

            <!-- Snowglobe Phase 2: military scope × data completeness × effective -->
            <div v-if="militaryScopePct !== null" class="vd-stat" :title="`Skor militer dikalikan derajat kelengkapan data — efektif ${effectiveScopePct}%`">
              <span class="label label-mute">Militer · Data · Efektif</span>
              <div class="vd-stat__num" :class="effectiveTone">
                <span class="num">{{ effectiveScopePct }}</span>
                <span class="vd-stat__unit">%</span>
              </div>
              <div class="vd-stat__bar">
                <div class="vd-stat__bar-fill" :class="effectiveTone" :style="{ width: (effectiveScopePct ?? 0) + '%' }" />
              </div>
              <div class="flex gap-3 mt-1 text-[10.5px] text-ink-mute num-display">
                <span title="Skor klasifikasi militer mentah">Militer {{ militaryScopePct }}%</span>
                <span title="Derajat kelengkapan hasil scrape: kontak, produk, katalog, alamat">Data {{ dataCompletenessPct }}%</span>
              </div>
            </div>

            <!-- Funding (if present) -->
            <div v-if="data.funding?.total_raised_usd" class="vd-funding">
              <span class="label label-mute">Pendanaan</span>
              <div class="vd-funding__num num">
                ${{ (data.funding.total_raised_usd / 1_000_000).toFixed(1) }}M
              </div>
              <span v-if="data.funding.last_round" class="vd-funding__round">
                {{ data.funding.last_round }}
                <template v-if="data.funding.last_round_at">
                  &middot; {{ new Date(data.funding.last_round_at).getFullYear() }}
                </template>
              </span>
            </div>

            <!-- Action stack -->
            <div class="vd-actions">
              <button
                class="btn btn-amber"
                :disabled="deepening"
                @click="deepenVendor"
              >
                <span>{{ deepening ? 'Memperdalam…' : 'Perdalam' }}</span>
                <span class="btn-icon-nest">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="7" cy="7" r="3" />
                    <path d="M7 1v2M7 11v2M1 7h2M11 7h2" />
                  </svg>
                </span>
              </button>
              <button class="btn" :disabled="downloadingPdf" @click="onDownloadPdf">
                <span>{{ downloadingPdf ? 'Menyusun…' : 'Unduh PDF' }}</span>
                <span class="btn-icon-nest">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 2v8m0 0-3-3m3 3 3-3M2 12h10" />
                  </svg>
                </span>
              </button>
              <button class="btn" @click="emailDraftOpen = true">
                <span>Draft Email</span>
                <span class="btn-icon-nest">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="10" height="8" rx="1" />
                    <path d="m2 3 5 5 5-5" />
                  </svg>
                </span>
              </button>
              <button
                v-if="isTranslated"
                class="btn btn-ghost"
                @click="showOriginal = !showOriginal"
              >
                <span>{{ showOriginal ? 'Lihat ID' : 'Lihat EN' }}</span>
              </button>
            </div>
          </aside>
        </div>
      </section>

      <!-- ========================================================== -->
      <!-- SECTION MARK + TABS                                          -->
      <!-- ========================================================== -->
      <section class="atlas-section-mark vd-section-mark">
        <span class="atlas-section-mark__num">02</span>
        <div class="atlas-section-mark__rule" />
        <div class="atlas-section-mark__title">
          <span class="eyebrow">// SECTIONS</span>
          <h2 class="display-hero">Bedah Vendor</h2>
        </div>
      </section>

      <div class="vd-tabs">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="vd-tab"
          :class="{ 'vd-tab--active': tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- ========================================================== -->
      <!-- TAB CONTENT                                                  -->
      <!-- ========================================================== -->

      <!-- PROFIL: Folio 8:4 dossier prose + margin notes -->
      <section v-if="tab === 'profil'" class="vd-folio">
        <article class="vd-folio__main">
          <!-- Products spread -->
          <div v-if="displayProducts.length" class="vd-spread">
            <span class="eyebrow">// PRODUK INDIKATIF</span>
            <div class="vd-product-chips">
              <span v-for="p in displayProducts" :key="p" class="vd-chip vd-chip--product">{{ p }}</span>
            </div>
          </div>

          <!-- Expos seen -->
          <div v-if="data.expos_seen.length" class="vd-spread">
            <span class="eyebrow">// {{ data.expos_seen.length }} EKSPO TERLIHAT</span>
            <div class="vd-expo-list">
              <RouterLink
                v-for="ex in data.expos_seen"
                :key="ex"
                :to="`/expos/${ex}`"
                class="vd-expo"
              >
                <span class="vd-expo__id num">{{ ex.slice(0, 8) }}</span>
                <span class="vd-expo__label">Ekspo {{ ex.slice(0, 6) }}</span>
                <span class="vd-expo__arrow">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6">
                    <path d="M3 7h8M7 3l4 4-4 4" />
                  </svg>
                </span>
              </RouterLink>
            </div>
          </div>

          <!-- Tech stack -->
          <div v-if="data.tech_stack.length" class="vd-spread">
            <span class="eyebrow">// TECH STACK TERDETEKSI</span>
            <div class="vd-product-chips">
              <span v-for="t in data.tech_stack" :key="t" class="vd-chip vd-chip--tech">{{ t }}</span>
            </div>
          </div>

          <!-- Socials -->
          <div class="vd-spread">
            <span class="eyebrow">// JEJAK SOSIAL</span>
            <div class="vd-socials">
              <a v-if="data.socials.linkedin" :href="data.socials.linkedin" target="_blank" rel="noopener noreferrer" class="vd-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 9v8M7 7v.01M11 17v-5M11 17v-3a2 2 0 0 1 4 0v3M15 17v0"/></svg>
                <span>LinkedIn</span>
              </a>
              <a v-if="data.socials.twitter" :href="data.socials.twitter" target="_blank" rel="noopener noreferrer" class="vd-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l7 9-7 7h2l6-6 5 6h4l-8-9 7-7h-2l-5 5-4-5z"/></svg>
                <span>X</span>
              </a>
              <a v-if="data.socials.github" :href="data.socials.github" target="_blank" rel="noopener noreferrer" class="vd-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4 1-4-2-6-2m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0c-2.4-1.6-3.5-1.3-3.5-1.3a4.2 4.2 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>
                <span>GitHub</span>
              </a>
              <a v-if="data.socials.youtube" :href="data.socials.youtube" target="_blank" rel="noopener noreferrer" class="vd-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>
                <span>YouTube</span>
              </a>
              <a v-if="data.socials.facebook" :href="data.socials.facebook" target="_blank" rel="noopener noreferrer" class="vd-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                <span>Facebook</span>
              </a>
              <span
                v-if="!data.socials.linkedin && !data.socials.twitter && !data.socials.youtube && !data.socials.facebook && !data.socials.github"
                class="text-ink-mute text-sm"
              >
                Tidak ada akun sosial terdeteksi.
              </span>
            </div>
          </div>

          <!-- Enrichment gap -->
          <div v-if="data.enrichment_gap.length" class="vd-gap">
            <div class="flex items-center justify-between gap-3">
              <span class="eyebrow vd-gap__eyebrow">// CELAH DATA &middot; FASE 2</span>
              <EnrichmentBadge :gap="data.enrichment_gap" size="normal" :show-label="true" />
            </div>
            <p class="vd-gap__body">Field-field ini menanti backfill drainer atau Perdalam manual.</p>
            <div class="vd-gap__chips">
              <span v-for="g in data.enrichment_gap" :key="g" class="vd-chip vd-chip--gap">{{ g }}</span>
            </div>
          </div>
        </article>

        <!-- Margin column -->
        <aside class="vd-folio__margin">
          <!-- Domain Info -->
          <div class="vd-note">
            <span class="eyebrow">// DOMAIN</span>
            <dl class="vd-dl">
              <dt>Registrar</dt><dd>{{ data.registrar ?? '—' }}</dd>
              <dt>Negara</dt><dd>{{ data.registrar_country ?? '—' }}</dd>
              <dt>Umur</dt><dd class="num">{{ data.domain_age_days != null ? `${data.domain_age_days}d` : '—' }}</dd>
              <dt>Wayback</dt><dd class="num">{{ data.first_seen_wayback ?? '—' }}</dd>
              <dt>Berdiri</dt><dd class="num">{{ data.founded_year ?? '—' }}</dd>
            </dl>
          </div>

          <!-- Address -->
          <div class="vd-note">
            <span class="eyebrow">// ALAMAT</span>
            <div
              v-if="data.address && (data.address.raw || data.address.street || data.address.city || data.address.region || data.address.country)"
              class="vd-addr"
            >
              <span v-if="data.address.street">{{ data.address.street }}</span>
              <span v-if="data.address.city || data.address.region" class="text-ink-2">
                {{ [data.address.city, data.address.region].filter(Boolean).join(', ') }}
              </span>
              <span v-if="data.address.country" class="vd-addr__country">
                {{ data.address.country }} {{ data.address.postal_code ?? '' }}
              </span>
            </div>
            <p v-else class="text-ink-mute text-sm">Alamat tidak diketahui.</p>
          </div>

          <!-- Funding investors -->
          <div v-if="data.funding?.investors?.length" class="vd-note">
            <span class="eyebrow">// INVESTOR</span>
            <div class="vd-product-chips">
              <span v-for="inv in data.funding.investors" :key="inv" class="vd-chip">{{ inv }}</span>
            </div>
          </div>
        </aside>
      </section>

      <!-- KONTAK -->
      <section v-else-if="tab === 'kontak'" class="vd-contact">
        <div v-if="data.contacts.length" class="vd-contact__grid">
          <article
            v-for="(c, idx) in data.contacts"
            :key="`${c.type}-${idx}`"
            class="vd-contact__card"
            :class="{
              'vd-contact__card--ok': c.verified === true,
              'vd-contact__card--fail': c.verified === false,
            }"
          >
            <div class="vd-contact__head">
              <span class="vd-contact__type">
                <svg v-if="c.type === 'email'" width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="10" height="8" rx="1.2" /><path d="m2 4 5 4 5-4" />
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 2v10c0 .5.5 1 1 1h6c.5 0 1-.5 1-1V2c0-.5-.5-1-1-1H4c-.5 0-1 .5-1 1zM7 11h.01" />
                </svg>
                {{ c.type }}
              </span>
              <span
                v-if="c.verified === true"
                class="trace-verdict trace-verdict--ok"
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m2 6 3 3 5-7" />
                </svg>
                {{ Math.round((c.verification_score ?? 0) * 100) }}%
              </span>
              <span
                v-else-if="c.verified === false"
                class="trace-verdict trace-verdict--crit"
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m3 3 6 6M9 3l-6 6" />
                </svg>
                Invalid
              </span>
            </div>
            <div class="vd-contact__value num">{{ c.value }}</div>
            <div v-if="c.verification_signals" class="vd-contact__signals">
              <span v-if="c.verification_signals.mx_present" class="pill pill-ok">MX</span>
              <span v-if="c.verification_signals.disposable" class="pill pill-crit">Disposable</span>
              <span v-if="c.verification_signals.role_based" class="pill pill-warn">Role</span>
              <span v-if="c.verification_signals.domain_matches_vendor" class="pill pill-amber">Domain Match</span>
            </div>
          </article>
        </div>
        <div v-else class="vd-empty">
          <div class="vd-empty__glyph">
            <svg width="28" height="28" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="3" width="10" height="8" rx="1.2" /><path d="m2 4 5 4 5-4" />
            </svg>
          </div>
          <span class="label label-mute mt-3">Belum ada kontak</span>
          <span class="text-xs text-ink-mute mt-1">Email atau telepon belum berhasil diekstrak.</span>
        </div>
      </section>

      <!-- KATALOG -->
      <section v-else-if="tab === 'katalog'" class="vd-katalog">
        <VendorProductCatalog :vendor="data" @deepen="onDeepenProducts" />
      </section>

      <!-- SUMBER tab dihapus 2026-05-25 (snowglobe reset rule 6: no provenance claims) -->

      <!-- JSON -->
      <section v-else-if="tab === 'json'" class="vd-json">
        <div class="vd-json__head">
          <span class="eyebrow">// RAW PAYLOAD &middot; /api/vendors/{{ data.domain }}</span>
          <button class="btn btn-ghost btn-sm" @click="copyJson">
            <span>Salin</span>
            <span class="btn-icon-nest">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
                <path d="M5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v6" />
              </svg>
            </span>
          </button>
        </div>
        <pre class="vd-json__body num">{{ jsonView }}</pre>
      </section>
    </template>

    <VendorEmailDraftModal
      v-if="data"
      :vendor="data"
      :open="emailDraftOpen"
      @close="emailDraftOpen = false"
    />
  </div>
</template>

<style scoped>
.vd-canvas {
  position: relative;
  min-height: 100dvh;
  padding-bottom: 56px;
}

/* TOPBAR */
.vd-topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 28px 4px;
}
.vd-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
  transition: color var(--dur-160) var(--ease-out);
}
.vd-back:hover { color: rgb(var(--accent)); }

.vd-ticker {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 9999px;
  background: rgb(var(--surface));
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-2));
}
.vd-ticker__tag { color: rgb(var(--accent)); font-weight: 600; }
.vd-ticker__msg {
  flex: 1;
  color: rgb(var(--ink));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vd-ticker__stamp { color: rgb(var(--ink-mute)); }

/* HERO */
.vd-hero {
  position: relative;
  padding: 16px 28px 32px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  overflow: hidden;
}
.vd-hero::before {
  content: '';
  position: absolute;
  inset: -10%;
  z-index: 0;
  background-image: var(--aurora-1), var(--aurora-2), var(--aurora-3);
  background-repeat: no-repeat;
  opacity: 0.45;
  pointer-events: none;
  animation: aurora-drift 22s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
.vd-hero > * { position: relative; z-index: 1; }

.vd-stencil {
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
  color: rgb(var(--ink-mute) / 0.55);
  pointer-events: none;
}

.vd-hero__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 48px;
  align-items: start;
}

/* Identity column */
.vd-identity {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}

.vd-logo {
  position: relative;
  width: 168px;
  height: 168px;
  border-radius: 32px;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  box-shadow: var(--shadow-card);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}
.vd-logo > img,
.vd-logo > .vd-logo__initials,
.vd-logo > .vd-logo__corner { z-index: 1; }
.vd-logo > img { border-radius: inherit; }
.vd-logo[data-elite="true"] {
  background: rgb(var(--surface));
}
.vd-logo img {
  max-width: 78%;
  max-height: 78%;
  object-fit: contain;
}
.vd-logo__initials {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: 80px;
  letter-spacing: -0.05em;
  background: linear-gradient(180deg, rgb(var(--accent-hot)) 0%, rgb(var(--accent)) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.vd-logo__corner {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 28px;
  height: 28px;
  background: linear-gradient(225deg, rgb(var(--accent)) 0%, transparent 50%);
  border-top-right-radius: 32px;
  pointer-events: none;
}

.vd-identity__body { min-width: 0; }
.vd-name {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: clamp(2.5rem, 5.6vw, 5rem);
  line-height: 0.92;
  letter-spacing: -0.045em;
  color: rgb(var(--ink));
  margin: 14px 0 8px;
}
.vd-domain {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Geist Variable', 'Geist', monospace;
  font-size: 14px;
  color: rgb(var(--accent));
  text-decoration: none;
  transition: color var(--dur-160) var(--ease-out);
}
.vd-domain:hover { color: rgb(var(--accent-hot)); }
.vd-domain--mute { color: rgb(var(--ink-mute)); }

.vd-tagline {
  margin: 18px 0 10px;
  font-family: 'Geist Variable', sans-serif;
  font-size: 18px;
  font-style: italic;
  font-weight: 500;
  line-height: 1.45;
  color: rgb(var(--ink));
  border-left: 2px solid rgb(var(--accent));
  padding-left: 16px;
  max-width: 64ch;
  position: relative;
}
.vd-tagline__mark {
  color: rgb(var(--accent));
  font-weight: 700;
  font-size: 0.85em;
  margin: 0 2px;
}

.vd-focus {
  font-size: 15px;
  line-height: 1.55;
  color: rgb(var(--ink-2));
  max-width: 64ch;
  margin: 14px 0;
}
.vd-description {
  font-size: 14px;
  line-height: 1.6;
  color: rgb(var(--ink-2));
  max-width: 70ch;
  margin: 10px 0 16px;
}

.vd-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.vd-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 9999px;
  font-size: 11.5px;
  color: rgb(var(--ink-2));
  background: rgb(var(--surface) / 0.6);
}
.vd-chip--industry {
  color: rgb(var(--accent));
  border-color: rgb(var(--accent) / 0.35);
  background: rgb(var(--accent) / 0.08);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 10.5px;
}
.vd-chip--product {
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
}
.vd-chip--tech {
  color: rgb(var(--cyan));
  border-color: rgb(var(--cyan) / 0.30);
  background: rgb(var(--cyan) / 0.06);
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
}
.vd-chip--gap {
  color: rgb(var(--warn));
  border-color: rgb(var(--warn) / 0.35);
  background: rgb(var(--warn) / 0.08);
  font-weight: 600;
}

/* Margin column */
.vd-margin {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 28px;
  background: rgb(var(--surface));
  box-shadow: var(--shadow-card);
}
.vd-stat__num {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 6px 0 10px;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: 56px;
  line-height: 1.0;
  letter-spacing: -0.04em;
  padding-block: 0.04em;
}
.vd-stat__num.is-ok    { color: rgb(var(--ok)); }
.vd-stat__num.is-amber {
  background: linear-gradient(180deg, rgb(var(--accent-hot)) 0%, rgb(var(--accent)) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.vd-stat__num.is-crit  { color: rgb(var(--crit)); }
.vd-stat__unit {
  font-size: 22px;
  font-weight: 500;
  color: rgb(var(--ink-mute));
  -webkit-text-fill-color: rgb(var(--ink-mute));
}
.vd-stat__bar {
  height: 4px;
  background: rgb(var(--rule) / 0.12);
  border-radius: 9999px;
  overflow: hidden;
}
.vd-stat__bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 900ms cubic-bezier(0.32, 0.72, 0, 1);
}
.vd-stat__bar-fill.is-ok    { background: rgb(var(--ok)); }
.vd-stat__bar-fill.is-amber { background: linear-gradient(90deg, rgb(var(--accent)) 0%, rgb(var(--accent-hot)) 100%); box-shadow: 0 0 12px rgb(var(--accent) / 0.5); }
.vd-stat__bar-fill.is-crit  { background: rgb(var(--crit)); }

.vd-funding {
  padding-top: 18px;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
}
.vd-funding__num {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 28px;
  letter-spacing: -0.03em;
  color: rgb(var(--accent));
  margin-top: 4px;
}
.vd-funding__round {
  display: block;
  margin-top: 4px;
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
  color: rgb(var(--ink-mute));
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.vd-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 18px;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
}
.vd-actions .btn { width: 100%; justify-content: space-between; }

/* SECTION MARK override (smaller for non-root pages) */
.vd-section-mark { padding: 32px 28px 8px; }

/* TABS */
.vd-tabs {
  display: flex;
  gap: 8px;
  padding: 8px 28px 16px;
  flex-wrap: wrap;
}
.vd-tab {
  padding: 10px 18px;
  border-radius: 9999px;
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  background: rgb(var(--surface));
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 12.5px;
  color: rgb(var(--ink-2));
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: all var(--dur-240) var(--ease-out);
}
.vd-tab:hover { transform: translateY(-1px); box-shadow: var(--shadow-card-hover); }
.vd-tab--active {
  background: rgb(var(--ink));
  border-color: rgb(var(--ink));
  color: rgb(var(--surface));
}

/* PROFIL FOLIO */
.vd-folio {
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
  gap: 32px;
  padding: 8px 28px 32px;
}
.vd-folio__main { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
.vd-folio__margin { display: flex; flex-direction: column; gap: 22px; min-width: 0; }

.vd-spread {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
}
.vd-spread:last-child { border-bottom: none; padding-bottom: 0; }
.vd-product-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.vd-expo-list { display: flex; flex-direction: column; gap: 6px; }
.vd-expo {
  display: grid;
  grid-template-columns: 90px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 14px;
  background: rgb(var(--surface));
  text-decoration: none;
  color: rgb(var(--ink));
  transition: all var(--dur-240) var(--ease-out);
}
.vd-expo:hover {
  border-color: rgb(var(--accent) / 0.35);
  background: rgb(var(--accent) / 0.04);
  transform: translateX(2px);
}
.vd-expo__id {
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(var(--accent));
}
.vd-expo__label { font-size: 13px; color: rgb(var(--ink)); }
.vd-expo__arrow { color: rgb(var(--ink-mute)); }
.vd-expo:hover .vd-expo__arrow { color: rgb(var(--accent)); transform: translateX(3px); }

.vd-socials { display: flex; flex-wrap: wrap; gap: 8px; }
.vd-social {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  border-radius: 9999px;
  background: rgb(var(--surface));
  font-size: 13px;
  color: rgb(var(--ink-2));
  text-decoration: none;
  transition: all var(--dur-240) var(--ease-out);
  box-shadow: var(--shadow-card);
}
.vd-social:hover {
  color: rgb(var(--accent));
  border-color: rgb(var(--accent) / 0.5);
  transform: translateY(-1px);
  box-shadow: var(--shadow-card-hover);
}

.vd-gap {
  padding: 18px;
  background: rgb(var(--warn) / 0.04);
  border: 1px solid rgb(var(--warn) / 0.30);
  border-radius: 18px;
}
.vd-gap__eyebrow { color: rgb(var(--warn)); border-color: rgb(var(--warn) / 0.35); }
.vd-gap__body { color: rgb(var(--warn)); margin: 8px 0; font-size: 13px; }
.vd-gap__chips { display: flex; flex-wrap: wrap; gap: 6px; }

/* Margin notes */
.vd-note {
  padding: 18px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 18px;
  background: rgb(var(--surface));
  box-shadow: var(--shadow-card);
}
.vd-dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  margin: 10px 0 0;
}
.vd-dl dt {
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.vd-dl dd {
  font-size: 13px;
  color: rgb(var(--ink));
  margin: 0;
  text-align: right;
}
.vd-addr {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 10px;
  font-size: 13px;
  color: rgb(var(--ink));
}
.vd-addr__country {
  font-weight: 600;
  margin-top: 4px;
}

/* KONTAK */
.vd-contact { padding: 8px 28px 32px; }
.vd-contact__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.vd-contact__card {
  padding: 18px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 18px;
  background: rgb(var(--surface));
  box-shadow: var(--shadow-card);
  transition: all var(--dur-240) var(--ease-out);
}
.vd-contact__card:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover); }
.vd-contact__card--ok   { border-color: rgb(var(--ok) / 0.30); }
.vd-contact__card--fail { border-color: rgb(var(--crit) / 0.30); }
.vd-contact__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.vd-contact__type {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.vd-contact__value {
  font-family: 'Geist Variable', monospace;
  font-size: 14px;
  color: rgb(var(--ink));
  word-break: break-all;
}
.vd-contact__signals { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }

/* KATALOG */
.vd-katalog { padding: 8px 28px 32px; }

/* SUMBER */
.vd-sumber { padding: 8px 28px 32px; }

/* JSON */
.vd-json { padding: 8px 28px 32px; }
.vd-json__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.vd-json__body {
  max-height: 640px;
  overflow: auto;
  padding: 18px;
  font-family: 'Geist Variable', monospace;
  font-size: 12px;
  line-height: 1.55;
  color: rgb(var(--ink-2));
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 18px;
  box-shadow: var(--shadow-card);
  white-space: pre;
}

/* EMPTY */
.vd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
}
.vd-empty__glyph {
  width: 64px;
  height: 64px;
  border-radius: 9999px;
  background: rgb(var(--accent) / 0.08);
  border: 1px solid rgb(var(--accent) / 0.20);
  color: rgb(var(--accent));
  display: flex;
  align-items: center;
  justify-content: center;
}
.vd-empty__pulse {
  width: 80px;
  height: 80px;
  border-radius: 9999px;
  border: 2px dashed rgb(var(--accent) / 0.3);
  animation: pulse-soft 2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

/* Trace verdict styling shared with AgentTracePanel */
.trace-verdict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 9999px;
  font-family: 'Geist Variable', sans-serif;
  font-size: 10.5px;
  font-weight: 600;
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

@media (max-width: 1100px) {
  .vd-stencil { display: none; }
  .vd-topbar { padding: 12px 16px 4px; flex-direction: column; align-items: stretch; }
  .vd-hero { padding: 12px 16px 24px; }
  .vd-hero__layout { grid-template-columns: 1fr; gap: 24px; }
  .vd-identity { grid-template-columns: 1fr; gap: 16px; }
  .vd-logo { width: 120px; height: 120px; border-radius: 24px; }
  .vd-logo__initials { font-size: 56px; }
  .vd-margin { padding: 18px; }
  .vd-folio { grid-template-columns: 1fr; padding: 8px 16px 32px; gap: 24px; }
  .vd-section-mark { padding: 24px 16px 8px; }
  .vd-tabs { padding: 8px 16px 16px; }
  .vd-contact,
  .vd-katalog,
  .vd-sumber,
  .vd-json { padding: 8px 16px 32px; }
}
</style>
