<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import { flagEmoji } from '@/data/country_resolver'
import type { Vendor } from '@/api/types'

const router = useRouter()

const vendors = useQuery({
  queryKey: ['vendors', 'live-feed'],
  queryFn: () => api.vendors({ limit: 24, sort: 'last_enriched_at:desc' }),
  refetchInterval: 5_000,
})

interface Row {
  vendor: Vendor
  fresh: boolean
}

const seenIds = ref<Set<string>>(new Set())
const initialLoadDone = ref(false)

function vendorKey(v: Vendor): string {
  return v.vendor_id || v.domain || v.company_name || ''
}

const rows = computed<Row[]>(() => {
  const items = (vendors.data.value?.items ?? []) as Vendor[]
  return items.map((v) => ({
    vendor: v,
    fresh: initialLoadDone.value && !seenIds.value.has(vendorKey(v)),
  }))
})

watch(
  () => vendors.data.value?.items,
  (items) => {
    if (!items) return
    if (!initialLoadDone.value) {
      for (const v of items as Vendor[]) seenIds.value.add(vendorKey(v))
      initialLoadDone.value = true
      return
    }
    for (const v of items as Vendor[]) {
      const k = vendorKey(v)
      if (!seenIds.value.has(k)) {
        seenIds.value.add(k)
        if (seenIds.value.size > 500) {
          const first = seenIds.value.values().next().value
          if (first) seenIds.value.delete(first)
        }
      }
    }
  },
  { immediate: true },
)

function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}d`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j`
  const d = Math.floor(h / 24)
  return `${d}h`
}

function open(v: Vendor) {
  if (v.domain) router.push(`/vendors/${encodeURIComponent(v.domain)}`)
}
</script>

<template>
  <article class="card overflow-hidden flex flex-col">
    <div class="card-head shrink-0">
      <div class="flex items-center gap-2">
        <span class="dot dot-amber dot-glow blink"></span>
        <span class="label">Live Exhibitor Feed</span>
      </div>
      <span class="label label-mute">Auto · 5s</span>
    </div>

    <div class="flex-1 overflow-y-auto">
      <table class="ledger w-full">
        <thead>
          <tr>
            <th class="w-[2.5rem]">#</th>
            <th>Vendor</th>
            <th class="w-[3.5rem]">Asal</th>
            <th class="w-[4rem] text-right">Diperkaya</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in rows"
            :key="vendorKey(row.vendor)"
            class="cursor-pointer"
            @click="open(row.vendor)"
          >
            <td>
              <div class="flex items-center gap-1.5">
                <span class="dot" :class="row.fresh ? 'dot-amber dot-glow vermilion-fade' : 'dot-mute'"></span>
                <span class="num-display text-[10.5px] text-ink-mute">{{ String(i + 1).padStart(3, '0') }}</span>
              </div>
            </td>
            <td>
              <div class="min-w-0">
                <div class="text-[13px] text-ink truncate">{{ row.vendor.company_name || row.vendor.domain || '—' }}</div>
                <div class="num-display text-[11px] text-ink-mute truncate">{{ row.vendor.domain || '—' }}</div>
              </div>
            </td>
            <td class="text-[16px]">{{ flagEmoji(row.vendor.registrar_country ?? '') || '🏳' }}</td>
            <td class="text-right num-display text-[12.5px] text-ink-2">{{ timeAgo(row.vendor.last_enriched_at) }}</td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="4" class="text-center label label-mute py-6">Belum ada pengayaan tercatat.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
