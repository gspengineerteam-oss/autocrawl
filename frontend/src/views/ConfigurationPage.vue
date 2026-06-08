<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api } from '@/api/client'
import type { ScopeRule, ScopeRuleKind, ScopeSuggestion } from '@/api/types'
import HudPanel from '@/components/HudPanel.vue'
import HudEmptyState from '@/components/HudEmptyState.vue'

interface TabDef {
  id: 'scope' | 'blacklist' | 'topics' | 'prompt'
  label: string
  code: string
  kinds: ScopeRuleKind[]
  description: string
}

const tabs: TabDef[] = [
  {
    id: 'scope',
    label: 'Kata Kunci Cakupan',
    code: 'CFG-01',
    kinds: ['scope_keyword_include', 'scope_keyword_exclude'],
    description:
      'Kata kunci yang dipakai LLM saat menilai vendor masuk cakupan (in-scope) atau bukan. Default kosong - tambahkan sesuai industri target.',
  },
  {
    id: 'blacklist',
    label: 'Blacklist Domain',
    code: 'CFG-02',
    kinds: ['blacklist_domain', 'whitelist_domain'],
    description:
      'Domain yang TIDAK boleh dianggap vendor (blacklist) atau yang harus tetap diloloskan walau ada di blacklist (whitelist).',
  },
  {
    id: 'topics',
    label: 'Seed Topik',
    code: 'CFG-03',
    kinds: ['seed_topic', 'anchor_expo'],
    description:
      'Topik diskoveri dan event "anchor" yang dipakai LLM untuk meng-expand query. Mempengaruhi expo apa yang masuk pipeline.',
  },
  {
    id: 'prompt',
    label: 'Prompt AI',
    code: 'CFG-04',
    kinds: [],
    description:
      'System prompt yang dipakai scope_classifier saat memutuskan vendor in-scope. Edit untuk mengubah perilaku AI secara realtime.',
  },
]

const activeTab = ref<TabDef['id']>('scope')
const currentTab = computed(() => tabs.find((t) => t.id === activeTab.value)!)

const queryClient = useQueryClient()

const scopeRulesQ = useQuery({
  queryKey: ['scopeRules'],
  queryFn: () => api.config.listScopeRules(),
  refetchInterval: 5000,
})

const allRules = computed<ScopeRule[]>(() => scopeRulesQ.data.value?.items ?? [])

function rulesForKind(kind: ScopeRuleKind): ScopeRule[] {
  return allRules.value.filter((r) => r.kind === kind)
}

const toggleMut = useMutation({
  mutationFn: (vars: { id: string; enabled: boolean }) =>
    api.config.updateScopeRule(vars.id, { enabled: vars.enabled }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scopeRules'] }),
})

const deleteMut = useMutation({
  mutationFn: (id: string) => api.config.deleteScopeRule(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scopeRules'] }),
})

const createMut = useMutation({
  mutationFn: (vars: { kind: ScopeRuleKind; value: string; notes?: string | null }) =>
    api.config.createScopeRule({ kind: vars.kind, value: vars.value, notes: vars.notes }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scopeRules'] }),
})

const newRuleValue = ref<Record<string, string>>({})
const errorMessage = ref('')

async function addRule(kind: ScopeRuleKind) {
  const value = (newRuleValue.value[kind] || '').trim()
  if (!value) return
  errorMessage.value = ''
  try {
    await createMut.mutateAsync({ kind, value })
    newRuleValue.value[kind] = ''
  } catch (e: unknown) {
    errorMessage.value = humanizeError(e)
  }
}

async function toggleRule(rule: ScopeRule) {
  errorMessage.value = ''
  try {
    await toggleMut.mutateAsync({ id: rule.id, enabled: !rule.enabled })
  } catch (e: unknown) {
    errorMessage.value = humanizeError(e)
  }
}

async function removeRule(rule: ScopeRule) {
  errorMessage.value = ''
  if (rule.source === 'yaml_default') {
    errorMessage.value =
      'Aturan YAML default tidak bisa dihapus permanen — gunakan tombol toggle untuk menonaktifkan.'
    return
  }
  try {
    await deleteMut.mutateAsync(rule.id)
  } catch (e: unknown) {
    errorMessage.value = humanizeError(e)
  }
}

function humanizeError(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const resp = (e as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (e instanceof Error) return e.message
  return String(e)
}

// ----- AI Suggest modal state -----
const suggestModalOpen = ref(false)
const suggestKind = ref<ScopeRuleKind | null>(null)
const suggestHint = ref('')
const suggestLoading = ref(false)
const suggestResults = ref<ScopeSuggestion[]>([])
const suggestSelected = ref<Set<string>>(new Set())
const suggestError = ref('')

function openSuggest(kind: ScopeRuleKind) {
  suggestKind.value = kind
  suggestHint.value = ''
  suggestResults.value = []
  suggestSelected.value = new Set()
  suggestError.value = ''
  suggestModalOpen.value = true
}

async function runSuggest() {
  if (!suggestKind.value || !suggestHint.value.trim()) return
  suggestLoading.value = true
  suggestError.value = ''
  try {
    const res = await api.config.suggestScopeRules({
      kind: suggestKind.value,
      hint: suggestHint.value.trim(),
      max_suggestions: 10,
    })
    suggestResults.value = res.suggestions
    suggestSelected.value = new Set(res.suggestions.map((s) => s.value))
  } catch (e: unknown) {
    suggestError.value = humanizeError(e)
  } finally {
    suggestLoading.value = false
  }
}

async function applySuggestions() {
  if (!suggestKind.value) return
  const kind = suggestKind.value
  const chosen = suggestResults.value.filter((s) => suggestSelected.value.has(s.value))
  if (chosen.length === 0) {
    suggestModalOpen.value = false
    return
  }
  suggestLoading.value = true
  suggestError.value = ''
  try {
    for (const s of chosen) {
      await api.config.createScopeRule({
        kind,
        value: s.value,
        source: 'ai_suggested',
        notes: s.reason || null,
      })
    }
    queryClient.invalidateQueries({ queryKey: ['scopeRules'] })
    suggestModalOpen.value = false
  } catch (e: unknown) {
    suggestError.value = humanizeError(e)
  } finally {
    suggestLoading.value = false
  }
}

function toggleSuggestion(value: string) {
  const next = new Set(suggestSelected.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  suggestSelected.value = next
}

// ----- Prompt tab -----
const promptQ = useQuery({
  queryKey: ['scopePrompt'],
  queryFn: () => api.config.getScopePrompt(),
  refetchInterval: 10000,
})

const promptDraft = ref('')
const promptDraftDirty = ref(false)
const promptStatus = ref('')

function onPromptInput(value: string) {
  promptDraft.value = value
  promptDraftDirty.value = true
  promptStatus.value = ''
}

const setPromptMut = useMutation({
  mutationFn: (content: string) => api.config.setScopePrompt(content),
  onSuccess: () => {
    promptStatus.value = 'Tersimpan. Berlaku realtime untuk klasifikasi berikutnya.'
    promptDraftDirty.value = false
    queryClient.invalidateQueries({ queryKey: ['scopePrompt'] })
  },
})

const resetPromptMut = useMutation({
  mutationFn: () => api.config.resetScopePrompt(),
  onSuccess: () => {
    promptStatus.value = 'Dikembalikan ke default sistem.'
    promptDraftDirty.value = false
    queryClient.invalidateQueries({ queryKey: ['scopePrompt'] })
  },
})

// keep draft in sync with server when not dirty
const promptServerContent = computed(() => promptQ.data.value?.content ?? '')
const promptIsCustom = computed(() => promptQ.data.value?.is_custom ?? false)

watch(
  promptServerContent,
  (next) => {
    if (!promptDraftDirty.value && next) promptDraft.value = next
  },
  { immediate: true },
)

async function savePrompt() {
  if (!promptDraft.value.trim()) {
    promptStatus.value = 'Konten tidak boleh kosong.'
    return
  }
  promptStatus.value = ''
  await setPromptMut.mutateAsync(promptDraft.value)
}

async function resetPrompt() {
  if (!confirm('Reset prompt ke default? Versi kustom akan dihapus.')) return
  await resetPromptMut.mutateAsync()
  promptDraft.value = ''
}

// ----- Helpers -----
const KIND_LABEL: Record<ScopeRuleKind, string> = {
  scope_keyword_include: 'Kata kunci IN-SCOPE',
  scope_keyword_exclude: 'Kata kunci OUT-OF-SCOPE',
  blacklist_domain: 'Domain Blacklist',
  whitelist_domain: 'Domain Whitelist',
  seed_topic: 'Seed Topik',
  anchor_expo: 'Anchor Expo',
}

const KIND_PLACEHOLDER: Record<ScopeRuleKind, string> = {
  scope_keyword_include: 'cth: ballistic, surveillance camera, ISR',
  scope_keyword_exclude: 'cth: tour package, hotel chain',
  blacklist_domain: 'cth: example.com',
  whitelist_domain: 'cth: dual-use-vendor.com',
  seed_topic: 'cth: maritime_security',
  anchor_expo: 'cth: Defense & Security Bangkok',
}

function sourceBadgeClass(src: string): string {
  if (src === 'yaml_default') return 'hud-pill border-base-300 bg-base-100 text-base-600 dark:border-base-700 dark:bg-base-800 dark:text-base-300'
  if (src === 'ai_suggested') return 'hud-pill border-accent-500/40 bg-accent-500/10 text-accent-700 dark:text-accent-300'
  return 'hud-pill border-ok-600/30 bg-ok-500/10 text-ok-700 dark:text-ok-300'
}

function sourceBadgeLabel(src: string): string {
  if (src === 'yaml_default') return 'YAML'
  if (src === 'ai_suggested') return 'AI'
  return 'USER'
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <span class="font-mono text-xs uppercase tracking-ops text-base-400 dark:text-base-500">
        OPS-08 / KONFIGURASI CAKUPAN
      </span>
      <span class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
        Perubahan berlaku REALTIME (versioning via Redis, polling 1 detik)
      </span>
    </div>

    <!-- Tabs -->
    <nav class="flex border-b border-base-200 dark:border-base-700">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="[
          'relative flex items-center gap-2 border-b-2 px-3 py-2 font-mono text-2xs font-medium uppercase tracking-ops transition-colors',
          activeTab === tab.id
            ? 'border-accent-500 text-accent-700 dark:text-accent-300'
            : 'border-transparent text-base-500 hover:text-base-800 dark:text-base-400 dark:hover:text-base-100',
        ]"
        @click="activeTab = tab.id"
      >
        <span class="text-base-400 dark:text-base-600">{{ tab.code }}</span>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <p class="font-mono text-xs leading-relaxed text-base-600 dark:text-base-400">
      {{ currentTab.description }}
    </p>

    <div
      v-if="errorMessage"
      class="rounded-md border border-crit-500/40 bg-crit-500/10 px-3 py-2 font-mono text-xs text-crit-700 dark:text-crit-300"
    >
      {{ errorMessage }}
    </div>

    <!-- Rule tabs -->
    <template v-if="activeTab !== 'prompt'">
      <HudPanel
        v-for="kind in currentTab.kinds"
        :key="kind"
        :title="KIND_LABEL[kind]"
        :code="kind.toUpperCase()"
      >
        <template #actions>
          <button
            class="hud-btn-ghost"
            type="button"
            @click="openSuggest(kind)"
          >
            <FaIcon :icon="['fas', 'wand-magic-sparkles']" class="text-2xs" />
            Saran AI
          </button>
        </template>

        <div class="flex flex-col gap-2.5">
          <div class="flex gap-2">
            <input
              v-model="newRuleValue[kind]"
              :placeholder="KIND_PLACEHOLDER[kind]"
              class="hud-input flex-1"
              @keydown.enter="addRule(kind)"
            />
            <button class="hud-btn-primary" type="button" @click="addRule(kind)">
              <FaIcon :icon="['fas', 'plus']" class="text-2xs" />
              Tambah
            </button>
          </div>

          <div v-if="rulesForKind(kind).length === 0" class="py-4">
            <HudEmptyState title="Belum ada aturan untuk kategori ini." />
          </div>

          <table v-else class="hud-table">
            <thead>
              <tr>
                <th class="text-left">Nilai</th>
                <th class="text-left" style="width: 90px">Sumber</th>
                <th class="text-left" style="width: 100px">Status</th>
                <th class="text-left">Catatan</th>
                <th class="text-right" style="width: 110px">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rulesForKind(kind)"
                :key="row.id"
                :class="[!row.enabled ? 'opacity-50' : '']"
              >
                <td class="px-3 py-1.5 font-mono text-xs">{{ row.value }}</td>
                <td class="px-3 py-1.5">
                  <span :class="sourceBadgeClass(row.source)">
                    {{ sourceBadgeLabel(row.source) }}
                  </span>
                </td>
                <td class="px-3 py-1.5">
                  <button
                    class="hud-btn-ghost gap-1 text-2xs"
                    type="button"
                    @click="toggleRule(row)"
                  >
                    <FaIcon
                      :icon="['fas', row.enabled ? 'toggle-on' : 'toggle-off']"
                      :class="row.enabled ? 'text-ok-500' : 'text-base-400'"
                    />
                    {{ row.enabled ? 'Aktif' : 'Off' }}
                  </button>
                </td>
                <td class="px-3 py-1.5 font-mono text-2xs text-base-500 dark:text-base-400">
                  {{ row.notes || '—' }}
                </td>
                <td class="px-3 py-1.5 text-right">
                  <button
                    v-if="row.source !== 'yaml_default'"
                    class="hud-btn-ghost gap-1 text-2xs text-crit-600 hover:text-crit-700 dark:text-crit-400"
                    type="button"
                    :disabled="deleteMut.isPending.value"
                    @click="removeRule(row)"
                  >
                    <FaIcon :icon="['fas', 'trash']" class="text-2xs" />
                    Hapus
                  </button>
                  <span
                    v-else
                    class="font-mono text-2xs text-base-400 dark:text-base-600"
                    title="Aturan YAML default hanya bisa di-toggle, tidak bisa dihapus"
                  >
                    Toggle-only
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </HudPanel>
    </template>

    <!-- Prompt tab -->
    <template v-else>
      <HudPanel title="System Prompt — Scope Classifier" code="CFG-04">
        <template #actions>
          <span
            v-if="promptIsCustom"
            class="hud-pill border-accent-500/40 bg-accent-500/10 text-accent-700 dark:text-accent-300"
          >
            CUSTOM
          </span>
          <span
            v-else
            class="hud-pill border-base-300 bg-base-100 text-base-600 dark:border-base-700 dark:bg-base-800 dark:text-base-300"
          >
            DEFAULT
          </span>
        </template>

        <div class="flex flex-col gap-3">
          <p class="font-mono text-xs leading-relaxed text-base-600 dark:text-base-400">
            Prompt ini dipakai oleh AI saat menilai apakah vendor masuk cakupan setelah enrichment selesai.
            Edit lalu Simpan — perubahan langsung berlaku untuk klasifikasi berikutnya tanpa restart.
          </p>

          <textarea
            class="hud-input min-h-[320px] font-mono text-xs leading-relaxed"
            :value="promptDraft || promptServerContent"
            @input="onPromptInput(($event.target as HTMLTextAreaElement).value)"
            spellcheck="false"
          />

          <div v-if="promptStatus" class="font-mono text-2xs uppercase tracking-ops text-ok-600 dark:text-ok-400">
            {{ promptStatus }}
          </div>

          <div class="flex items-center gap-2">
            <button
              class="hud-btn-primary"
              type="button"
              :disabled="setPromptMut.isPending.value || !promptDraftDirty"
              @click="savePrompt"
            >
              <FaIcon :icon="['fas', 'check']" class="text-2xs" />
              Simpan Prompt
            </button>
            <button
              class="hud-btn-ghost"
              type="button"
              :disabled="!promptIsCustom || resetPromptMut.isPending.value"
              @click="resetPrompt"
            >
              <FaIcon :icon="['fas', 'rotate']" class="text-2xs" />
              Reset ke Default
            </button>
          </div>
        </div>
      </HudPanel>
    </template>

    <!-- AI Suggest modal -->
    <div
      v-if="suggestModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="suggestModalOpen = false"
    >
      <div class="hud-panel w-full max-w-2xl">
        <div class="hud-panel-head">
          <div class="flex items-center gap-2">
            <FaIcon :icon="['fas', 'robot']" class="text-2xs text-accent-500" />
            <h2 class="hud-panel-title">
              Saran AI — {{ suggestKind ? KIND_LABEL[suggestKind] : '' }}
            </h2>
          </div>
          <button class="hud-btn-ghost" type="button" @click="suggestModalOpen = false">
            <FaIcon :icon="['fas', 'xmark']" class="text-2xs" />
          </button>
        </div>
        <div class="hud-panel-body flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
              Petunjuk untuk AI
            </label>
            <textarea
              v-model="suggestHint"
              class="hud-input min-h-[80px]"
              placeholder="cth: hotel chain Asia yang sering nyangkut, atau platform event ticketing"
              spellcheck="false"
            />
          </div>

          <button
            class="hud-btn-primary self-start"
            type="button"
            :disabled="!suggestHint.trim() || suggestLoading"
            @click="runSuggest"
          >
            <FaIcon :icon="['fas', 'wand-magic-sparkles']" class="text-2xs" />
            {{ suggestLoading ? 'Memproses…' : 'Minta Saran' }}
          </button>

          <div
            v-if="suggestError"
            class="rounded-md border border-crit-500/40 bg-crit-500/10 px-3 py-2 font-mono text-xs text-crit-700 dark:text-crit-300"
          >
            {{ suggestError }}
          </div>

          <div v-if="suggestResults.length > 0" class="flex flex-col gap-2">
            <div class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
              Pilih yang mau disimpan ({{ suggestSelected.size }} / {{ suggestResults.length }})
            </div>
            <div class="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              <label
                v-for="s in suggestResults"
                :key="s.value"
                class="flex cursor-pointer items-start gap-2 border border-base-200 bg-base-50/50 px-3 py-2 hover:bg-base-100 dark:border-base-700 dark:bg-base-800/50 dark:hover:bg-base-800"
              >
                <input
                  type="checkbox"
                  :checked="suggestSelected.has(s.value)"
                  class="mt-0.5"
                  @change="toggleSuggestion(s.value)"
                />
                <div class="flex-1">
                  <div class="font-mono text-xs font-medium text-base-800 dark:text-base-100">
                    {{ s.value }}
                  </div>
                  <div
                    v-if="s.reason"
                    class="font-mono text-2xs text-base-500 dark:text-base-400"
                  >
                    {{ s.reason }}
                  </div>
                </div>
                <span class="hud-chip self-start">
                  {{ Math.round(s.confidence * 100) }}%
                </span>
              </label>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button
                class="hud-btn-ghost"
                type="button"
                @click="suggestModalOpen = false"
              >
                Batal
              </button>
              <button
                class="hud-btn-primary"
                type="button"
                :disabled="suggestSelected.size === 0 || suggestLoading"
                @click="applySuggestions"
              >
                <FaIcon :icon="['fas', 'plus']" class="text-2xs" />
                Tambahkan {{ suggestSelected.size }} aturan
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
