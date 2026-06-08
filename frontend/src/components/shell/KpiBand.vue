<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/api/client'
import { useNumberTicker } from '@/composables/useNumberTicker'

/**
 * KPI strip - 5 tiles in a row across the full width, separated by
 * vertical hairlines. Matches the reference image layout: small label
 * top, big amber number, small delta/unit hint below.
 *
 * All numbers from real backend endpoints. Numbers tick odometer-style
 * via useNumberTicker.
 */

const overview = useQuery({
  queryKey: ['overview'],
  queryFn: api.overview,
  refetchInterval: 30000,
})
const timeline = useQuery({
  queryKey: ['stats', 'timeline', 30],
  queryFn: () => api.stats.timeline(30),
  refetchInterval: 60000,
})
const industries = useQuery({
  queryKey: ['stats', 'industries'],
  queryFn: api.stats.industries,
  refetchInterval: 60000,
})
const expoCountries = useQuery({
  queryKey: ['stats', 'expo-countries'],
  queryFn: api.stats.expoCountries,
  refetchInterval: 60000,
})
const vendorCountries = useQuery({
  queryKey: ['stats', 'countries'],
  queryFn: () => api.stats.countries(50),
  refetchInterval: 60000,
})

const totals = computed(() => ({
  vendors:    overview.data.value?.vendors_total ?? 0,
  expos:      overview.data.value?.expos_total ?? 0,
  industries: industries.data.value?.length ?? 0,
  countries:  (() => {
    const set = new Set<string>()
    for (const r of (vendorCountries.data.value ?? [])) if (r.country) set.add(r.country)
    for (const r of (expoCountries.data.value ?? [])) if (r.country) set.add(r.country)
    return set.size
  })(),
}))

const deltaPct = computed(() => {
  const points = timeline.data.value ?? []
  if (points.length < 2) return 0
  const half = Math.floor(points.length / 2)
  const earlySum = points.slice(0, half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  const lateSum  = points.slice(half).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
  if (earlySum === 0) return lateSum > 0 ? 100 : 0
  return ((lateSum - earlySum) / earlySum) * 100
})

const newLeads = computed(() => {
  const points = timeline.data.value ?? []
  return points.slice(-7).reduce((s, p) => s + (p.vendors_added ?? 0), 0)
})

const tickedVendors    = useNumberTicker(computed(() => totals.value.vendors), { duration: 500 })
const tickedExpos      = useNumberTicker(computed(() => totals.value.expos), { duration: 500 })
const tickedIndustries = useNumberTicker(computed(() => totals.value.industries), { duration: 500 })
const tickedCountries  = useNumberTicker(computed(() => totals.value.countries), { duration: 500 })
const tickedNewLeads   = useNumberTicker(computed(() => newLeads.value), { duration: 500 })

function fmtCommas(n: number): string { return n.toLocaleString('en-US') }

interface Tile {
  label: string
  unit: string
  value: number
  delta?: { value: string; positive: boolean }
}

const tiles = computed<Tile[]>(() => [
  {
    label: 'Total Vendor',
    unit: '30D',
    value: tickedVendors.value,
    delta: {
      value: `${deltaPct.value >= 0 ? '+' : ''}${deltaPct.value.toFixed(1)}%`,
      positive: deltaPct.value >= 0,
    },
  },
  { label: 'Industri',     unit: 'tag',     value: tickedIndustries.value },
  { label: 'Ekspo',        unit: 'edisi',   value: tickedExpos.value },
  { label: 'Baru · 7D',    unit: 'vendor',  value: tickedNewLeads.value },
  { label: 'Negara',       unit: 'jangkauan', value: tickedCountries.value },
])
</script>

<template>
  <section class="rule-b bg-bg relative z-30 grid grid-cols-5">
    <div
      v-for="(tile, i) in tiles"
      :key="tile.label"
      :class="[
        'flex flex-col px-5 py-3.5',
        i < tiles.length - 1 ? 'rule-r' : '',
      ]"
    >
      <div class="flex items-baseline justify-between mb-1">
        <span class="label">{{ tile.label }}</span>
        <span v-if="tile.delta" class="num-display text-[10.5px] tabular-nums" :class="tile.delta.positive ? 'text-ok' : 'text-crit'">
          <FaIcon :icon="['fas', tile.delta.positive ? 'arrow-up' : 'arrow-down']" class="text-[8px] mr-0.5" />{{ tile.delta.value }}
        </span>
        <span v-else class="label label-mute">{{ tile.unit }}</span>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="kpi-num">{{ fmtCommas(tile.value) }}</span>
        <span v-if="tile.delta" class="label label-mute">{{ tile.unit }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* KPI numerics: Geist variable serif at display opsz. Editorial weight on
 * the totals — the cover-line of the dossier. */
.kpi-num {
  font-family: 'Geist Variable', 'Geist', serif;
  font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 0;
  font-weight: 500;
  font-size: 32px;
  letter-spacing: -0.035em;
  line-height: 0.95;
  color: rgb(var(--amber));
  font-feature-settings: 'tnum' 1, 'lnum' 1;
  font-variant-numeric: tabular-nums;
}
</style>
