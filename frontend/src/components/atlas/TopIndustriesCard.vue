<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'

const industries = useQuery({
  queryKey: ['stats', 'industries'],
  queryFn: api.stats.industries,
  refetchInterval: 60_000,
})

const ranked = computed(() => {
  const rows = industries.data.value ?? []
  const sorted = [...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 6)
  const max = sorted[0]?.count ?? 1
  return sorted.map((r, i) => ({
    rank: String(i + 1).padStart(2, '0'),
    tag: r.tag,
    count: r.count ?? 0,
    bar: max ? (r.count ?? 0) / max : 0,
  }))
})
</script>

<template>
  <article class="card">
    <header class="card-head">
      <span class="label">Industri Teratas</span>
      <span class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-mute">N=6</span>
    </header>
    <ul class="divide-y" style="border-color: rgb(var(--rule) / var(--rule-alpha));">
      <li
        v-for="row in ranked"
        :key="row.tag"
        class="grid grid-cols-[2rem_1fr_4rem] items-center gap-3 px-5 py-2.5"
      >
        <span class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-mute">{{ row.rank }}</span>
        <div class="min-w-0">
          <span class="block text-[0.875rem] text-ink truncate">{{ row.tag }}</span>
          <div class="mt-1 h-[2px] w-full bg-paper-2 relative">
            <span
              class="absolute inset-y-0 left-0 bg-ink"
              :style="{ width: `${(row.bar * 100).toFixed(1)}%` }"
            />
          </div>
        </div>
        <span class="num-display text-[1rem] text-right">{{ row.count.toLocaleString() }}</span>
      </li>
      <li v-if="ranked.length === 0" class="px-5 py-4 label">Tiada data industri.</li>
    </ul>
  </article>
</template>
