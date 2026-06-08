<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import PageHeader from '@/components/shell/PageHeader.vue'
import GeoAvatar from '@/components/GeoAvatar.vue'

const { data, isLoading } = useQuery({
  queryKey: ['pdfs'],
  queryFn: () => api.pdfs(),
  refetchInterval: 30000,
  refetchOnWindowFocus: true,
})

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? items.value.length)
const totalSize = computed(() => items.value.reduce((s, p) => s + (p.size_bytes ?? 0), 0))
const totalVendors = computed(() => items.value.reduce((s, p) => s + (p.vendors_found ?? 0), 0))

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const stats = computed(() => [
  { label: 'Berkas', value: total.value, tone: 'amber' as const },
  { label: 'Vendor', value: totalVendors.value, tone: 'mute' as const },
  { label: 'Ukuran', value: formatBytes(totalSize.value), tone: 'mute' as const },
])
</script>

<template>
  <div class="flex flex-col">
    <PageHeader
      title="PDF Brochure Archive"
      subtitle="Brosur ekspo terkumpul + dedupe via SHA256 — sumber primer untuk discovery vendor"
      :stats="stats"
    />

    <div class="rule-b bg-bg flex items-center px-6 py-2.5">
      <span class="label">Indeks Brosur</span>
      <span v-if="isLoading" class="ml-auto label label-amber flex items-center gap-1.5">
        <span class="dot dot-amber pulse-amber"></span>Memuat…
      </span>
      <span v-else class="ml-auto label label-mute">Live · 30s</span>
    </div>

    <div class="flex-1 overflow-auto">
      <table v-if="items.length > 0" class="ledger w-full">
        <thead>
          <tr>
            <th class="w-[35%]">Berkas</th>
            <th class="w-[20%]">Ekspo</th>
            <th class="w-[10%] text-right">Halaman</th>
            <th class="w-[10%] text-right">Vendor</th>
            <th class="w-[10%] text-right">Ukuran</th>
            <th class="w-[15%]">SHA256</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.sha256">
            <td>
              <a
                :href="row.source_url"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-3 group"
              >
                <span
                  class="pdf-row__avatar"
                  :data-elite="(row.vendors_found ?? 0) >= 50 ? 'true' : 'false'"
                  data-elite-style="inset"
                >
                  <GeoAvatar :seed="row.sha256" :fallback="row.filename" :size="36" />
                </span>
                <span class="text-[13px] text-ink truncate group-hover:text-amber transition-colors">{{ row.filename }}</span>
              </a>
            </td>
            <td>
              <RouterLink
                :to="`/expos/${row.expo_id}`"
                class="num-display text-[11px] text-ink-2 hover:text-amber transition-colors truncate block"
              >
                {{ row.expo_id }}
              </RouterLink>
            </td>
            <td class="text-right">
              <span class="num-display text-[12.5px]">{{ row.page_count }}</span>
            </td>
            <td class="text-right">
              <span class="num-display num-amber text-[14px] font-semibold">{{ row.vendors_found }}</span>
            </td>
            <td class="text-right">
              <span class="num-display text-[11.5px]">{{ formatBytes(row.size_bytes) }}</span>
            </td>
            <td>
              <span class="num-display text-[10.5px] text-ink-mute">{{ row.sha256.slice(0, 16) }}…</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
        <FaIcon :icon="['fas', 'file-pdf']" class="text-[28px] text-ink-mute" />
        <span class="label label-mute">Belum ada brosur PDF</span>
        <span class="text-[12px] text-ink-mute">Crawl operation akan auto-deduplicate via SHA256</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-row__avatar {
  position: relative;
  display: inline-flex;
  width: 36px;
  height: 36px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
}
</style>
