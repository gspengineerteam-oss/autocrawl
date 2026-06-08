<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import type { Vendor } from '@/api/types'
import EnrichmentBadge from '@/components/EnrichmentBadge.vue'
import GeoAvatar from '@/components/GeoAvatar.vue'
import { resolveCountry, flagEmoji } from '@/data/country_resolver'

type Hit = Vendor & { similarity: number | null }

const q = ref('')
const items = ref<Hit[]>([])
const mode = ref<'semantic' | 'lexical' | 'semantic_empty_fallback' | null>(null)
const degraded = ref(false)
const loading = ref(false)
const focusedId = ref<string | null>(null)
const hasSearched = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

let debounceHandle: ReturnType<typeof setTimeout> | null = null
let inflight: AbortController | null = null

function run() {
  if (!q.value || q.value.trim().length < 2) {
    items.value = []
    mode.value = null
    degraded.value = false
    hasSearched.value = false
    return
  }
  if (inflight) inflight.abort()
  inflight = new AbortController()
  loading.value = true
  api
    .vendorsSemantic(q.value.trim(), 30)
    .then((res) => {
      items.value = res.items as Hit[]
      mode.value = res.mode
      degraded.value = res.degraded
      hasSearched.value = true
    })
    .catch(() => {
      items.value = []
      hasSearched.value = true
    })
    .finally(() => {
      loading.value = false
    })
}

watch(q, () => {
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(run, 220)
})

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})

function selectHit(h: Hit) {
  focusedId.value = h.vendor_id
}

const focused = computed<Hit | null>(() => {
  if (!focusedId.value) return null
  return items.value.find((h) => h.vendor_id === focusedId.value) ?? null
})

function similarityBars(s: number | null): number {
  // Map similarity (cosine 0..1) to bar count 1..6. Returns 0 when null
  // (lexical fallback row).
  if (s === null || Number.isNaN(s)) return 0
  const clipped = Math.max(0, Math.min(1, s))
  return Math.max(1, Math.ceil(clipped * 6))
}

function thicknessFor(s: number | null, idx: number): number {
  // Vertical gold-leaf rule renders as 6 stacked segments per row.
  // Thickness varies with similarity instead of showing a number.
  if (s === null) return 1
  const bars = similarityBars(s)
  return idx < bars ? 1 + (bars - idx) * 0.35 : 0.5
}

function placeholderHints(): string {
  return q.value
    ? ''
    : 'Coba "biometrik perbatasan", "OT security Eropa", "drone counter UAS"'
}
</script>

<template>
  <div class="search-stage" :data-has-result="items.length > 0">
    <!-- Stage A: empty hero. Input as the only inhabitant of the viewport. -->
    <div class="search-stage__hero" v-if="!items.length && !hasSearched">
      <div class="search-stage__aurora" aria-hidden="true"></div>
      <header class="search-stage__masthead">
        <span class="label label-amber">Indeks Semantik</span>
        <h1 class="search-stage__title">
          Cari berdasarkan
          <span class="search-stage__title-gold">keahlian</span>.
        </h1>
        <p class="search-stage__lede">
          Bukan nama, bukan domain. Tanya soal apa yang vendor lakukan
          dan biarkan embedding di Chroma yang mencocokkan.
        </p>
      </header>

      <div class="search-stage__input-wrap">
        <input
          ref="inputRef"
          v-model="q"
          type="text"
          class="search-stage__input"
          placeholder="Ajukan pertanyaanmu di sini"
          spellcheck="false"
          autocomplete="off"
        />
        <div class="search-stage__hint">{{ placeholderHints() }}</div>
      </div>
    </div>

    <!-- Stage B: master / detail split after a result lands. -->
    <div class="search-stage__split" v-else>
      <!-- Master column. Ragged single column that pours upward. -->
      <section class="search-stage__master">
        <header class="search-stage__bar">
          <input
            ref="inputRef"
            v-model="q"
            type="text"
            class="search-stage__bar-input"
            placeholder="Ajukan pertanyaan lain"
            spellcheck="false"
            autocomplete="off"
          />
          <span v-if="loading" class="label label-amber">Mencari</span>
          <span v-else-if="degraded" class="search-stage__chip">Cadangan Leksikal</span>
          <span v-else-if="mode === 'semantic_empty_fallback'" class="search-stage__chip">Semantik kosong</span>
          <span v-else class="label label-amber">Semantik</span>
        </header>

        <ol class="search-stage__results">
          <li
            v-for="hit in items"
            :key="hit.vendor_id"
            class="search-stage__row"
            :data-active="focusedId === hit.vendor_id"
            @click="selectHit(hit)"
          >
            <span class="search-stage__rule" aria-hidden="true">
              <span
                v-for="i in 6"
                :key="i"
                class="search-stage__rule-seg"
                :style="{ '--thick': thicknessFor(hit.similarity, i - 1) }"
              />
            </span>
            <div class="search-stage__row-body">
              <div class="search-stage__row-head">
                <span class="search-stage__row-name">{{ hit.company_name }}</span>
                <span v-if="hit.address?.country" class="search-stage__row-country">
                  <span class="text-[12px]">{{ flagEmoji(resolveCountry(hit.address.country)?.cca2 ?? '') }}</span>
                  {{ hit.address.country }}
                </span>
              </div>
              <div class="search-stage__row-meta">
                <span v-if="hit.domain" class="num-display">{{ hit.domain }}</span>
                <EnrichmentBadge :gap="hit.enrichment_gap" size="compact" :show-label="false" />
                <span v-if="hit.similarity !== null" class="search-stage__sim">{{ Math.round((hit.similarity ?? 0) * 100) }}</span>
              </div>
              <p v-if="hit.description" class="search-stage__row-desc">
                {{ hit.description.slice(0, 220) }}
              </p>
            </div>
          </li>
          <li v-if="!items.length && hasSearched && !loading" class="search-stage__empty">
            <span class="label label-mute">Tiada padanan</span>
            <span class="text-ink-mute text-[13px]">Ubah formulasi pertanyaan atau perluas konteks</span>
          </li>
        </ol>
      </section>

      <!-- Detail column. -->
      <aside class="search-stage__detail">
        <div v-if="focused" class="search-stage__detail-body">
          <div class="search-stage__detail-head">
            <span class="search-stage__detail-avatar">
              <img
                v-if="focused.logo_url"
                :src="focused.logo_url"
                :alt="focused.company_name"
                referrerpolicy="no-referrer"
              />
              <GeoAvatar
                v-else
                :seed="focused.vendor_id || focused.domain || focused.company_name"
                :fallback="focused.company_name"
                :size="56"
              />
            </span>
            <div>
              <h2 class="search-stage__detail-name">{{ focused.company_name }}</h2>
              <span v-if="focused.domain" class="num-display text-ink-2">{{ focused.domain }}</span>
            </div>
          </div>
          <EnrichmentBadge :gap="focused.enrichment_gap" />
          <p v-if="focused.description" class="search-stage__detail-desc">{{ focused.description }}</p>
          <div v-if="focused.products?.length" class="search-stage__detail-block">
            <span class="label label-mute">Produk</span>
            <ul class="search-stage__detail-list">
              <li v-for="p in focused.products.slice(0, 10)" :key="p">{{ p }}</li>
            </ul>
          </div>
          <div v-if="focused.industries?.length" class="search-stage__detail-block">
            <span class="label label-mute">Industri</span>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="ind in focused.industries" :key="ind" class="pill">{{ ind }}</span>
            </div>
          </div>
          <RouterLink :to="`/vendors/${focused.vendor_id || focused.domain}`" class="btn btn-primary">
            Buka dosier lengkap
          </RouterLink>
        </div>
        <div v-else class="search-stage__detail-empty">
          <span class="label label-mute">Detail</span>
          <p class="text-ink-mute text-[13px]">Pilih baris hasil untuk membuka panel.</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.search-stage {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 56px);
  background: rgb(var(--bg));
}

.search-stage__hero {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  padding: 6vw 8vw;
  overflow: hidden;
}

.search-stage__aurora {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    var(--aurora-1),
    var(--aurora-2),
    var(--aurora-3);
  opacity: 0.9;
}

.search-stage__masthead {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 900px;
  margin-bottom: 6vh;
}

.search-stage__title {
  font-family: var(--font-display);
  font-size: var(--text-cinema);
  letter-spacing: var(--tracking-cinema);
  line-height: 0.92;
  color: rgb(var(--ink));
  margin: 0;
  font-weight: 600;
}

.search-stage__title-gold {
  color: rgb(var(--accent));
  font-style: italic;
}

.search-stage__lede {
  font-size: var(--text-xl);
  line-height: 1.45;
  color: rgb(var(--ink-2));
  max-width: 56ch;
  margin: 0;
}

.search-stage__input-wrap {
  position: relative;
  border-top: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  padding-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-stage__input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 4.5rem);
  letter-spacing: var(--tracking-display);
  color: rgb(var(--ink));
  padding: 8px 0 16px 0;
  border-bottom: 2px solid rgb(var(--rule) / var(--rule-strong-alpha));
  transition: border-color var(--dur-240) var(--ease-out);
}

.search-stage__input:focus {
  border-bottom-color: rgb(var(--accent));
}

.search-stage__input::placeholder {
  color: rgb(var(--ink-mute));
  font-style: italic;
}

.search-stage__hint {
  font-size: var(--text-sm);
  color: rgb(var(--ink-mute));
  font-style: italic;
  letter-spacing: var(--tracking-tight);
}

.search-stage__split {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  min-height: calc(100vh - 56px);
}

.search-stage__master {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgb(var(--rule) / var(--rule-alpha));
  background: rgb(var(--bg));
}

.search-stage__bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  background: rgb(var(--bg) / 0.96);
  backdrop-filter: blur(var(--glass-blur));
}

.search-stage__bar-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  letter-spacing: var(--tracking-tight);
  color: rgb(var(--ink));
}

.search-stage__bar-input::placeholder {
  color: rgb(var(--ink-mute));
  font-style: italic;
}

.search-stage__chip {
  font-family: var(--font-sans);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-stencil);
  text-transform: uppercase;
  color: rgb(var(--warn));
  border: 1px solid rgb(var(--warn) / 0.4);
  padding: 4px 8px;
  border-radius: 2px;
  background: rgb(var(--warn) / 0.06);
}

.search-stage__results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.search-stage__row {
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 20px;
  padding: 26px 28px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  cursor: pointer;
  transition: background var(--dur-160) var(--ease-out);
}

.search-stage__row:hover,
.search-stage__row[data-active='true'] {
  background: rgb(var(--accent) / 0.04);
}

.search-stage__rule {
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
  align-items: flex-end;
}

.search-stage__rule-seg {
  display: block;
  width: calc(2px * var(--thick));
  height: 10px;
  background: rgb(var(--accent));
  border-radius: 1px;
  opacity: calc(0.3 + var(--thick) * 0.2);
}

.search-stage__row-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.search-stage__row-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
}

.search-stage__row-name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  letter-spacing: var(--tracking-tight);
  color: rgb(var(--ink));
  font-weight: 500;
}

.search-stage__row-country {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: rgb(var(--ink-2));
  letter-spacing: var(--tracking-stencil);
  text-transform: uppercase;
}

.search-stage__row-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: var(--text-xs);
  color: rgb(var(--ink-mute));
}

.search-stage__sim {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: rgb(var(--accent));
  letter-spacing: var(--tracking-stencil);
}

.search-stage__row-desc {
  font-size: var(--text-sm);
  line-height: 1.55;
  color: rgb(var(--ink-2));
  margin: 0;
  max-width: 64ch;
}

.search-stage__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 80px 28px;
}

.search-stage__detail {
  position: sticky;
  top: 0;
  height: calc(100vh - 56px);
  overflow-y: auto;
  padding: 40px;
  background: rgb(var(--surface));
  border-left: 1px solid rgb(var(--rule) / var(--rule-alpha));
}

.search-stage__detail-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 32px;
}

.search-stage__detail-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.search-stage__detail-head {
  display: flex;
  gap: 18px;
  align-items: center;
}

.search-stage__detail-avatar {
  display: inline-flex;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  overflow: hidden;
  background: rgb(var(--surface-2));
  align-items: center;
  justify-content: center;
}

.search-stage__detail-avatar img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 4px;
  background: rgb(var(--surface));
}

.search-stage__detail-name {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  letter-spacing: var(--tracking-display);
  color: rgb(var(--ink));
  margin: 0;
  font-weight: 600;
}

.search-stage__detail-desc {
  font-size: var(--text-base);
  line-height: 1.6;
  color: rgb(var(--ink-2));
  margin: 0;
}

.search-stage__detail-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-stage__detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--text-sm);
  color: rgb(var(--ink-2));
}

.search-stage__detail-list li {
  padding-left: 16px;
  position: relative;
}

.search-stage__detail-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 6px;
  height: 1px;
  background: rgb(var(--accent));
}

@media (max-width: 1100px) {
  .search-stage__split {
    grid-template-columns: 1fr;
  }
  .search-stage__detail {
    position: relative;
    height: auto;
    border-left: none;
    border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
  }
}
</style>
