<script setup lang="ts">
import { computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { api } from '@/api/client'

const router = useRouter()
const queryClient = useQueryClient()

const activeQuery = useQuery({
  queryKey: ['runs', 'active'],
  queryFn: api.activeRun,
  refetchInterval: 5000,
})
const isRunning = computed(() => Boolean(activeQuery.data.value?.active))

interface Action {
  label: string
  hint: string
  icon: string
  run: () => unknown
}

const actions = computed<Action[]>(() => [
  {
    label: isRunning.value ? 'Operasi Berjalan' : 'Luncurkan Normal',
    hint: isRunning.value ? 'Lihat orkestrator' : 'Run mode normal',
    icon: isRunning.value ? 'tower-broadcast' : 'play',
    run: async () => {
      if (isRunning.value) { router.push('/orkestrator'); return }
      try {
        await api.triggerRun('normal')
        toast.success('Operasi diluncurkan')
        queryClient.invalidateQueries({ queryKey: ['runs', 'active'] })
      } catch { toast.error('Gagal meluncurkan operasi') }
    },
  },
  { label: 'Daftar Vendor',  hint: 'Telusuri indeks',     icon: 'building',          run: () => router.push('/vendors') },
  { label: 'Daftar Ekspo',   hint: 'Per negara/tema',     icon: 'flag-checkered',    run: () => router.push('/expos') },
  { label: 'Brosur PDF',     hint: 'Arsip cetak',         icon: 'file-pdf',          run: () => router.push('/pdfs') },
  { label: 'Riwayat Operasi',hint: 'Jejak run',           icon: 'clock-rotate-left', run: () => router.push('/runs') },
  { label: 'Konfigurasi',    hint: 'Aturan & prompt',     icon: 'sliders',           run: () => router.push('/konfigurasi') },
])
</script>

<template>
  <article class="card overflow-hidden">
    <div class="card-head">
      <span class="label">Quick Actions</span>
      <kbd class="text-[10px] tracking-widest border border-rule-strong px-1.5 py-0.5 text-ink-mute" style="border-radius: 3px;">⌘K</kbd>
    </div>
    <div class="px-2 py-1.5">
      <button
        v-for="a in actions"
        :key="a.label"
        class="group w-full flex items-center gap-3 px-3 py-2 rounded-[6px] hover:bg-surface-2/60 text-left transition-colors"
        @click="a.run()"
      >
        <span class="flex h-7 w-7 items-center justify-center bg-surface-2 group-hover:bg-amber group-hover:text-bg transition-colors shrink-0" style="border-radius: 4px;">
          <FaIcon :icon="['fas', a.icon]" class="text-[12px] text-amber group-hover:text-bg transition-colors" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-[12.5px] text-ink truncate group-hover:text-amber transition-colors">{{ a.label }}</div>
          <div class="text-[10.5px] text-ink-mute truncate">{{ a.hint }}</div>
        </div>
        <FaIcon :icon="['fas', 'chevron-right']" class="text-[10px] text-ink-mute opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  </article>
</template>
