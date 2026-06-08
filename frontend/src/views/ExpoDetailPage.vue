<script setup lang="ts">
import { ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { api } from '@/api/client'
import { resolveCountry, flagEmoji } from '@/data/country_resolver'

const props = defineProps<{ expoId: string }>()
const queryClient = useQueryClient()
const deepening = ref(false)

const { data, isLoading, isError } = useQuery({
  queryKey: ['expo', () => props.expoId],
  queryFn: () => api.expo(props.expoId),
  refetchInterval: () => (deepening.value ? 5000 : false),
})

async function deepenExpo() {
  if (!data.value || deepening.value) return
  deepening.value = true
  toast.info('Perdalam ekspo diluncurkan', {
    description: 'Re-extract aggregator + PDF + push refs ke pipeline.',
  })
  try {
    await api.deepenExpo(props.expoId)
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['expo', () => props.expoId] })
      queryClient.invalidateQueries({ queryKey: ['expos'] })
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['exhibitor-refs'] })
    }, 8000)
    setTimeout(() => { deepening.value = false }, 90000)
  } catch {
    deepening.value = false
    toast.error('Gagal meluncurkan deepen')
  }
}
</script>

<template>
  <div class="flex flex-col p-6 gap-4">
    <RouterLink
      to="/expos"
      class="inline-flex w-fit items-center gap-2 label hover:text-amber transition-colors"
    >
      <FaIcon :icon="['fas', 'chevron-left']" class="text-[10px]" />
      Kembali ke daftar ekspo
    </RouterLink>

    <div v-if="isLoading" class="card animate-pulse p-8">
      <div class="h-6 w-1/3 bg-surface-2 rounded-[3px]" />
    </div>

    <article v-else-if="isError" class="card overflow-hidden">
      <div class="card-body py-12 flex flex-col items-center gap-3">
        <FaIcon :icon="['fas', 'circle-xmark']" class="text-[32px] text-crit" />
        <h3 class="text-[18px] font-bold text-ink">Ekspo tidak ditemukan</h3>
        <p class="text-[13px] text-ink-2 text-center max-w-md">
          Ekspo dengan ID ini belum terdiscover.
        </p>
      </div>
    </article>

    <template v-else-if="data">
      <!-- Hero panel -->
      <article class="card overflow-hidden">
        <div class="card-head">
          <div class="flex items-center gap-2.5">
            <span class="num-display text-[10.5px] tracking-[0.18em] text-ink-mute font-bold">EXP-INFO</span>
            <span class="label label-ink">{{ data.name }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="num-display text-[10.5px] text-ink-mute">{{ data.expo_id }}</span>
            <button class="btn btn-amber h-8" :disabled="deepening" @click="deepenExpo">
              <FaIcon
                :icon="['fas', deepening ? 'circle-notch' : 'crosshairs']"
                :class="deepening ? 'animate-spin text-[10px]' : 'text-[10px]'"
              />
              {{ deepening ? 'Memperdalam…' : 'Perdalam Sekarang' }}
            </button>
          </div>
        </div>

        <div class="card-body">
          <div class="flex items-baseline gap-3 mb-4">
            <h1 class="text-[26px] font-bold tracking-[-0.02em] text-ink leading-none">
              {{ data.name }}
            </h1>
            <span v-if="data.country" class="flex items-center gap-1.5 text-[14px] text-ink-2">
              <span class="text-[16px]">{{ flagEmoji(resolveCountry(data.country)?.cca2 ?? '') }}</span>
              {{ data.country }}
            </span>
          </div>

          <dl class="grid grid-cols-2 md:grid-cols-4 gap-4 rule-t pt-4">
            <div>
              <dt class="label">Negara</dt>
              <dd class="text-[14px] text-ink mt-1">{{ data.country ?? '—' }}</dd>
            </div>
            <div>
              <dt class="label">Lokasi</dt>
              <dd class="text-[14px] text-ink mt-1 truncate">{{ data.location ?? '—' }}</dd>
            </div>
            <div>
              <dt class="label">Tgl Mulai</dt>
              <dd class="num-display text-[14px] text-ink mt-1">{{ data.start_date ?? '—' }}</dd>
            </div>
            <div>
              <dt class="label">Tgl Selesai</dt>
              <dd class="num-display text-[14px] text-ink mt-1">{{ data.end_date ?? '—' }}</dd>
            </div>
          </dl>

          <div v-if="data.topics?.length" class="mt-4 flex flex-wrap gap-1.5">
            <span
              v-for="t in data.topics"
              :key="t"
              class="px-2 py-0.5 rounded-[3px] text-[11px] text-amber bg-amber/10 border border-amber/30 font-semibold uppercase tracking-[0.08em]"
            >
              {{ t }}
            </span>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <a v-if="data.aggregator_url" :href="data.aggregator_url" target="_blank" rel="noopener noreferrer" class="btn btn-ghost h-9">
              <FaIcon :icon="['fas', 'globe']" class="text-[10px]" />
              Agregator
              <FaIcon :icon="['fas', 'arrow-up-right-from-square']" class="text-[8px]" />
            </a>
            <a v-if="data.official_url" :href="data.official_url" target="_blank" rel="noopener noreferrer" class="btn btn-ghost h-9">
              <FaIcon :icon="['fas', 'link']" class="text-[10px]" />
              Situs Resmi
              <FaIcon :icon="['fas', 'arrow-up-right-from-square']" class="text-[8px]" />
            </a>
          </div>
        </div>
      </article>

      <!-- Two-column: vendors + PDFs -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article class="card overflow-hidden">
          <div class="card-head">
            <div class="flex items-center gap-2.5">
              <span class="num-display text-[10.5px] tracking-[0.18em] text-ink-mute font-bold">EXP-VND</span>
              <span class="label">Vendor Terkoleksi</span>
            </div>
            <span class="num-display num-amber text-[14px] font-bold">{{ data.vendor_domains?.length ?? 0 }}</span>
          </div>
          <div v-if="data.vendor_domains?.length" class="max-h-[400px] overflow-y-auto">
            <RouterLink
              v-for="d in data.vendor_domains"
              :key="d"
              :to="`/vendors/${d}`"
              class="flex items-center justify-between gap-2 px-5 py-2.5 rule-b last:border-b-0 hover:bg-surface-2/50 group transition-colors"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <FaIcon :icon="['fas', 'building']" class="text-[12px] text-ink-mute group-hover:text-amber transition-colors shrink-0" />
                <span class="num-display text-[12.5px] text-ink truncate group-hover:text-amber transition-colors">{{ d }}</span>
              </div>
              <FaIcon :icon="['fas', 'chevron-right']" class="text-[10px] text-ink-mute opacity-0 group-hover:opacity-100 transition-opacity" />
            </RouterLink>
          </div>
          <div v-else class="card-body py-12 text-center">
            <FaIcon :icon="['fas', 'building']" class="text-[28px] text-ink-mute" />
            <p class="label label-mute mt-3">Belum ada vendor</p>
            <p class="text-[12px] text-ink-mute mt-1">Operasi crawl akan mengisi daftar vendor untuk ekspo ini</p>
          </div>
        </article>

        <article class="card overflow-hidden">
          <div class="card-head">
            <div class="flex items-center gap-2.5">
              <span class="num-display text-[10.5px] tracking-[0.18em] text-ink-mute font-bold">EXP-PDF</span>
              <span class="label">Brosur PDF</span>
            </div>
            <span class="num-display num-amber text-[14px] font-bold">{{ data.pdf_brochure_urls?.length ?? 0 }}</span>
          </div>
          <div v-if="data.pdf_brochure_urls?.length" class="max-h-[400px] overflow-y-auto">
            <a
              v-for="url in data.pdf_brochure_urls"
              :key="url"
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-2.5 px-5 py-2.5 rule-b last:border-b-0 hover:bg-surface-2/50 group transition-colors"
            >
              <FaIcon :icon="['fas', 'file-pdf']" class="text-[12px] text-amber shrink-0" />
              <span class="num-display text-[11.5px] text-ink truncate group-hover:text-amber transition-colors flex-1">{{ url }}</span>
              <FaIcon :icon="['fas', 'arrow-up-right-from-square']" class="text-[9px] text-ink-mute opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>
          <div v-else class="card-body py-12 text-center">
            <FaIcon :icon="['fas', 'file-pdf']" class="text-[28px] text-ink-mute" />
            <p class="label label-mute mt-3">Tidak ada brosur PDF</p>
            <p class="text-[12px] text-ink-mute mt-1">Belum ada brosur PDF terdiscover untuk ekspo ini</p>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>
