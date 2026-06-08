<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import { api } from '@/api/client'
import type { DraftLanguage, Vendor } from '@/api/types'

/**
 * Vendor Email Composer — theatrical full-overlay.
 *
 * Two-column composition:
 *   LEFT rail: vendor identity capsule + draft meta + AI context override
 *              + primary Generate CTA. Sticky, ink-themed background.
 *   RIGHT canvas: editorial "envelope" with subject as display-scale
 *                 input and body as a long writing field. Looks and
 *                 feels like composing a dispatch, not filling a form.
 *
 * Cinematic enter (scrim fade + sheet slide-up-blur), keyboard shortcuts
 * (Esc closes, ⌘/Ctrl+Enter saves, ⌘/Ctrl+G generates). Real data only
 * via /vendors/{id}/email-draft endpoints.
 */

const props = defineProps<{ vendor: Vendor; open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const queryClient = useQueryClient()
const language = ref<DraftLanguage>('en')
const subject = ref('')
const body = ref('')
const generating = ref(false)
const saving = ref(false)
const dirty = ref(false)
const ourContextOverride = ref<string>('')
const showContextField = ref(false)

const vendorId = computed(() => props.vendor.vendor_id || props.vendor.domain || '')
const vendorName = computed(() => props.vendor.company_name || props.vendor.domain || 'Vendor')
const vendorDomain = computed(() => props.vendor.domain || 'tanpa-domain')
const initials = computed(() => {
  return vendorName.value
    .split(/[\s\-_·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'
})

const draftQ = useQuery({
  queryKey: computed(() => ['vendor', 'email-draft', vendorId.value, language.value]),
  queryFn: () => api.vendorEmailDraft.get(vendorId.value, language.value),
  enabled: computed(() => props.open && !!vendorId.value),
})

watch(
  () => draftQ.data.value,
  (d) => {
    if (!d) return
    if (d.exists) {
      subject.value = d.subject || ''
      body.value = d.body || ''
    } else {
      subject.value = ''
      body.value = ''
    }
    dirty.value = false
  },
)

watch(
  () => props.open,
  (v) => {
    if (v) {
      if (typeof document !== 'undefined') document.body.style.overflow = 'hidden'
      language.value = 'en'
    } else {
      if (typeof document !== 'undefined') document.body.style.overflow = ''
    }
  },
)

useEventListener('keydown', (e: KeyboardEvent) => {
  if (!props.open) return
  if (e.key === 'Escape') { emit('close'); return }
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  if (e.key === 'Enter') { e.preventDefault(); void save() }
  if (e.key.toLowerCase() === 'g') { e.preventDefault(); void generate() }
})

const existingMeta = computed(() => {
  const d = draftQ.data.value
  if (!d || !d.exists) return null
  return {
    updated_at: d.updated_at || null,
    edited_manually: d.edited_manually,
    model_used: d.model_used || null,
  }
})

const wordCount = computed(() => {
  if (!body.value) return 0
  return body.value.split(/\s+/).filter(Boolean).length
})
const charCount = computed(() => body.value.length)

async function generate() {
  if (!vendorId.value || generating.value) return
  generating.value = true
  try {
    const result = await api.vendorEmailDraft.generate(vendorId.value, {
      language: language.value,
      our_context: ourContextOverride.value.trim() || null,
    })
    subject.value = result.subject
    body.value = result.body
    dirty.value = false
    queryClient.invalidateQueries({ queryKey: ['vendor', 'email-draft', vendorId.value, language.value] })
    toast.success('Draft email tergenerate', {
      description: `Bahasa ${language.value === 'en' ? 'Inggris' : 'Indonesia'}, tersimpan ke DB`,
    })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    toast.error('Gagal generate draft', {
      description: err.response?.data?.detail ?? 'Periksa Ollama atau log API.',
    })
  } finally {
    generating.value = false
  }
}

async function save() {
  if (!vendorId.value || saving.value) return
  if (!subject.value.trim() || !body.value.trim()) {
    toast.warning('Subject dan body tidak boleh kosong')
    return
  }
  saving.value = true
  try {
    await api.vendorEmailDraft.save(
      vendorId.value,
      { subject: subject.value, body: body.value },
      language.value,
    )
    dirty.value = false
    queryClient.invalidateQueries({ queryKey: ['vendor', 'email-draft', vendorId.value, language.value] })
    toast.success('Edit tersimpan', { description: 'Ditandai sebagai manual edit.' })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    toast.error('Gagal simpan draft', {
      description: err.response?.data?.detail ?? 'Cek koneksi backend.',
    })
  } finally {
    saving.value = false
  }
}

async function copyAll() {
  if (!subject.value && !body.value) return
  const text = `Subject: ${subject.value}\n\n${body.value}`
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Tersalin ke clipboard')
  } catch {
    toast.error('Gagal menyalin')
  }
}

function onEdit() { dirty.value = true }

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return iso }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ed-modal">
      <div
        v-if="open"
        class="ed-modal"
        @click.self="emit('close')"
      >
        <div class="ed-modal__scrim" aria-hidden="true" />
        <article class="ed-sheet" @click.stop>
          <!-- ====================================================== -->
          <!-- TOP TICKER STRIP                                          -->
          <!-- ====================================================== -->
          <header class="ed-ticker">
            <div class="ed-ticker__left">
              <span class="dot" :class="generating ? 'dot-amber dot-glow' : (dirty ? 'dot-amber' : 'dot-mute')" />
              <span class="ed-ticker__tag num">DISPATCH</span>
              <span class="ed-ticker__msg">
                {{ vendorName.toUpperCase() }} &middot;
                {{ generating ? 'AI MENULIS' : (dirty ? 'BELUM TERSIMPAN' : (existingMeta ? 'TERSIMPAN' : 'BARU')) }} &middot;
                {{ language === 'en' ? 'BAHASA INGGRIS' : 'BAHASA INDONESIA' }}
              </span>
              <span v-if="existingMeta?.model_used" class="ed-ticker__stamp">{{ existingMeta.model_used }}</span>
            </div>

            <!-- Language switch as segmented pill -->
            <div class="ed-lang">
              <button
                type="button"
                class="ed-lang__btn"
                :class="{ 'is-active': language === 'en' }"
                @click="language = 'en'"
              >EN</button>
              <button
                type="button"
                class="ed-lang__btn"
                :class="{ 'is-active': language === 'id' }"
                @click="language = 'id'"
              >ID</button>
            </div>

            <!-- Close -->
            <button class="ed-close" @click="emit('close')" aria-label="Tutup">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 3 8 8M11 3l-8 8" />
              </svg>
            </button>
          </header>

          <!-- ====================================================== -->
          <!-- TWO-COLUMN COMPOSITION                                    -->
          <!-- ====================================================== -->
          <div class="ed-body">
            <!-- LEFT rail: vendor capsule + meta + context + Generate -->
            <aside class="ed-rail">
              <div class="ed-capsule">
                <div class="ed-capsule__logo">
                  <img
                    v-if="vendor.logo_url"
                    :src="vendor.logo_url"
                    :alt="`Logo ${vendorName}`"
                    referrerpolicy="no-referrer"
                  />
                  <span v-else class="ed-capsule__initials">{{ initials }}</span>
                </div>
                <div class="ed-capsule__body">
                  <span class="eyebrow eyebrow-accent">// PENERIMA</span>
                  <h3 class="ed-capsule__name">{{ vendorName }}</h3>
                  <a
                    v-if="vendor.canonical_url"
                    :href="vendor.canonical_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ed-capsule__domain"
                  >
                    {{ vendorDomain }}
                  </a>
                  <span v-else class="ed-capsule__domain ed-capsule__domain--mute">
                    {{ vendorDomain }}
                  </span>

                  <div v-if="vendor.domain_of_interest?.length" class="ed-capsule__chips">
                    <span v-for="t in vendor.domain_of_interest.slice(0, 4)" :key="t" class="ed-chip">{{ t }}</span>
                  </div>
                </div>
              </div>

              <!-- Draft meta strip -->
              <div class="ed-meta">
                <div v-if="draftQ.isPending.value" class="ed-meta__row">
                  <span class="ed-meta__icon">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6">
                      <circle cx="7" cy="7" r="5" stroke-dasharray="4 4">
                        <animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="1s" repeatCount="indefinite" />
                      </circle>
                    </svg>
                  </span>
                  <div>
                    <span class="ed-meta__label">Memuat&hellip;</span>
                    <span class="ed-meta__sub">Mencari draft tersimpan</span>
                  </div>
                </div>
                <template v-else-if="existingMeta">
                  <div class="ed-meta__row">
                    <span class="ed-meta__icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                        <ellipse cx="7" cy="3.5" rx="5" ry="2" />
                        <path d="M2 3.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M2 7c0 1.1 2.2 2 5 2s5-.9 5-2" />
                      </svg>
                    </span>
                    <div>
                      <span class="ed-meta__label">Tersimpan di DB</span>
                      <span class="ed-meta__sub">{{ fmtTs(existingMeta.updated_at) }}</span>
                    </div>
                  </div>
                  <div v-if="existingMeta.edited_manually" class="ed-meta__row ed-meta__row--amber">
                    <span class="ed-meta__icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m9 2 3 3-7 7-3 .5L2.5 9z" />
                      </svg>
                    </span>
                    <div>
                      <span class="ed-meta__label">Manual edit</span>
                      <span class="ed-meta__sub">Operator pernah revisi</span>
                    </div>
                  </div>
                </template>
                <div v-else class="ed-meta__row">
                  <span class="ed-meta__icon">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="7" cy="7" r="5.5" />
                      <path d="M7 4.5v3M7 9.5v.01" />
                    </svg>
                  </span>
                  <div>
                    <span class="ed-meta__label">Draft Baru</span>
                    <span class="ed-meta__sub">Tekan Generate untuk mulai</span>
                  </div>
                </div>
              </div>

              <!-- AI context override -->
              <div class="ed-ctx">
                <button
                  type="button"
                  class="ed-ctx__toggle"
                  @click="showContextField = !showContextField"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round"
                    :style="{ transform: showContextField ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 240ms cubic-bezier(0.32,0.72,0,1)' }"
                  >
                    <path d="m5 3 4 4-4 4" />
                  </svg>
                  <span class="eyebrow" style="text-transform: uppercase">// KONTEKS "KITA" (OPSIONAL)</span>
                </button>
                <Transition name="ed-ctx-expand">
                  <textarea
                    v-if="showContextField"
                    v-model="ourContextOverride"
                    rows="4"
                    class="ed-ctx__textarea"
                    placeholder="Default: 'We're a technology consortium mapping the industrial ecosystem'. Tulis di sini untuk override apa yang AI gunakan sebagai 'kita'."
                  />
                </Transition>
              </div>

              <!-- Primary CTA -->
              <button
                type="button"
                class="ed-generate"
                :disabled="generating"
                @click="generate"
              >
                <span class="ed-generate__icon">
                  <svg v-if="!generating" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 2v3M8 11v3M2 8h3M11 8h3M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2" />
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="8" cy="8" r="6" stroke-dasharray="9 12">
                      <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                </span>
                <div class="ed-generate__copy">
                  <span class="ed-generate__title">
                    {{ generating ? 'Sedang Generate…' : (existingMeta ? 'Regenerate' : 'Generate Draft') }}
                  </span>
                  <span class="ed-generate__sub">
                    {{ generating ? 'Ollama bekerja, tunggu sebentar' : 'AI tulis subject + body baru' }}
                  </span>
                </div>
                <span class="btn-icon-nest">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 7h8M7 3l4 4-4 4" />
                  </svg>
                </span>
              </button>

              <!-- Keyboard hints -->
              <div class="ed-kbd">
                <div class="ed-kbd__row">
                  <kbd class="ed-kbd__key">⌘</kbd><kbd class="ed-kbd__key">G</kbd>
                  <span>Generate</span>
                </div>
                <div class="ed-kbd__row">
                  <kbd class="ed-kbd__key">⌘</kbd><kbd class="ed-kbd__key">↵</kbd>
                  <span>Simpan</span>
                </div>
                <div class="ed-kbd__row">
                  <kbd class="ed-kbd__key">Esc</kbd>
                  <span>Tutup</span>
                </div>
              </div>
            </aside>

            <!-- RIGHT canvas: envelope composition -->
            <section class="ed-canvas">
              <div class="ed-canvas__paper">
                <!-- Envelope header — From / To strip -->
                <div class="ed-envelope">
                  <div class="ed-envelope__row">
                    <span class="ed-envelope__label">DARI</span>
                    <span class="ed-envelope__val">Operator Autocrawl</span>
                  </div>
                  <div class="ed-envelope__row">
                    <span class="ed-envelope__label">UNTUK</span>
                    <span class="ed-envelope__val">{{ vendorName }} &middot; {{ vendorDomain }}</span>
                  </div>
                </div>

                <!-- Subject — display-scale input -->
                <div class="ed-subject">
                  <label class="ed-subject__label">
                    <span class="eyebrow">// SUBJECT</span>
                  </label>
                  <input
                    v-model="subject"
                    type="text"
                    class="ed-subject__input"
                    :disabled="generating"
                    placeholder="Subject email akan muncul di sini…"
                    @input="onEdit"
                  />
                </div>

                <!-- Body — long writing canvas -->
                <div class="ed-body-field">
                  <textarea
                    v-model="body"
                    class="ed-body-field__textarea"
                    :disabled="generating"
                    placeholder="Tekan Generate untuk membuat email outreach. AI akan menyusun pengantar industrial yang memperkenalkan inisiatif kita dan mengajak vendor berkolaborasi."
                    @input="onEdit"
                  />
                  <!-- Skeleton lines visible during generation -->
                  <div v-if="generating && !body" class="ed-body-field__skel" aria-hidden="true">
                    <span class="ed-body-field__skel-line" style="width: 92%"></span>
                    <span class="ed-body-field__skel-line" style="width: 78%"></span>
                    <span class="ed-body-field__skel-line" style="width: 86%"></span>
                    <span class="ed-body-field__skel-line" style="width: 64%"></span>
                  </div>
                </div>

                <!-- Word / char counter strip -->
                <div class="ed-counter">
                  <span class="num">{{ wordCount }} kata</span>
                  <span class="ed-counter__sep">&middot;</span>
                  <span class="num">{{ charCount }} karakter</span>
                  <span v-if="dirty" class="ed-counter__dirty">
                    <span class="live-dot" />
                    Perubahan belum tersimpan
                  </span>
                </div>
              </div>
            </section>
          </div>

          <!-- ====================================================== -->
          <!-- FOOTER ACTIONS                                            -->
          <!-- ====================================================== -->
          <footer class="ed-foot">
            <span class="ed-foot__meta">
              <span class="num">{{ existingMeta ? `Last save · ${fmtTs(existingMeta.updated_at)}` : 'Belum pernah disimpan' }}</span>
            </span>
            <div class="ed-foot__btns">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="!subject && !body"
                @click="copyAll"
              >
                <span>Salin</span>
                <span class="btn-icon-nest">
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="8" height="8" rx="1.5" />
                    <path d="M5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v6" />
                  </svg>
                </span>
              </button>
              <button
                type="button"
                class="btn btn-amber"
                :disabled="saving || !dirty"
                @click="save"
              >
                <span>{{ saving ? 'Menyimpan…' : 'Simpan' }}</span>
                <span class="btn-icon-nest">
                  <svg v-if="!saving" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12h8M7 2v8m0 0-3-3m3 3 3-3" />
                  </svg>
                  <svg v-else width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="7" cy="7" r="5" stroke-dasharray="8 12">
                      <animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="1s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                </span>
              </button>
            </div>
          </footer>
        </article>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ed-modal {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.ed-modal__scrim {
  position: absolute;
  inset: 0;
  background: rgb(var(--bg) / 0.55);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
}

.ed-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
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

/* TICKER */
.ed-ticker {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha));
  flex-shrink: 0;
}
.ed-ticker__left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'Geist Variable', 'Geist', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--ink-2));
  min-width: 0;
}
.ed-ticker__tag { color: rgb(var(--accent)); font-weight: 600; }
.ed-ticker__msg {
  flex: 1;
  color: rgb(var(--ink));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ed-ticker__stamp { color: rgb(var(--ink-mute)); }

.ed-lang {
  display: inline-flex;
  padding: 3px;
  background: rgb(var(--surface-2));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 9999px;
}
.ed-lang__btn {
  font-family: 'Geist Variable', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  padding: 6px 14px;
  color: rgb(var(--ink-mute));
  background: transparent;
  border: 0;
  border-radius: 9999px;
  cursor: pointer;
  transition: all var(--dur-160) var(--ease-out);
}
.ed-lang__btn:hover { color: rgb(var(--ink)); }
.ed-lang__btn.is-active {
  background: rgb(var(--ink));
  color: rgb(var(--surface));
}

.ed-close {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  background: rgb(var(--ink));
  color: rgb(var(--surface));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform var(--dur-160) var(--ease-out);
}
.ed-close:hover { transform: translateY(-1px) rotate(90deg); }

/* TWO-COL BODY */
.ed-body {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* LEFT RAIL */
.ed-rail {
  padding: 22px 22px 24px;
  background: linear-gradient(180deg, rgb(var(--surface-2)) 0%, rgb(var(--surface)) 100%);
  border-right: 1px solid rgb(var(--rule) / var(--rule-alpha));
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
}

.ed-capsule {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 14px;
  padding: 16px;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 20px;
  box-shadow: var(--shadow-card);
}
.ed-capsule__logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgb(var(--surface-2));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ed-capsule__logo img { max-width: 80%; max-height: 80%; object-fit: contain; }
.ed-capsule__initials {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.04em;
  background: linear-gradient(180deg, rgb(var(--accent-hot)) 0%, rgb(var(--accent)) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.ed-capsule__body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ed-capsule__name {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 17px;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: rgb(var(--ink));
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ed-capsule__domain {
  font-family: 'Geist Variable', monospace;
  font-size: 11.5px;
  color: rgb(var(--accent));
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-capsule__domain:hover { color: rgb(var(--accent-hot)); }
.ed-capsule__domain--mute { color: rgb(var(--ink-mute)); }
.ed-capsule__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.ed-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 9999px;
  font-size: 10.5px;
  color: rgb(var(--ink-2));
  background: rgb(var(--surface));
}

/* META */
.ed-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 16px;
}
.ed-meta__row {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
}
.ed-meta__row + .ed-meta__row { border-top: 1px solid rgb(var(--rule) / var(--rule-alpha)); }
.ed-meta__icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--accent) / 0.10);
  border: 1px solid rgb(var(--accent) / 0.25);
  color: rgb(var(--accent));
}
.ed-meta__row--amber .ed-meta__icon { background: rgb(var(--warn) / 0.10); border-color: rgb(var(--warn) / 0.30); color: rgb(var(--warn)); }
.ed-meta__label {
  display: block;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 12.5px;
  color: rgb(var(--ink));
}
.ed-meta__sub {
  display: block;
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: rgb(var(--ink-mute));
  margin-top: 1px;
}

/* CONTEXT */
.ed-ctx { display: flex; flex-direction: column; gap: 8px; }
.ed-ctx__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 4px 0;
  align-self: flex-start;
  color: rgb(var(--ink-mute));
}
.ed-ctx__toggle:hover { color: rgb(var(--accent)); }
.ed-ctx__textarea {
  width: 100%;
  resize: vertical;
  font-family: 'Geist Variable', sans-serif;
  font-size: 12.5px;
  line-height: 1.5;
  color: rgb(var(--ink));
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  border-radius: 12px;
  padding: 10px 12px;
  transition: border-color var(--dur-160) var(--ease-out), box-shadow var(--dur-160) var(--ease-out);
}
.ed-ctx__textarea:focus {
  outline: none;
  border-color: rgb(var(--accent));
  box-shadow: 0 0 0 3px rgb(var(--accent) / 0.20);
}
.ed-ctx-expand-enter-active,
.ed-ctx-expand-leave-active {
  transition:
    max-height 320ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 240ms cubic-bezier(0.32, 0.72, 0, 1);
  overflow: hidden;
  max-height: 220px;
}
.ed-ctx-expand-enter-from,
.ed-ctx-expand-leave-to { max-height: 0; opacity: 0; }

/* GENERATE CTA */
.ed-generate {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: rgb(var(--ink));
  color: rgb(var(--surface));
  border: 1px solid rgb(var(--ink));
  border-radius: 20px;
  cursor: pointer;
  box-shadow: var(--shadow-card-hover);
  transition: transform var(--dur-160) var(--ease-out), box-shadow var(--dur-160) var(--ease-out);
}
.ed-generate:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    var(--shadow-card-hover),
    0 12px 32px -8px rgb(var(--accent) / 0.45);
}
.ed-generate:disabled { opacity: 0.7; cursor: progress; }
.ed-generate__icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgb(var(--accent));
  color: rgb(var(--ink));
  box-shadow: 0 0 16px rgb(var(--accent) / 0.45);
}
.ed-generate__copy { text-align: left; min-width: 0; }
.ed-generate__title {
  display: block;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.ed-generate__sub {
  display: block;
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: rgb(var(--surface) / 0.6);
  margin-top: 4px;
}
.ed-generate .btn-icon-nest {
  background: rgb(var(--surface) / 0.18);
  color: rgb(var(--surface));
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ed-generate:hover .btn-icon-nest { transform: translate(2px, -1px) scale(1.06); background: rgb(var(--surface) / 0.28); }

/* KEYBOARD HINTS */
.ed-kbd {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 14px;
  background: rgb(var(--surface) / 0.6);
}
.ed-kbd__row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: rgb(var(--ink-mute));
}
.ed-kbd__row span { margin-left: 6px; color: rgb(var(--ink-2)); }
.ed-kbd__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0;
  color: rgb(var(--ink));
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  border-radius: 6px;
  box-shadow: 0 1px 0 rgb(var(--rule) / 0.20);
}

/* CANVAS */
.ed-canvas {
  padding: 24px;
  overflow-y: auto;
  background: rgb(var(--surface));
}
.ed-canvas__paper {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  min-height: 0;
}

.ed-envelope {
  padding: 14px 18px;
  background: rgb(var(--surface-2));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 16px;
}
.ed-envelope__row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 14px;
  align-items: baseline;
  padding: 4px 0;
}
.ed-envelope__row + .ed-envelope__row { border-top: 1px dashed rgb(var(--rule) / var(--rule-alpha)); margin-top: 6px; padding-top: 10px; }
.ed-envelope__label {
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--accent));
  font-weight: 600;
}
.ed-envelope__val {
  font-family: 'Geist Variable', sans-serif;
  font-size: 13px;
  color: rgb(var(--ink));
}

/* SUBJECT */
.ed-subject { display: flex; flex-direction: column; gap: 8px; }
.ed-subject__label { display: flex; align-items: center; gap: 6px; }
.ed-subject__input {
  font-family: 'Geist Variable', sans-serif;
  font-weight: 600;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: rgb(var(--ink));
  background: transparent;
  border: 0;
  border-bottom: 2px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 0;
  padding: 6px 0 12px;
  width: 100%;
  transition: border-color var(--dur-240) var(--ease-out);
}
.ed-subject__input::placeholder { color: rgb(var(--ink-mute)); font-weight: 400; }
.ed-subject__input:focus {
  outline: none;
  border-bottom-color: rgb(var(--accent));
}
.ed-subject__input:disabled { opacity: 0.6; }

/* BODY FIELD */
.ed-body-field {
  position: relative;
  flex: 1;
  min-height: 280px;
}
.ed-body-field__textarea {
  width: 100%;
  height: 100%;
  min-height: 280px;
  resize: vertical;
  font-family: 'Geist Variable', sans-serif;
  font-size: 14.5px;
  line-height: 1.65;
  color: rgb(var(--ink));
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 18px;
  padding: 20px 22px;
  transition:
    border-color var(--dur-240) var(--ease-out),
    box-shadow var(--dur-240) var(--ease-out);
  position: relative;
  z-index: 1;
}
.ed-body-field__textarea::placeholder {
  color: rgb(var(--ink-mute));
  font-style: italic;
}
.ed-body-field__textarea:focus {
  outline: none;
  border-color: rgb(var(--accent) / 0.55);
  box-shadow: 0 0 0 4px rgb(var(--accent) / 0.10);
}
.ed-body-field__textarea:disabled {
  opacity: 0.5;
  cursor: progress;
}

.ed-body-field__skel {
  position: absolute;
  inset: 0;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
  z-index: 2;
}
.ed-body-field__skel-line {
  height: 12px;
  border-radius: 9999px;
  background: linear-gradient(
    90deg,
    rgb(var(--accent) / 0.08) 0%,
    rgb(var(--accent) / 0.18) 50%,
    rgb(var(--accent) / 0.08) 100%
  );
  background-size: 200% 100%;
  animation: ed-skel-shimmer 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
@keyframes ed-skel-shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* COUNTER */
.ed-counter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.ed-counter__sep { color: rgb(var(--ink-mute) / 0.6); }
.ed-counter__dirty {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 9999px;
  background: rgb(var(--accent) / 0.10);
  border: 1px solid rgb(var(--accent) / 0.30);
  color: rgb(var(--accent));
  font-weight: 600;
}

/* FOOTER */
.ed-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 22px;
  border-top: 1px solid rgb(var(--rule) / var(--rule-alpha));
  background: rgb(var(--surface));
  flex-shrink: 0;
}
.ed-foot__meta {
  font-family: 'Geist Variable', monospace;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(var(--ink-mute));
}
.ed-foot__btns { display: flex; gap: 10px; }

/* MODAL ENTER/LEAVE */
.ed-modal-enter-active { transition: opacity 280ms cubic-bezier(0.32, 0.72, 0, 1); }
.ed-modal-leave-active { transition: opacity 240ms cubic-bezier(0.32, 0.72, 0, 1); }
.ed-modal-enter-from,
.ed-modal-leave-to { opacity: 0; }
.ed-modal-enter-active .ed-sheet,
.ed-modal-leave-active .ed-sheet {
  transition:
    transform 520ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity   520ms cubic-bezier(0.32, 0.72, 0, 1),
    filter    520ms cubic-bezier(0.32, 0.72, 0, 1);
}
.ed-modal-enter-from .ed-sheet { transform: translateY(48px) scale(0.96); opacity: 0; filter: blur(12px); }
.ed-modal-leave-to .ed-sheet   { transform: translateY(24px) scale(0.98); opacity: 0; filter: blur(8px); }

@media (max-width: 1100px) {
  .ed-modal { padding: 12px; }
  .ed-ticker { padding: 12px 14px; gap: 8px; flex-wrap: wrap; }
  .ed-ticker__left { width: 100%; order: 1; }
  .ed-ticker__msg { font-size: 10px; }
  .ed-lang { order: 2; }
  .ed-close { order: 3; }
  .ed-body { grid-template-columns: 1fr; }
  .ed-rail { border-right: none; border-bottom: 1px solid rgb(var(--rule) / var(--rule-alpha)); padding: 16px; }
  .ed-canvas { padding: 16px; }
  .ed-subject__input { font-size: 18px; }
  .ed-foot { padding: 12px 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .ed-body-field__skel-line { animation: none; }
}
</style>
