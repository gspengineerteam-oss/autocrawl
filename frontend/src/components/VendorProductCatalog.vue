<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { Vendor, Product } from '@/api/types'
import TagBadge from './TagBadge.vue'

/**
 * Vendor Product Catalog — refined-cinematic register, magazine spread.
 *
 * COVER: cinema-scale vendor-fit numeral on the left, focus summary
 *        and DoI as editorial body on the right. Solid gold gradient.
 *
 * GRID:  product cards arranged as masonry-style asymmetric bento.
 *        Each card uses double-bezel surface treatment, with a circular
 *        scope-fit ring meter in the corner. Hover: 3D tilt + lift.
 *
 * MODAL: theatrical full-overlay backdrop. Product detail slides up
 *        from below in a magazine-spread layout (image LEFT, prose RIGHT).
 *        Pros / cons as a vertical ledger with animated check / x marks.
 *        Backdrop dismisses; Esc dismisses; CTA "Buka Sumber" on bottom-right.
 */

const props = defineProps<{ vendor: Vendor }>()
const emit = defineEmits<{ (e: 'deepen'): void }>()

const detailed = computed<Product[]>(() => props.vendor.products_detailed ?? [])
const legacy = computed<string[]>(() => props.vendor.products ?? [])
const hasDetailed = computed(() => detailed.value.length > 0)
const overallScore = computed(() => props.vendor.overall_scope_score ?? 0)
const overallPct = computed(() => Math.round(overallScore.value * 100))
const focusSummary = computed(() => props.vendor.focus_summary || null)
const doiTags = computed<string[]>(() => props.vendor.domain_of_interest ?? [])
const vendorName = computed(() => props.vendor.company_name || props.vendor.domain || 'Vendor')

function pct(score: number): number { return Math.round(score * 100) }
function scoreTone(score: number): 'crit' | 'amber' | 'ok' {
  if (score >= 0.7) return 'ok'
  if (score >= 0.3) return 'amber'
  return 'crit'
}
function toneLabel(score: number): string {
  const t = scoreTone(score)
  return t === 'ok' ? '' : t === 'amber' ? 'Sebagian' : 'Rendah'
}

function initials(name: string): string {
  return name
    .split(/[\s\-_·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

const productImgFailed = ref<Set<number>>(new Set())
function onProductImgErr(idx: number) {
  const next = new Set(productImgFailed.value)
  next.add(idx)
  productImgFailed.value = next
}

/* Modal state */
const activeIdx = ref<number | null>(null)
const activeProduct = computed<Product | null>(() =>
  activeIdx.value !== null ? detailed.value[activeIdx.value] ?? null : null,
)
function openProduct(idx: number) {
  activeIdx.value = idx
  if (typeof document !== 'undefined') document.body.style.overflow = 'hidden'
}
function closeProduct() {
  activeIdx.value = null
  if (typeof document !== 'undefined') document.body.style.overflow = ''
}
function navProduct(delta: number) {
  if (activeIdx.value === null) return
  const n = detailed.value.length
  if (n === 0) return
  activeIdx.value = (activeIdx.value + delta + n) % n
}
useEventListener('keydown', (e: KeyboardEvent) => {
  if (activeIdx.value === null) return
  if (e.key === 'Escape') closeProduct()
  if (e.key === 'ArrowRight') navProduct(1)
  if (e.key === 'ArrowLeft')  navProduct(-1)
})

const mounted = ref(false)
onMounted(() => { requestAnimationFrame(() => { mounted.value = true }) })

function deepen() { emit('deepen') }

/* Ring meter circumference for SVG dasharray-driven progress arc */
const RING_RADIUS = 28
const RING_CIRC = 2 * Math.PI * RING_RADIUS

/* 3D tilt math driven by pointer position relative to card center.
 * Returns transform string that's applied via inline style. Reset on leave. */
const tilt = ref<Map<number, { x: number; y: number }>>(new Map())
function onCardMove(idx: number, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const cx = e.clientX - r.left - r.width / 2
  const cy = e.clientY - r.top - r.height / 2
  const rx = (cy / r.height) * -6   // tilt-up when cursor below center
  const ry = (cx / r.width)  *  8
  const next = new Map(tilt.value)
  next.set(idx, { x: rx, y: ry })
  tilt.value = next
}
function onCardLeave(idx: number) {
  const next = new Map(tilt.value)
  next.delete(idx)
  tilt.value = next
}
function tiltStyle(idx: number) {
  const t = tilt.value.get(idx)
  if (!t) return {}
  return {
    transform: `perspective(1100px) rotateX(${t.x.toFixed(2)}deg) rotateY(${t.y.toFixed(2)}deg) translateY(-3px)`,
  }
}
</script>

<template>
  <div class="cat-root">
    <!-- ============================================================== -->
    <!-- COVER — cinema-scale fit + focus summary                         -->
    <!-- ============================================================== -->
    <section class="cat-cover" :class="{ 'is-mounted': mounted }">
      <div class="cat-cover__layout">
        <!-- Cinema fit numeral -->
        <div v-if="hasDetailed" class="cat-fit" :data-tone="scoreTone(overallScore)">
          <span class="eyebrow">// VENDOR FIT</span>
          <div class="cat-fit__num">
            <span class="num">{{ overallPct }}</span>
            <span class="cat-fit__unit">%</span>
          </div>
          <span class="cat-fit__label"><template v-if="toneLabel(overallScore)">{{ toneLabel(overallScore) }} &middot; </template>{{ detailed.length }} produk dianalisis</span>
        </div>
        <div v-else class="cat-fit cat-fit--empty">
          <span class="eyebrow">// VENDOR FIT</span>
          <div class="cat-fit__num cat-fit__num--empty">
            <span class="num">—</span>
          </div>
          <span class="cat-fit__label">Belum di-enrich</span>
        </div>

        <!-- Editorial body -->
        <div class="cat-prose">
          <span class="eyebrow eyebrow-accent">// DOSSIER PRODUK</span>
          <h2 class="cat-name">{{ vendorName }}</h2>
          <p v-if="focusSummary" class="cat-summary">{{ focusSummary }}</p>
          <p v-else class="cat-summary cat-summary--mute">
            Ringkasan fokus belum disusun. Jalankan deepen agar entri ini diisi.
          </p>
          <div v-if="doiTags.length" class="cat-tags">
            <TagBadge v-for="tag in doiTags" :key="tag" :raw="tag" size="sm" variant="outline" />
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- CARD GRID — bento-style, asymmetric, 3D tilt on hover            -->
    <!-- ============================================================== -->
    <section v-if="hasDetailed" class="cat-grid">
      <article
        v-for="(p, idx) in detailed"
        :key="`${p.name}-${idx}`"
        class="cat-card"
        :class="{ 'is-mounted': mounted }"
        :style="{ ...tiltStyle(idx), animationDelay: (80 + idx * 50) + 'ms' }"
        :data-tone="scoreTone(p.scope_match_score)"
        :data-elite="p.scope_match_score >= 0.9 ? 'true' : 'false'"
        data-elite-style="inset"
        @click="openProduct(idx)"
        @mousemove="onCardMove(idx, $event)"
        @mouseleave="onCardLeave(idx)"
      >
        <!-- Image hero -->
        <figure class="cat-card__img">
          <img
            v-if="p.image_url && !productImgFailed.has(idx)"
            :src="p.image_url"
            :alt="p.name"
            loading="lazy"
            @error="onProductImgErr(idx)"
          />
          <div v-else class="cat-card__img-empty">
            <span class="cat-card__img-mark">{{ initials(p.name) }}</span>
          </div>

          <!-- Ring meter overlay — top-right of image -->
          <div class="cat-ring" :data-tone="scoreTone(p.scope_match_score)">
            <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
              <circle cx="36" cy="36" r="28" class="cat-ring__bg" />
              <circle
                cx="36" cy="36" r="28"
                class="cat-ring__bar"
                :style="{
                  strokeDasharray: `${(p.scope_match_score * RING_CIRC).toFixed(2)} ${RING_CIRC}`,
                }"
              />
            </svg>
            <div class="cat-ring__num">
              <span class="num">{{ pct(p.scope_match_score) }}</span>
              <span class="cat-ring__pct">%</span>
            </div>
          </div>
        </figure>

        <!-- Body -->
        <div class="cat-card__body">
          <span v-if="p.category" class="cat-card__cat">{{ p.category }}</span>
          <h3 class="cat-card__name">{{ p.name }}</h3>
          <p v-if="p.summary" class="cat-card__summary">{{ p.summary }}</p>
        </div>

        <!-- Footer chips -->
        <footer class="cat-card__foot">
          <span v-if="toneLabel(p.scope_match_score)" class="cat-foot__chip cat-foot__chip--label">{{ toneLabel(p.scope_match_score) }}</span>
          <span v-if="p.pros.length" class="cat-foot__chip cat-foot__chip--pro">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
            {{ p.pros.length }}
          </span>
          <span v-if="p.cons.length" class="cat-foot__chip cat-foot__chip--con">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 6h10" />
            </svg>
            {{ p.cons.length }}
          </span>
          <span class="cat-foot__open">
            Buka
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7h8M7 3l4 4-4 4" />
            </svg>
          </span>
        </footer>
      </article>
    </section>

    <!-- ============================================================== -->
    <!-- EMPTY STATE                                                      -->
    <!-- ============================================================== -->
    <article v-else class="cat-empty">
      <div class="cat-empty__glyph">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7l9-5 9 5M3 7l9 5 9-5M12 12v9" />
        </svg>
      </div>
      <span class="eyebrow">// KATALOG BELUM DIRINCI</span>
      <h3 class="display-sans cat-empty__title">Belum di-enrich</h3>
      <p class="cat-empty__body">
        Katalog produk dengan analisis scope-fit belum tersedia untuk vendor ini.
        <template v-if="legacy.length">
          Saat ini hanya ada {{ legacy.length }} produk generik tanpa skor.
        </template>
        <template v-else>
          Vendor belum punya daftar produk apa pun.
        </template>
      </p>
      <div v-if="legacy.length" class="cat-empty__chips">
        <span v-for="(item, i) in legacy" :key="i" class="cat-tag">{{ item }}</span>
      </div>
      <button v-if="legacy.length" type="button" class="btn btn-amber mt-6" @click="deepen">
        <span>Enrich Katalog Sekarang</span>
        <span class="btn-icon-nest">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7h8M7 3l4 4-4 4" />
          </svg>
        </span>
      </button>
    </article>

    <!-- ============================================================== -->
    <!-- THEATRICAL MODAL — magazine spread                               -->
    <!-- ============================================================== -->
    <Teleport to="body">
      <Transition name="cat-modal">
        <div
          v-if="activeProduct && activeIdx !== null"
          class="cat-modal"
          @click.self="closeProduct"
        >
          <div class="cat-modal__scrim" aria-hidden="true" />
          <article class="cat-sheet">
            <header class="cat-sheet__head">
              <div class="cat-sheet__page">
                <span class="num">{{ String(activeIdx + 1).padStart(2, '0') }}</span>
                <span class="cat-sheet__page-sep">/</span>
                <span class="num">{{ String(detailed.length).padStart(2, '0') }}</span>
              </div>
              <div class="cat-sheet__nav">
                <button class="cat-sheet__navbtn" @click="navProduct(-1)" aria-label="Sebelumnya">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 3 5 7l4 4" />
                  </svg>
                </button>
                <button class="cat-sheet__navbtn" @click="navProduct(1)" aria-label="Berikutnya">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m5 3 4 4-4 4" />
                  </svg>
                </button>
                <button class="cat-sheet__close" @click="closeProduct" aria-label="Tutup">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m3 3 8 8M11 3l-8 8" />
                  </svg>
                </button>
              </div>
            </header>

            <div class="cat-sheet__body">
              <!-- LEFT: image + ring meter + category -->
              <section class="cat-sheet__left">
                <div class="cat-sheet__img-wrap">
                  <img
                    v-if="activeProduct.image_url && !productImgFailed.has(activeIdx)"
                    :src="activeProduct.image_url"
                    :alt="activeProduct.name"
                    class="cat-sheet__img"
                    @error="onProductImgErr(activeIdx)"
                  />
                  <div v-else class="cat-sheet__img cat-sheet__img--empty">
                    <span>{{ initials(activeProduct.name) }}</span>
                  </div>

                  <!-- Big ring meter -->
                  <div class="cat-sheet__ring" :data-tone="scoreTone(activeProduct.scope_match_score)">
                    <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
                      <circle cx="60" cy="60" r="48" class="cat-ring__bg" />
                      <circle
                        cx="60" cy="60" r="48"
                        class="cat-ring__bar cat-ring__bar--lg"
                        :style="{
                          strokeDasharray: `${(activeProduct.scope_match_score * 2 * Math.PI * 48).toFixed(2)} ${(2 * Math.PI * 48).toFixed(2)}`,
                        }"
                      />
                    </svg>
                    <div class="cat-sheet__ring-num">
                      <span class="num">{{ pct(activeProduct.scope_match_score) }}</span>
                      <span class="cat-sheet__ring-unit">%</span>
                      <span v-if="toneLabel(activeProduct.scope_match_score)" class="cat-sheet__ring-label">{{ toneLabel(activeProduct.scope_match_score) }}</span>
                    </div>
                  </div>
                </div>

                <span v-if="activeProduct.category" class="cat-sheet__cat">{{ activeProduct.category }}</span>
              </section>

              <!-- RIGHT: prose, pros/cons, topics -->
              <section class="cat-sheet__right">
                <h2 class="cat-sheet__title">{{ activeProduct.name }}</h2>

                <p v-if="activeProduct.summary" class="cat-sheet__summary">
                  {{ activeProduct.summary }}
                </p>
                <p v-else class="cat-sheet__summary cat-sheet__summary--mute">
                  Tidak ada ringkasan deskriptif untuk produk ini.
                </p>

                <blockquote v-if="activeProduct.scope_match_reason" class="cat-sheet__reason">
                  {{ activeProduct.scope_match_reason }}
                </blockquote>

                <!-- Pros / Cons ledger -->
                <div class="cat-sheet__ledger">
                  <div class="cat-sheet__col">
                    <div class="cat-sheet__col-head cat-sheet__col-head--pro">
                      <span class="cat-sheet__col-glyph">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="m2 6 3 3 5-7" />
                        </svg>
                      </span>
                      <span>Kelebihan</span>
                      <span class="num cat-sheet__col-count">{{ activeProduct.pros.length }}</span>
                    </div>
                    <ul class="cat-sheet__list">
                      <li
                        v-for="(pro, i) in activeProduct.pros"
                        :key="`pro-${i}`"
                        class="cat-sheet__li cat-sheet__li--pro"
                        :style="{ animationDelay: (i * 60) + 'ms' }"
                      >
                        <span class="cat-sheet__li-bullet" />
                        <span>{{ pro }}</span>
                      </li>
                      <li v-if="!activeProduct.pros.length" class="cat-sheet__li-empty">Tidak tercatat.</li>
                    </ul>
                  </div>
                  <div class="cat-sheet__col">
                    <div class="cat-sheet__col-head cat-sheet__col-head--con">
                      <span class="cat-sheet__col-glyph">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M1 6h10" />
                        </svg>
                      </span>
                      <span>Kekurangan</span>
                      <span class="num cat-sheet__col-count">{{ activeProduct.cons.length }}</span>
                    </div>
                    <ul class="cat-sheet__list">
                      <li
                        v-for="(con, i) in activeProduct.cons"
                        :key="`con-${i}`"
                        class="cat-sheet__li cat-sheet__li--con"
                        :style="{ animationDelay: (i * 60) + 'ms' }"
                      >
                        <span class="cat-sheet__li-bullet" />
                        <span>{{ con }}</span>
                      </li>
                      <li v-if="!activeProduct.cons.length" class="cat-sheet__li-empty">Tidak tercatat.</li>
                    </ul>
                  </div>
                </div>

                <!-- Matched topics -->
                <div v-if="activeProduct.matched_topics.length" class="cat-sheet__topics">
                  <span class="eyebrow">// TOPIK COCOK</span>
                  <div class="cat-sheet__topic-chips">
                    <TagBadge v-for="t in activeProduct.matched_topics" :key="t" :raw="t" size="sm" />
                  </div>
                </div>

                <!-- Source -->
                <footer class="cat-sheet__foot">
                  <a
                    v-if="activeProduct.source_url"
                    :href="activeProduct.source_url"
                    target="_blank"
                    rel="noopener"
                    class="btn btn-amber"
                  >
                    <span>Buka Sumber</span>
                    <span class="btn-icon-nest">
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 9 9 5M5 5h4v4" />
                      </svg>
                    </span>
                  </a>
                  <span class="cat-sheet__hint">
                    Esc tutup &middot; ← → navigasi
                  </span>
                </footer>
              </section>
            </div>
          </article>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.cat-root { display: flex; flex-direction: column; gap: 28px; }

/* ===== COVER ===== */
.cat-cover {
  padding: 32px 32px 28px;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 32px;
  box-shadow: var(--shadow-card);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 700ms cubic-bezier(0.32, 0.72, 0, 1),
              transform 700ms cubic-bezier(0.32, 0.72, 0, 1);
  position: relative;
  overflow: hidden;
}
.cat-cover.is-mounted { opacity: 1; transform: translateY(0); }
.cat-cover::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 70% at 0% 100%, rgb(var(--accent) / 0.10), transparent 70%);
  pointer-events: none;
}
.cat-cover > * { position: relative; z-index: 1; }

.cat-cover__layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 48px;
  align-items: end;
}

.cat-fit { display: flex; flex-direction: column; gap: 4px; }
.cat-fit__num {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: clamp(4rem, 9vw, 8rem);
  line-height: 1.0;
  letter-spacing: -0.05em;
  padding-block: 0.04em;
}
.cat-fit__num .num {
  background: linear-gradient(180deg, rgb(var(--accent-hot)) 0%, rgb(var(--accent)) 60%, rgb(var(--accent-glow, var(--accent))) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-variant-numeric: tabular-nums;
}
.cat-fit__unit {
  font-size: 28px;
  color: rgb(var(--ink-mute));
  font-weight: 500;
  letter-spacing: 0;
}
.cat-fit__label {
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
  margin-top: 8px;
}
.cat-fit[data-tone="ok"] .cat-fit__num .num   { background: linear-gradient(180deg, rgb(var(--ok)) 0%, rgb(var(--ok)) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.cat-fit[data-tone="crit"] .cat-fit__num .num { background: linear-gradient(180deg, rgb(var(--crit)) 0%, rgb(var(--crit)) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.cat-fit__num--empty .num { color: rgb(var(--ink-mute)); -webkit-text-fill-color: rgb(var(--ink-mute)); background: none; }

.cat-prose { display: flex; flex-direction: column; gap: 12px; padding-bottom: 14px; }
.cat-name {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 0.96;
  letter-spacing: -0.04em;
  color: rgb(var(--ink));
  margin: 6px 0 0;
}
.cat-summary {
  font-size: 14.5px;
  line-height: 1.55;
  color: rgb(var(--ink-2));
  margin: 4px 0 0;
  max-width: 64ch;
}
.cat-summary--mute { color: rgb(var(--ink-mute)); font-style: italic; }
.cat-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.cat-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 9999px;
  font-size: 11.5px;
  color: rgb(var(--ink-2));
  background: rgb(var(--surface));
}

/* ===== CARD GRID ===== */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
}
.cat-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 24px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transform-style: preserve-3d;
  transition:
    transform 320ms cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 320ms cubic-bezier(0.32, 0.72, 0, 1),
    border-color 320ms cubic-bezier(0.32, 0.72, 0, 1);
  opacity: 0;
  animation: card-enter 600ms cubic-bezier(0.32, 0.72, 0, 1) both;
}
.cat-card.is-mounted { opacity: 1; }
.cat-card:hover {
  box-shadow: var(--shadow-card-hover);
  border-color: rgb(var(--accent) / 0.35);
}
.cat-card:active { transform: scale(0.99); }
@keyframes card-enter {
  0% { opacity: 0; transform: translateY(14px) scale(0.985); filter: blur(6px); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

.cat-card__img {
  position: relative;
  aspect-ratio: 16 / 10;
  margin: 0;
  background: rgb(var(--surface-2));
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  overflow: hidden;
}
.cat-card__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cat-card:hover .cat-card__img img { transform: scale(1.04); }
.cat-card__img-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgb(var(--surface-2)) 0%, rgb(var(--surface-3)) 100%);
}
.cat-card__img-mark {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: 56px;
  letter-spacing: -0.04em;
  background: linear-gradient(180deg, rgb(var(--accent-hot)) 0%, rgb(var(--accent)) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* RING METER (small, on card) */
.cat-ring {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--bg) / 0.86);
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border-radius: 9999px;
  box-shadow: var(--shadow-card);
}
.cat-ring svg { transform: rotate(-90deg); }
.cat-ring__bg {
  fill: none;
  stroke: rgb(var(--rule) / 0.14);
  stroke-width: 5;
}
.cat-ring__bar {
  fill: none;
  stroke: rgb(var(--accent));
  stroke-width: 5;
  stroke-linecap: round;
  transition: stroke-dasharray 900ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cat-ring[data-tone="ok"]   .cat-ring__bar { stroke: rgb(var(--ok)); }
.cat-ring[data-tone="crit"] .cat-ring__bar { stroke: rgb(var(--crit)); }
.cat-ring__num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 1px;
  padding-top: 22px;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.04em;
  color: rgb(var(--ink));
}
.cat-ring__pct { font-size: 10px; color: rgb(var(--ink-mute)); font-weight: 500; }

.cat-card__body {
  padding: 16px 18px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.cat-card__cat {
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.cat-card__name {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 18px;
  line-height: 1.2;
  letter-spacing: -0.018em;
  color: rgb(var(--ink));
  margin: 0;
}
.cat-card__summary {
  font-size: 12.5px;
  line-height: 1.5;
  color: rgb(var(--ink-2));
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cat-card__foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 18px 16px;
  flex-wrap: wrap;
}
.cat-foot__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 9999px;
  font-family: 'Geist Variable', monospace;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  border: 1px solid;
}
.cat-card[data-tone="ok"]    .cat-foot__chip--label { color: rgb(var(--ok));    border-color: rgb(var(--ok) / 0.35);    background: rgb(var(--ok) / 0.08); }
.cat-card[data-tone="amber"] .cat-foot__chip--label { color: rgb(var(--accent)); border-color: rgb(var(--accent) / 0.35); background: rgb(var(--accent) / 0.08); }
.cat-card[data-tone="crit"]  .cat-foot__chip--label { color: rgb(var(--crit));  border-color: rgb(var(--crit) / 0.35);  background: rgb(var(--crit) / 0.08); }
.cat-foot__chip--pro { color: rgb(var(--ok));   border-color: rgb(var(--ok) / 0.30);   background: rgb(var(--ok) / 0.06); }
.cat-foot__chip--con { color: rgb(var(--crit)); border-color: rgb(var(--crit) / 0.30); background: rgb(var(--crit) / 0.06); }
.cat-foot__open {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 12px;
  color: rgb(var(--ink-mute));
  transition: color var(--dur-160) var(--ease-out), transform var(--dur-160) var(--ease-out);
}
.cat-card:hover .cat-foot__open { color: rgb(var(--accent)); transform: translateX(2px); }

/* ===== EMPTY STATE ===== */
.cat-empty {
  padding: 56px 40px;
  text-align: center;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 28px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.cat-empty__glyph {
  width: 72px;
  height: 72px;
  border-radius: 9999px;
  background: rgb(var(--accent) / 0.08);
  border: 1px solid rgb(var(--accent) / 0.20);
  color: rgb(var(--accent));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}
.cat-empty__title { font-size: 26px; margin-top: 4px; }
.cat-empty__body { max-width: 520px; color: rgb(var(--ink-2)); font-size: 14px; line-height: 1.55; }
.cat-empty__chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 14px; }

/* ===== MODAL — magazine spread ===== */
.cat-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.cat-modal__scrim {
  position: absolute;
  inset: 0;
  background: rgb(var(--bg) / 0.55);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
}
.cat-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1140px, 100%);
  max-height: 92dvh;
  overflow: hidden;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  border-radius: 32px;
  box-shadow:
    0 32px 80px -16px rgb(0 0 0 / 0.35),
    0 80px 160px -40px rgb(var(--accent) / 0.30);
  isolation: isolate;
}

.cat-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  flex-shrink: 0;
}
.cat-sheet__page {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: 'Geist Variable', monospace;
  font-size: 16px;
  color: rgb(var(--accent));
  font-weight: 600;
  letter-spacing: 0.04em;
}
.cat-sheet__page-sep { color: rgb(var(--ink-mute)); font-weight: 400; }
.cat-sheet__nav { display: flex; align-items: center; gap: 6px; }
.cat-sheet__navbtn,
.cat-sheet__close {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  background: rgb(var(--surface));
  color: rgb(var(--ink-2));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--dur-160) var(--ease-out);
}
.cat-sheet__navbtn:hover { color: rgb(var(--accent)); border-color: rgb(var(--accent) / 0.35); transform: translateY(-1px); }
.cat-sheet__close {
  background: rgb(var(--ink));
  border-color: rgb(var(--ink));
  color: rgb(var(--surface));
  margin-left: 6px;
}
.cat-sheet__close:hover { transform: translateY(-1px) rotate(90deg); }

.cat-sheet__body {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 0;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

/* LEFT — image + ring */
.cat-sheet__left {
  position: relative;
  padding: 28px;
  background: linear-gradient(180deg, rgb(var(--surface)) 0%, rgb(var(--surface-2)) 100%);
  border-right: 1px solid rgb(var(--rule) / var(--rule-alpha));
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
}
.cat-sheet__img-wrap {
  position: relative;
  aspect-ratio: 1 / 1;
  width: 100%;
  border-radius: 20px;
  overflow: visible;
}
.cat-sheet__img {
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 20px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
}
.cat-sheet__img--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgb(var(--surface-2)) 0%, rgb(var(--surface-3)) 100%);
  color: transparent;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: 96px;
  letter-spacing: -0.05em;
}
.cat-sheet__img--empty span {
  background: linear-gradient(180deg, rgb(var(--accent-hot)) 0%, rgb(var(--accent)) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.cat-sheet__ring {
  position: absolute;
  bottom: -24px;
  right: -16px;
  width: 120px;
  height: 120px;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 9999px;
  box-shadow: var(--shadow-card-hover);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cat-sheet__ring svg { transform: rotate(-90deg); }
.cat-ring__bar--lg { stroke-width: 6; }
.cat-sheet__ring[data-tone="ok"]   .cat-ring__bar { stroke: rgb(var(--ok)); }
.cat-sheet__ring[data-tone="crit"] .cat-ring__bar { stroke: rgb(var(--crit)); }
.cat-sheet__ring-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.cat-sheet__ring-num .num {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: 32px;
  line-height: 1;
  letter-spacing: -0.03em;
  color: rgb(var(--ink));
  font-variant-numeric: tabular-nums;
}
.cat-sheet__ring-unit {
  font-size: 11px;
  color: rgb(var(--ink-mute));
  margin-top: 2px;
}
.cat-sheet__ring-label {
  font-family: 'Geist Variable', monospace;
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
  margin-top: 4px;
}

.cat-sheet__cat {
  align-self: flex-start;
  margin-top: 22px;
  padding: 4px 12px;
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  border-radius: 9999px;
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-2));
  background: rgb(var(--surface));
}

/* RIGHT — prose, pros/cons */
.cat-sheet__right {
  padding: 28px 32px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.cat-sheet__title {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  line-height: 1.05;
  letter-spacing: -0.035em;
  color: rgb(var(--ink));
  margin: 0;
}
.cat-sheet__summary {
  font-size: 15px;
  line-height: 1.55;
  color: rgb(var(--ink));
  margin: 0;
  max-width: 64ch;
}
.cat-sheet__summary--mute { color: rgb(var(--ink-mute)); font-style: italic; }
.cat-sheet__reason {
  margin: 0;
  padding: 14px 18px;
  background: rgb(var(--accent) / 0.06);
  border: 1px solid rgb(var(--accent) / 0.25);
  border-radius: 14px;
  font-style: italic;
  font-size: 13.5px;
  line-height: 1.55;
  color: rgb(var(--ink-2));
}

.cat-sheet__ledger {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 18px 0;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
}
.cat-sheet__col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 10px;
}
.cat-sheet__col-head--pro { color: rgb(var(--ok)); }
.cat-sheet__col-head--con { color: rgb(var(--crit)); }
.cat-sheet__col-glyph {
  display: inline-flex;
  width: 22px; height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid currentColor;
  background: rgb(255 255 255 / 0);
}
.cat-sheet__col-head--pro .cat-sheet__col-glyph { background: rgb(var(--ok) / 0.10); }
.cat-sheet__col-head--con .cat-sheet__col-glyph { background: rgb(var(--crit) / 0.10); }
.cat-sheet__col-count {
  margin-left: auto;
  font-size: 14px;
  color: rgb(var(--ink-mute));
  font-weight: 500;
}
.cat-sheet__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.cat-sheet__li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13.5px;
  line-height: 1.5;
  color: rgb(var(--ink));
  animation: li-enter 500ms cubic-bezier(0.32, 0.72, 0, 1) both;
}
.cat-sheet__li-bullet {
  flex-shrink: 0;
  width: 6px; height: 6px;
  border-radius: 9999px;
  margin-top: 8px;
}
.cat-sheet__li--pro .cat-sheet__li-bullet { background: rgb(var(--ok)); box-shadow: 0 0 8px rgb(var(--ok) / 0.55); }
.cat-sheet__li--con .cat-sheet__li-bullet { background: rgb(var(--crit)); box-shadow: 0 0 8px rgb(var(--crit) / 0.55); }
.cat-sheet__li-empty { font-size: 12.5px; color: rgb(var(--ink-mute)); font-style: italic; }
@keyframes li-enter {
  0% { opacity: 0; transform: translateX(-6px); }
  100% { opacity: 1; transform: translateX(0); }
}

.cat-sheet__topics { display: flex; flex-direction: column; gap: 8px; }
.cat-sheet__topic-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.cat-sheet__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
  flex-wrap: wrap;
}
.cat-sheet__hint {
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}

/* Modal enter/leave */
.cat-modal-enter-active { transition: opacity 280ms cubic-bezier(0.32, 0.72, 0, 1); }
.cat-modal-leave-active { transition: opacity 240ms cubic-bezier(0.32, 0.72, 0, 1); }
.cat-modal-enter-from,
.cat-modal-leave-to { opacity: 0; }
.cat-modal-enter-active .cat-sheet,
.cat-modal-leave-active .cat-sheet {
  transition:
    transform 480ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity   480ms cubic-bezier(0.32, 0.72, 0, 1),
    filter    480ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cat-modal-enter-from .cat-sheet { transform: translateY(48px) scale(0.96); opacity: 0; filter: blur(12px); }
.cat-modal-leave-to .cat-sheet   { transform: translateY(24px) scale(0.98); opacity: 0; filter: blur(8px); }

@media (max-width: 1100px) {
  .cat-cover { padding: 24px 20px; }
  .cat-cover__layout { grid-template-columns: 1fr; gap: 18px; align-items: start; }
  .cat-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .cat-modal { padding: 12px; }
  .cat-sheet__body { grid-template-columns: 1fr; }
  .cat-sheet__left { padding: 20px; border-right: none; border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha)); }
  .cat-sheet__img-wrap { aspect-ratio: 16 / 10; }
  .cat-sheet__ring { width: 88px; height: 88px; bottom: -16px; right: -8px; }
  .cat-sheet__ring-num .num { font-size: 22px; }
  .cat-sheet__right { padding: 20px; }
  .cat-sheet__ledger { grid-template-columns: 1fr; gap: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .cat-card { animation: none !important; transform: none !important; }
  .cat-card__img img { transition: none !important; }
  .cat-sheet__li { animation: none !important; }
}
</style>
