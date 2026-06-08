<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import { resolveCountry, flagEmoji } from '@/data/country_resolver'

const router = useRouter()

/**
 * Top countries by vendor count - real /stats/countries data.
 * Each row: rank · flag · country · vendor count · bar-fill.
 * Click a row → /vendors?country=…
 */

const countries = useQuery({
  queryKey: ['stats', 'countries'],
  queryFn: () => api.stats.countries(50),
  refetchInterval: 60_000,
})

interface Row {
  rank: string
  iso2: string
  flag: string
  name: string
  count: number
  bar: number
}

const rows = computed<Row[]>(() => {
  const list = countries.data.value ?? []
  if (list.length === 0) return []
  const max = list[0]?.count ?? 1
  return list.map((r, i) => {
    const rec = resolveCountry(r.country)
    return {
      rank: String(i + 1).padStart(2, '0'),
      iso2: rec?.cca2 ?? '',
      flag: rec ? flagEmoji(rec.cca2) : '🏳',
      name: rec?.name ?? r.country,
      count: r.count ?? 0,
      bar: max > 0 ? (r.count ?? 0) / max : 0,
    }
  })
})

function open(name: string) {
  router.push({ path: '/vendors', query: { country: name } })
}
</script>

<template>
  <article class="card overflow-hidden">
    <div class="card-head">
      <span class="label">Negara dengan Vendor Terbanyak</span>
      <span class="label label-mute">{{ rows.length }} of {{ countries.data.value?.length ?? 0 }}</span>
    </div>
    <div class="px-2 py-1.5 max-h-[420px] overflow-y-auto">
      <button
        v-for="row in rows"
        :key="row.iso2 || row.name"
        class="group w-full grid grid-cols-[1.75rem_1.5rem_1fr_4rem] items-center gap-3 px-3 py-2 rounded-[6px] hover:bg-surface-2/60 transition-colors text-left"
        @click="open(row.name)"
      >
        <span class="num-display text-[10.5px] text-ink-mute">{{ row.rank }}</span>
        <span class="text-[16px] leading-none">{{ row.flag }}</span>
        <div class="min-w-0">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-[13px] text-ink truncate group-hover:text-amber transition-colors">{{ row.name }}</span>
          </div>
          <div class="mt-1.5 h-[3px] bg-surface-2 rounded-[2px] overflow-hidden">
            <div
              class="h-full bg-amber rounded-[2px] transition-[width] duration-500"
              :style="{ width: `${(row.bar * 100).toFixed(1)}%` }"
            />
          </div>
        </div>
        <span class="num-display text-[14px] text-right">{{ row.count.toLocaleString() }}</span>
      </button>
      <div v-if="rows.length === 0" class="px-3 py-6 text-center label label-mute">Tiada data negara.</div>
    </div>
  </article>
</template>
