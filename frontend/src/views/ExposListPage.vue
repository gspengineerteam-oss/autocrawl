<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import PageHeader from '@/components/shell/PageHeader.vue'
import GeoAvatar from '@/components/GeoAvatar.vue'
import { resolveCountry, flagEmoji } from '@/data/country_resolver'

const route = useRoute()
const router = useRouter()
const search = ref('')
const PAGE_SIZE = 250
const page = ref(1)
watch([search, () => route.query.country], () => { page.value = 1 })

const countryFilter = computed(() => {
  const q = route.query.country
  return typeof q === 'string' ? q : null
})

const countryFlag = computed(() => {
  const c = countryFilter.value
  if (!c) return ''
  const rec = resolveCountry(c)
  return rec ? flagEmoji(rec.cca2) : ''
})

const { data, isLoading } = useQuery({
  queryKey: ['expos', { search, country: countryFilter, page }],
  queryFn: () =>
    api.expos({
      search: search.value,
      country: countryFilter.value ?? undefined,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    }),
  refetchInterval: 30000,
  refetchOnWindowFocus: true,
})

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < totalPages.value)
function goNext() { if (canNext.value) page.value += 1 }
function goPrev() { if (canPrev.value) page.value -= 1 }

function clearCountryFilter() {
  const next = { ...route.query }
  delete next.country
  router.replace({ path: route.path, query: next })
}

const stats = computed(() => [
  { label: 'Total', value: total.value.toLocaleString(), tone: 'amber' as const },
  { label: 'Termuat', value: items.value.length, tone: 'mute' as const },
])
</script>

<template>
  <div class="flex flex-col">
    <PageHeader
      title="Calendar of Exhibitions"
      subtitle="Direktori semua ekspo yang sudah ditemukan oleh discovery agent"
      :stats="stats"
    />

    <!-- Active filter chip -->
    <div v-if="countryFilter" class="flex items-center justify-between bg-amber/5 rule-b border-amber/30 px-6 py-2.5">
      <div class="flex items-center gap-2 text-[12px]">
        <span class="text-[15px]">{{ countryFlag }}</span>
        <span class="label label-amber">Filter Negara</span>
        <span class="text-ink">{{ countryFilter }}</span>
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
          placeholder="Cari nama ekspo…"
          class="input pl-8 h-9"
        />
      </div>
      <span v-if="isLoading" class="ml-auto label label-amber flex items-center gap-1.5">
        <span class="dot dot-amber pulse-amber"></span>Memuat…
      </span>
      <span v-else class="ml-auto label label-mute">Live · 30s</span>
    </div>

    <!-- Ledger table -->
    <div class="flex-1 overflow-auto">
      <table v-if="items.length > 0" class="ledger w-full">
        <thead>
          <tr>
            <th class="w-[44%]">Ekspo</th>
            <th class="w-[14%]">Negara</th>
            <th class="w-[14%]">Tanggal Mulai</th>
            <th class="w-[10%]">Sumber</th>
            <th class="w-[9%] text-right">Vendor</th>
            <th class="w-[9%] text-right">PDF</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.expo_id" class="cursor-pointer">
            <td>
              <RouterLink :to="`/expos/${row.expo_id}`" class="flex items-center gap-3 group">
                <span
                  class="expo-row__avatar"
                  :data-elite="(row.vendor_domains?.length ?? 0) >= 50 ? 'true' : 'false'"
                  data-elite-style="inset"
                >
                  <GeoAvatar :seed="row.expo_id" :fallback="row.name" :size="36" />
                </span>
                <span class="flex flex-col min-w-0">
                  <span class="text-ink group-hover:text-amber transition-colors truncate">{{ row.name }}</span>
                  <span class="num text-[11px] text-ink-mute truncate block mt-0.5">{{ row.expo_id }}</span>
                </span>
              </RouterLink>
            </td>
            <td>
              <span v-if="row.country" class="flex items-center gap-1.5 text-[12.5px]">
                <span class="text-[14px]">{{ flagEmoji(resolveCountry(row.country)?.cca2 ?? '') }}</span>
                <span class="truncate">{{ row.country }}</span>
              </span>
              <span v-else class="text-ink-mute">—</span>
            </td>
            <td>
              <span v-if="row.start_date" class="num-display text-[12px]">{{ row.start_date }}</span>
              <span v-else class="text-ink-mute">—</span>
            </td>
            <td>
              <span class="pill text-[9.5px]">{{ row.source.toUpperCase() }}</span>
            </td>
            <td class="text-right">
              <span class="num-display text-[14px] font-semibold num-amber tabular-nums">
                {{ row.vendor_domains?.length ?? 0 }}
              </span>
            </td>
            <td class="text-right">
              <span class="num-display text-[14px] font-semibold text-cyan tabular-nums">
                {{ row.pdf_brochure_urls?.length ?? 0 }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
        <FaIcon :icon="['fas', 'flag-checkered']" class="text-[28px] text-ink-mute" />
        <span class="label label-mute">Belum ada ekspo terdaftar</span>
        <span class="text-[12px] text-ink-mute">Trigger ENGAGE untuk memulai discovery run baru</span>
      </div>
    </div>

    <div
      v-if="total > 0"
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
.expo-row__avatar {
  position: relative;
  display: inline-flex;
  width: 36px;
  height: 36px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
}
</style>
