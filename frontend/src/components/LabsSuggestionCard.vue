<script setup lang="ts">
import { computed } from 'vue'
import type { FusionSuggestion, VendorCandidate } from '@/api/types'

const props = defineProps<{
  suggestion: FusionSuggestion
  vendorMap: Map<string, VendorCandidate>
}>()

const emit = defineEmits<{
  (e: 'use-suggestion', vendorIds: string[]): void
}>()

const sourceVendors = computed(() =>
  props.suggestion.source_vendor_ids
    .map((id) => props.vendorMap.get(id))
    .filter((v): v is VendorCandidate => Boolean(v)),
)

const confidencePct = computed(() => Math.round(props.suggestion.confidence * 100))

const confidenceTone = computed(() => {
  if (confidencePct.value >= 75) return 'ok'
  if (confidencePct.value >= 50) return 'amber'
  return 'warn'
})
</script>

<template>
  <article class="card overflow-hidden flex flex-col">
    <header class="card-head">
      <div class="flex items-center gap-2 min-w-0">
        <span class="num-display text-[10px] tracking-[0.18em] text-ink-mute font-bold">IDE</span>
        <h3 class="text-[14px] font-semibold text-ink truncate">{{ suggestion.product_name }}</h3>
      </div>
      <span class="pill" :class="`pill-${confidenceTone}`">
        {{ confidencePct }}%
      </span>
    </header>

    <div class="card-body flex-1 space-y-3">
      <p v-if="suggestion.tagline" class="text-[13px] text-ink leading-snug italic">
        "{{ suggestion.tagline }}"
      </p>

      <div class="flex flex-wrap items-center gap-1.5">
        <span
          v-for="v in sourceVendors"
          :key="v.vendor_id"
          class="flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] bg-surface-2 border border-rule text-[11px] text-ink-2"
        >
          <span v-if="v.logo_url" class="h-3 w-3 overflow-hidden rounded-[1px] shrink-0">
            <img :src="v.logo_url" :alt="v.company_name" class="h-full w-full object-contain" referrerpolicy="no-referrer">
          </span>
          <span class="truncate max-w-[120px]">{{ v.company_name }}</span>
        </span>
        <span
          v-for="missingId in suggestion.source_vendor_ids.filter((id) => !vendorMap.get(id))"
          :key="missingId"
          class="px-1.5 py-0.5 rounded-[3px] border text-[10.5px]"
          style="border-color: rgb(var(--warn) / 0.5); color: rgb(var(--warn))"
        >
          ? {{ missingId.slice(0, 6) }}
        </span>
      </div>

      <p class="text-[12px] text-ink-mute leading-relaxed" style="white-space: pre-line">
        {{ suggestion.rationale }}
      </p>
    </div>

    <footer class="rule-t p-3">
      <button
        class="btn btn-amber w-full h-9"
        type="button"
        @click="emit('use-suggestion', suggestion.source_vendor_ids)"
      >
        <FaIcon :icon="['fas', 'wand-magic-sparkles']" class="text-[10px]" />
        Pakai Saran Ini
      </button>
    </footer>
  </article>
</template>
