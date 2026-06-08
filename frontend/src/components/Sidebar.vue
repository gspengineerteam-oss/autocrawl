<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { RouterLink } from 'vue-router'

interface NavItem {
  to: string
  label: string
  icon: string
  code: string
}

const items: NavItem[] = [
  { to: '/', label: 'Pusat Komando', icon: 'gauge-high', code: '01' },
  { to: '/vendors', label: 'Vendor', icon: 'building', code: '02' },
  { to: '/expos', label: 'Ekspo', icon: 'flag-checkered', code: '03' },
  { to: '/pdfs', label: 'Brosur PDF', icon: 'file-pdf', code: '04' },
  { to: '/runs', label: 'Riwayat Operasi', icon: 'clock-rotate-left', code: '05' },
  { to: '/diagnostik', label: 'Diagnostik', icon: 'heart-pulse', code: '06' },
  { to: '/orkestrator', label: 'Orkestrator', icon: 'circle-nodes', code: '07' },
  { to: '/konfigurasi', label: 'Konfigurasi', icon: 'sliders', code: '08' },
  { to: '/labs', label: 'Labs', icon: 'flask', code: '09' },
]

const collapsed = useStorage('autocrawl-sidebar-collapsed', true)

defineProps<{
  transparent?: boolean
}>()
</script>

<template>
  <aside
    :class="[
      'relative z-10 flex h-full shrink-0 flex-col transition-[width] duration-150',
      collapsed ? 'w-14' : 'w-56',
      transparent
        ? 'border-r border-accent-500/15 bg-base-950/55 backdrop-blur-xl'
        : 'border-r border-base-200 bg-white dark:border-base-700 dark:bg-base-900',
    ]"
  >
    <div
      class="flex h-12 shrink-0 items-center px-2"
      :class="[
        collapsed ? 'justify-center' : 'gap-3 px-3',
        transparent
          ? 'border-b border-accent-500/15'
          : 'border-b border-base-200 dark:border-base-700',
      ]"
    >
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent-600 bg-accent-500 text-base-950"
      >
        <FaIcon :icon="['fas', 'crosshairs']" class="text-xs" />
      </div>
      <div v-if="!collapsed" class="flex min-w-0 flex-col leading-tight">
        <span class="font-mono text-xs font-semibold uppercase tracking-ops text-base-800 dark:text-base-100">
          AUTOCRAWL
        </span>
        <span class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">
          OPS CONSOLE v0.2
        </span>
      </div>
    </div>

    <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          :class="[
            'group relative flex w-full items-center rounded-md font-mono text-2xs font-medium uppercase tracking-ops transition-colors',
            collapsed ? 'h-10 justify-center' : 'h-10 gap-3 px-2',
            isActive
              ? 'bg-accent-500/10 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
              : 'text-base-500 hover:bg-base-100 hover:text-base-800 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100',
          ]"
          :title="collapsed ? item.label : undefined"
          @click="navigate"
        >
          <span
            v-if="isActive"
            class="absolute left-0 top-0 h-full w-0.5 bg-accent-500"
            aria-hidden="true"
          />
          <FaIcon :icon="['fas', item.icon]" class="text-sm" />
          <span v-if="!collapsed" class="flex-1 truncate text-left">{{ item.label }}</span>
          <span
            v-if="!collapsed"
            class="font-mono text-2xs text-base-400 dark:text-base-600"
          >
            {{ item.code }}
          </span>
        </button>
      </RouterLink>
    </nav>

    <button
      class="m-1.5 flex h-8 items-center justify-center rounded-md border border-base-200 text-base-500 transition-colors hover:border-base-300 hover:bg-base-50 hover:text-base-800 dark:border-base-700 dark:text-base-400 dark:hover:border-base-600 dark:hover:bg-base-800 dark:hover:text-base-100"
      :class="collapsed ? '' : 'gap-2 px-2'"
      :title="collapsed ? 'Buka' : 'Tutup'"
      @click="collapsed = !collapsed"
    >
      <FaIcon
        :icon="['fas', collapsed ? 'angles-right' : 'angles-left']"
        class="text-2xs"
      />
      <span
        v-if="!collapsed"
        class="font-mono text-2xs uppercase tracking-ops"
      >
        Tutup
      </span>
    </button>
  </aside>
</template>
