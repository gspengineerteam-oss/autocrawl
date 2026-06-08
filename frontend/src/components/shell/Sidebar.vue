<script setup lang="ts">
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { useQuery } from '@tanstack/vue-query'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

function handleLogout() {
  auth.logout()
  router.replace('/login')
}

interface NavItem {
  to: string
  label: string
  icon: string
  countKey?: 'vendors' | 'expos' | 'pdfs' | 'runs'
}

/**
 * Pure icon-rail sidebar - no brand wordmark, just FontAwesome icons
 * stacked vertically. Active route gets a 2px amber bar on the left
 * edge + amber icon tint. Tooltip on hover shows the section label
 * with its live count.
 *
 * Reference layout matches this: sidebar is purely glyphic, brand
 * wordmark sits in the topbar to the right.
 */

const items: NavItem[] = [
  { to: '/cari',        label: 'Cari Semantik', icon: 'magnifying-glass' },
  { to: '/',            label: 'Pusat Komando', icon: 'gauge-high' },
  { to: '/vendors',     label: 'Katalog',       icon: 'building',           countKey: 'vendors' },
  { to: '/expos',       label: 'Ekspo',         icon: 'flag-checkered',     countKey: 'expos' },
  { to: '/pdfs',        label: 'Brosur',        icon: 'file-pdf',           countKey: 'pdfs' },
  { to: '/runs',        label: 'Riwayat',       icon: 'clock-rotate-left',  countKey: 'runs' },
  { to: '/diagnostik',  label: 'Diagnostik',    icon: 'heart-pulse' },
  { to: '/orkestrator', label: 'Orkestrator',   icon: 'circle-nodes' },
  { to: '/konfigurasi', label: 'Konfigurasi',   icon: 'sliders' },
  { to: '/labs',        label: 'Labs',          icon: 'flask' },
  { to: '/pemantauan',  label: 'Pemantauan',    icon: 'tower-broadcast' },
]

const collapsed = useStorage('autocrawl-sidebar-collapsed', true)

const overview = useQuery({
  queryKey: ['overview'],
  queryFn: api.overview,
  refetchInterval: 30000,
})
const runsList = useQuery({
  queryKey: ['runs', 'recent', 50],
  queryFn: () => api.runs(50),
  refetchInterval: 30000,
})

const counts = computed(() => ({
  vendors: overview.data.value?.vendors_total ?? null,
  expos:   overview.data.value?.expos_total ?? null,
  pdfs:    overview.data.value?.pdfs_total ?? null,
  runs:    runsList.data.value?.total ?? runsList.data.value?.items?.length ?? null,
}))

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}
</script>

<template>
  <aside
    class="autocrawl-sidebar bg-bg rule-r relative z-10 flex h-full shrink-0 flex-col transition-[width] duration-200"
    :class="collapsed ? 'w-[52px]' : 'w-[200px]'"
  >
    <!-- Sidebar top: pure rail spacer (brand mark lives in topbar).
         Just an empty 58px region with a faint corner tick to give the
         rail a top "anchor" without duplicating the AC monogram. -->
    <div
      class="flex shrink-0 items-center justify-center"
      style="height: 58px;"
    >
      <span
        class="block bg-amber"
        :class="collapsed ? 'w-[14px] h-[2px]' : 'w-[28px] h-[2px]'"
        aria-hidden="true"
      ></span>
    </div>

    <!-- Nav rail -->
    <nav class="flex flex-col py-2.5 gap-0.5">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          :class="[
            'group relative flex h-9 w-full items-center transition-colors duration-150',
            collapsed ? 'justify-center px-0' : 'gap-3 px-4 text-left',
          ]"
          :title="collapsed ? item.label : undefined"
          @click="navigate"
        >
          <!-- Active left bar -->
          <span
            v-if="isActive"
            class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] bg-amber"
            aria-hidden="true"
          />
          <!-- Permanent gold leaf rule for the semantic search front door -->
          <span
            v-else-if="item.to === '/cari'"
            class="absolute left-0 top-1/2 -translate-y-1/2 h-3 w-[2px] bg-amber/60"
            aria-hidden="true"
          />

          <FaIcon
            :icon="['fas', item.icon]"
            class="text-[13px] shrink-0 transition-colors"
            :class="isActive
              ? 'text-amber'
              : item.to === '/cari'
                ? 'text-amber/80 group-hover:text-amber'
                : 'text-ink-mute group-hover:text-ink'"
          />

          <template v-if="!collapsed">
            <span
              class="flex-1 text-[12.5px] truncate transition-colors"
              :class="isActive ? 'text-ink font-medium' : 'text-ink-2 group-hover:text-ink'"
            >
              {{ item.label }}
            </span>
            <span
              v-if="item.countKey"
              class="num-display text-[10.5px] tabular-nums"
              :class="isActive ? 'text-amber' : 'text-ink-mute'"
            >
              {{ fmt(counts[item.countKey]) }}
            </span>
          </template>
        </button>
      </RouterLink>
    </nav>

    <div class="flex-1"></div>

    <!-- Operator session foot — username + logout. Compact rail tile, gak
         pakai card; rule-top sebagai separator dari nav. -->
    <div class="rule-t mx-2"></div>
    <button
      v-if="auth.isAuthenticated"
      type="button"
      class="group flex h-9 w-full items-center transition-colors hover:bg-surface-2/50"
      :class="collapsed ? 'justify-center' : 'gap-3 px-4'"
      :title="collapsed ? `Keluar (${auth.user})` : 'Keluar dari console'"
      @click="handleLogout"
    >
      <FaIcon
        :icon="['fas', 'right-from-bracket']"
        class="text-[12px] text-ink-mute group-hover:text-amber transition-colors"
      />
      <template v-if="!collapsed">
        <span class="flex-1 text-left">
          <span class="block text-[10.5px] uppercase tracking-[0.12em] text-ink-mute leading-tight">
            Operator
          </span>
          <span class="block text-[12px] font-medium text-ink leading-tight">
            {{ auth.user }}
          </span>
        </span>
        <span class="label label-mute group-hover:text-amber transition-colors">Keluar</span>
      </template>
    </button>

    <!-- Collapse toggle - subtle, no text in collapsed state -->
    <div class="rule-t mx-2"></div>
    <button
      type="button"
      class="flex h-9 w-full items-center transition-colors hover:bg-surface-2/50 mb-1"
      :class="collapsed ? 'justify-center' : 'gap-3 px-4'"
      :title="collapsed ? 'Buka sidebar' : 'Tutup sidebar'"
      @click="collapsed = !collapsed"
    >
      <FaIcon
        :icon="['fas', collapsed ? 'angles-right' : 'angles-left']"
        class="text-[11px] text-ink-mute"
      />
      <span v-if="!collapsed" class="label">Tutup</span>
    </button>
  </aside>
</template>
