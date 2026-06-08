<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Vendor } from '@/api/types'

defineProps<{
  vendors: Vendor[]
}>()

function sourceMeta(v: Vendor): { label: string; tone: string; icon: string } {
  const types = new Set((v.source_trail ?? []).map((s) => s.type))
  if (types.has('pdf')) return { label: 'PDF', tone: 'crit', icon: 'file-pdf' }
  if (types.has('aggregator')) return { label: 'AGR', tone: 'info', icon: 'globe' }
  if (types.has('search')) return { label: 'SRC', tone: 'accent', icon: 'magnifying-glass' }
  return { label: 'MAN', tone: 'muted', icon: 'circle-info' }
}

function relativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins}m lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}j lalu`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}h lalu`
  const months = Math.floor(days / 30)
  return `${months}bln lalu`
}

function pillClass(tone: string): string {
  switch (tone) {
    case 'crit':
      return 'hud-pill-crit'
    case 'info':
      return 'hud-pill-info'
    case 'accent':
      return 'hud-pill-accent'
    default:
      return 'hud-pill-muted'
  }
}
</script>

<template>
  <div class="flex flex-col divide-y divide-base-100 dark:divide-base-800">
    <RouterLink
      v-for="v in vendors"
      :key="v.vendor_id || v.domain || v.company_name"
      :to="`/vendors/${v.vendor_id || v.domain || ''}`"
      class="block px-3 py-2.5 transition-colors hover:bg-accent-500/5 dark:hover:bg-accent-500/10"
    >
      <div class="flex items-start gap-2.5">
        <span
          v-if="!v.logo_url"
          class="flex h-8 w-8 shrink-0 items-center justify-center border border-base-200 bg-base-50 font-mono text-xs font-semibold text-base-700 dark:border-base-700 dark:bg-base-800 dark:text-base-200"
        >
          {{ v.company_name.charAt(0).toUpperCase() }}
        </span>
        <img
          v-else
          :src="v.logo_url"
          :alt="v.company_name"
          class="h-8 w-8 shrink-0 border border-base-200 bg-white object-contain p-0.5 dark:border-base-700 dark:bg-base-800"
          referrerpolicy="no-referrer"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium text-base-800 dark:text-base-100">
              {{ v.company_name }}
            </span>
            <span class="hud-mono-num truncate font-mono text-2xs text-base-400 dark:text-base-500">
              {{ v.domain }}
            </span>
          </div>
          <p
            v-if="v.tagline || v.description"
            class="mt-1 line-clamp-1 text-xs text-base-500 dark:text-base-400"
          >
            {{ v.tagline || (v.description ?? '').slice(0, 100) }}
          </p>
          <div class="mt-1.5 flex items-center gap-2 font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">
            <span :class="pillClass(sourceMeta(v).tone)">
              <FaIcon :icon="['fas', sourceMeta(v).icon]" class="text-[8px]" />
              {{ sourceMeta(v).label }}
            </span>
            <span v-if="v.address?.country" class="flex items-center gap-1">
              <FaIcon :icon="['fas', 'location-dot']" class="text-[8px]" />
              {{ v.address.country }}
            </span>
            <span class="ml-auto">{{ relativeTime(v.last_enriched_at) }}</span>
          </div>
        </div>
      </div>
    </RouterLink>

    <div
      v-if="!vendors.length"
      class="p-6 text-center font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500"
    >
      Belum ada vendor terkoleksi.
    </div>
  </div>
</template>
