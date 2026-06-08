<script setup lang="ts">
import { useRoute, RouterLink } from 'vue-router'
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import HudThemeToggle from './HudThemeToggle.vue'
import HudHeartbeat from './HudHeartbeat.vue'
import HudUptime from './HudUptime.vue'
import HudStatusPill from './HudStatusPill.vue'
import { api } from '@/api/client'

const route = useRoute()
const queryClient = useQueryClient()

interface Crumb {
  label: string
  to?: string
}

const titleMap: Record<string, Crumb[]> = {
  '/': [{ label: 'Pusat Komando' }],
  '/vendors': [{ label: 'Vendor' }],
  '/expos': [{ label: 'Ekspo' }],
  '/pdfs': [{ label: 'Brosur PDF' }],
  '/runs': [{ label: 'Riwayat Operasi' }],
  '/diagnostik': [{ label: 'Diagnostik' }],
}

const breadcrumbs = computed<Crumb[]>(() => {
  const path = route.path
  if (titleMap[path]) return titleMap[path]
  if (path.startsWith('/vendors/')) {
    return [{ label: 'Vendor', to: '/vendors' }, { label: 'Detail' }]
  }
  if (path.startsWith('/expos/')) {
    return [{ label: 'Ekspo', to: '/expos' }, { label: 'Detail' }]
  }
  return [{ label: 'Autocrawl' }]
})

const activeQuery = useQuery({
  queryKey: ['runs', 'active'],
  queryFn: api.activeRun,
  refetchInterval: 5000,
})

const isRunning = computed(() => Boolean(activeQuery.data.value?.active))
const stopRequested = computed(() => {
  const a = activeQuery.data.value?.active as { stop_requested?: boolean } | null | undefined
  return Boolean(a?.stop_requested)
})
const submitting = ref(false)
const stopping = ref(false)
const showModeMenu = ref(false)
const showForceModal = ref(false)

defineProps<{
  transparent?: boolean
}>()

async function triggerRun(mode: 'dev' | 'normal' | 'aggressive' = 'normal') {
  showModeMenu.value = false
  if (isRunning.value || submitting.value) return
  submitting.value = true
  try {
    await api.triggerRun(mode)
    toast.success('Operasi diluncurkan', {
      description: `Mode ${mode.toUpperCase()} berjalan di background. Dashboard auto refresh saat selesai.`,
    })
    queryClient.invalidateQueries({ queryKey: ['runs', 'active'] })
    queryClient.invalidateQueries({ queryKey: ['vendors'] })
    queryClient.invalidateQueries({ queryKey: ['expos'] })
    queryClient.invalidateQueries({ queryKey: ['pdfs'] })
    queryClient.invalidateQueries({ queryKey: ['runs'] })
    queryClient.invalidateQueries({ queryKey: ['overview'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['exhibitor-refs'] })
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { detail?: { message?: string } } } }
    if (e.response?.status === 409) {
      toast.warning('Operasi masih aktif', {
        description: e.response.data?.detail?.message ?? 'Tunggu operasi sekarang selesai.',
      })
    } else {
      toast.error('Gagal meluncurkan operasi', {
        description: 'Cek log API container untuk detail.',
      })
    }
  } finally {
    submitting.value = false
  }
}

async function stopRun(force: boolean) {
  if (stopping.value) return
  stopping.value = true
  try {
    const res = await api.stopRun(force)
    if (res.mode === 'force') {
      toast.success('Operasi dihentikan paksa', {
        description: 'Subprocess di-kill, lock dilepas. Trigger run baru sudah bisa.',
      })
    } else {
      toast.info('Permintaan stop diterima', {
        description: 'Worker drain berlanjut. Operasi akan selesai dalam beberapa puluh detik.',
      })
    }
    queryClient.invalidateQueries({ queryKey: ['runs', 'active'] })
    queryClient.invalidateQueries({ queryKey: ['runs'] })
    queryClient.invalidateQueries({ queryKey: ['exhibitor-refs'] })
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { detail?: string } } }
    if (e.response?.status === 404) {
      toast.warning('Tidak ada operasi aktif untuk dihentikan')
    } else {
      toast.error('Gagal menghentikan operasi', {
        description: e.response?.data?.detail ?? 'Cek log API container.',
      })
    }
  } finally {
    stopping.value = false
    showForceModal.value = false
  }
}

function onStopClick(e: MouseEvent) {
  // Default = open force-confirm modal. Graceful stop is currently a no-op
  // (workers don't check the cooperative flag in graph.py), so the only
  // path that actually halts a run is force. Modal warns about implications.
  // Shift+click skips the modal and fires graceful for users who explicitly
  // want to drain naturally and don't mind that it might not stop.
  if (e.shiftKey) {
    void stopRun(false)
    return
  }
  showForceModal.value = true
}
</script>

<template>
  <header
    :class="[
      'relative z-50 flex h-12 shrink-0 items-center justify-between px-4',
      transparent
        ? 'border-b border-accent-500/15 bg-base-950/30 backdrop-blur-2xl'
        : 'border-b border-base-200 bg-white dark:border-base-700 dark:bg-base-900',
    ]"
  >
    <div class="flex items-center gap-3">
      <span class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">
        SYS://
      </span>
      <nav class="flex items-center gap-1.5 font-mono text-xs uppercase tracking-ops">
        <template v-for="(crumb, i) in breadcrumbs" :key="i">
          <RouterLink
            v-if="crumb.to"
            :to="crumb.to"
            class="text-base-500 hover:text-accent-600 dark:text-base-400 dark:hover:text-accent-300"
          >
            {{ crumb.label }}
          </RouterLink>
          <span v-else class="font-medium text-base-800 dark:text-base-100">
            {{ crumb.label }}
          </span>
          <span v-if="i < breadcrumbs.length - 1" class="text-base-300 dark:text-base-600">/</span>
        </template>
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <HudHeartbeat />
      <span class="hidden h-4 w-px bg-base-200 dark:bg-base-700 sm:inline-block" />
      <HudUptime label="UPTIME" />
      <template v-if="transparent">
        <span class="hidden h-4 w-px bg-accent-500/20 sm:inline-block" />
        <span class="hidden font-mono text-2xs uppercase tracking-ops text-base-500 sm:inline">
          BUILD 0.2 · DEFCON-IDLE
        </span>
      </template>
    </div>

    <div class="flex items-center gap-2">
      <HudStatusPill
        v-if="isRunning && !stopRequested"
        tone="warn"
        label="OPS RUNNING"
        :pulse="true"
      />
      <HudStatusPill
        v-else-if="stopRequested"
        tone="crit"
        label="STOPPING"
        :pulse="true"
      />

      <button
        v-if="isRunning"
        class="hud-btn-danger h-8 px-3"
        :disabled="stopping || stopRequested"
        title="Klik = graceful drain · Shift+klik = stop paksa"
        @click="onStopClick"
      >
        <FaIcon
          :icon="['fas', stopping ? 'circle-notch' : 'stop']"
          :class="stopping ? 'animate-spin text-2xs' : 'text-2xs'"
        />
        <span>{{ stopRequested ? 'STOPPING…' : 'STOP' }}</span>
      </button>

      <div class="relative">
        <div class="flex">
          <button
            class="hud-btn-primary h-8 px-3"
            :disabled="isRunning || submitting"
            @click="triggerRun('normal')"
          >
            <FaIcon
              :icon="['fas', submitting ? 'circle-notch' : 'play']"
              :class="submitting ? 'animate-spin text-2xs' : 'text-2xs'"
            />
            <span>{{ isRunning ? 'BERJALAN' : 'ENGAGE' }}</span>
          </button>
          <button
            class="hud-btn-primary h-8 border-l border-accent-700 px-1.5"
            :disabled="isRunning || submitting"
            aria-label="Pilih mode operasi"
            @click="showModeMenu = !showModeMenu"
          >
            <FaIcon :icon="['fas', 'chevron-down']" class="text-2xs" />
          </button>
        </div>

        <Transition
          enter-active-class="transition duration-100"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-75"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="showModeMenu"
            class="absolute right-0 top-10 z-[55] w-48 overflow-hidden rounded-lg border border-base-200 bg-white shadow-xl dark:border-base-700 dark:bg-base-900"
          >
            <button
              class="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent-500/10"
              @click="triggerRun('dev')"
            >
              <span class="font-mono uppercase tracking-ops">Dev</span>
              <span class="font-mono text-2xs text-base-400 dark:text-base-500">SAMPEL KECIL</span>
            </button>
            <button
              class="flex w-full items-center justify-between border-t border-base-200 px-3 py-2 text-left text-xs hover:bg-accent-500/10 dark:border-base-700"
              @click="triggerRun('normal')"
            >
              <span class="font-mono uppercase tracking-ops">Normal</span>
              <span class="font-mono text-2xs text-base-400 dark:text-base-500">DEFAULT</span>
            </button>
            <button
              class="flex w-full items-center justify-between border-t border-base-200 px-3 py-2 text-left text-xs hover:bg-accent-500/10 dark:border-base-700"
              @click="triggerRun('aggressive')"
            >
              <span class="font-mono uppercase tracking-ops">Agresif</span>
              <span class="font-mono text-2xs text-base-400 dark:text-base-500">FULL THROTTLE</span>
            </button>
          </div>
        </Transition>
      </div>

      <HudThemeToggle />
    </div>

    <!-- Force-stop confirmation modal -->
    <div
      v-if="showForceModal"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      @click.self="showForceModal = false"
    >
      <div class="hud-panel w-full max-w-md border-crit-500/50">
        <div class="hud-panel-head border-crit-500/40 bg-crit-500/10">
          <div class="flex items-center gap-2">
            <FaIcon :icon="['fas', 'triangle-exclamation']" class="text-crit-400" />
            <h2 class="hud-panel-title text-crit-300">STOP PAKSA — KONFIRMASI</h2>
          </div>
        </div>
        <div class="hud-panel-body flex flex-col gap-3">
          <p class="font-mono text-xs leading-relaxed text-base-300">
            Stop paksa akan:
          </p>
          <ul class="flex flex-col gap-1 font-mono text-2xs text-base-300">
            <li>• Cancel asyncio task langsung (~5 detik)</li>
            <li>• Kill Chromium subprocess yang aktif</li>
            <li>• Abort LLM call mid-flight (token tetap kebakar)</li>
            <li>• Vendor mid-enrich tidak akan ke-commit ke DB</li>
          </ul>
          <p class="font-mono text-2xs leading-relaxed text-warn-400">
            Tip: Shift+klik tombol stop = graceful drain (worker drain natural,
            tapi sekarang ga ada boundary check di graph.py jadi sebagian besar
            worker tetep jalan sampai selesai). Force aja kalau mau bener-bener stop.
          </p>
          <div class="flex items-center justify-end gap-2 pt-1">
            <button class="hud-btn-ghost" type="button" @click="showForceModal = false">
              Batal
            </button>
            <button
              class="hud-btn-danger"
              type="button"
              :disabled="stopping"
              @click="stopRun(true)"
            >
              <FaIcon :icon="['fas', stopping ? 'circle-notch' : 'stop']" :class="stopping ? 'animate-spin text-2xs' : 'text-2xs'" />
              STOP PAKSA
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
