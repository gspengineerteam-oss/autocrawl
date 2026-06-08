<script setup lang="ts">
import type { SourceProvenance } from '@/api/types'

defineProps<{ entries: SourceProvenance[] }>()

function iconFor(type: string): { icon: string; color: string } {
  switch (type) {
    case 'pdf':
      return { icon: 'file-pdf', color: 'rgb(var(--crit))' }
    case 'aggregator':
      return { icon: 'globe', color: 'rgb(var(--cyan))' }
    case 'search':
      return { icon: 'magnifying-glass', color: 'rgb(var(--amber))' }
    case 'manual':
      return { icon: 'circle-info', color: 'rgb(var(--ink-mute))' }
    default:
      return { icon: 'circle-nodes', color: 'rgb(var(--ink-mute))' }
  }
}

function labelFor(type: string): string {
  switch (type) {
    case 'pdf':
      return 'BROSUR PDF'
    case 'aggregator':
      return 'AGREGATOR'
    case 'search':
      return 'PENCARIAN'
    case 'manual':
      return 'MANUAL'
    default:
      return type.toUpperCase()
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
</script>

<template>
  <ol class="relative flex flex-col gap-3 border-l border-base-200 pl-5 dark:border-base-700">
    <li v-for="(entry, idx) in entries" :key="idx" class="relative">
      <span
        class="absolute -left-[26px] top-2 flex h-4 w-4 items-center justify-center rounded-full border bg-white dark:bg-base-900"
        :style="{
          borderColor: iconFor(entry.type).color,
          color: iconFor(entry.type).color,
        }"
      >
        <FaIcon :icon="['fas', iconFor(entry.type).icon]" class="text-2xs" />
      </span>

      <div class="hud-panel">
        <div class="flex flex-wrap items-center gap-2 border-b border-base-200 bg-base-50 px-3 py-1.5 dark:border-base-700 dark:bg-base-800">
          <span
            class="font-mono text-2xs font-medium uppercase tracking-ops"
            :style="{ color: iconFor(entry.type).color }"
          >
            {{ labelFor(entry.type) }}
          </span>
          <span
            v-if="entry.extraction_method"
            class="hud-chip"
          >
            {{ entry.extraction_method }}
          </span>
          <span v-if="entry.page" class="hud-chip">
            HAL {{ entry.page }}
          </span>
          <span v-if="entry.position" class="hud-chip">
            POS {{ entry.position }}
          </span>
          <span
            v-if="entry.confidence != null"
            class="hud-pill-accent"
          >
            CONF {{ Math.round(entry.confidence * 100) }}%
          </span>
          <span class="ml-auto font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">
            {{ formatDate(entry.discovered_at) }}
          </span>
        </div>

        <div class="flex flex-col gap-2 p-3">
          <a
            v-if="entry.url"
            :href="entry.url"
            target="_blank"
            rel="noopener noreferrer"
            class="break-all font-mono text-xs text-accent-600 hover:underline dark:text-accent-300"
          >
            {{ entry.url }}
          </a>

          <div
            v-if="entry.pdf_filename"
            class="flex flex-wrap items-center gap-2 text-xs text-base-600 dark:text-base-300"
          >
            <FaIcon :icon="['far', 'file']" class="text-2xs" />
            <span class="font-mono">{{ entry.pdf_filename }}</span>
            <span
              v-if="entry.pdf_sha256"
              class="font-mono text-2xs text-base-400 dark:text-base-500"
            >
              sha256:{{ entry.pdf_sha256.slice(0, 12) }}
            </span>
          </div>

          <p
            v-if="entry.context_snippet"
            class="border border-base-200 bg-base-50 p-2 font-mono text-xs italic text-base-600 dark:border-base-700 dark:bg-base-800 dark:text-base-300"
          >
            {{ entry.context_snippet }}
          </p>
        </div>
      </div>
    </li>
  </ol>
</template>
