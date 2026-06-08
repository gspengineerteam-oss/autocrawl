<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'

/**
 * Shared operator-dark page header. Sits at the top of every non-overview
 * page providing a consistent identity: route code chip, title, optional
 * subtitle/count, and a slot for actions on the right.
 *
 * Visual: hairline-bordered band, amber route code, large Hanken title,
 * compact stat chips (passed via `stats` prop), action buttons in slot.
 */

defineProps<{
  title: string
  subtitle?: string
  code?: string
  stats?: Array<{ label: string; value: string | number; tone?: 'amber' | 'ok' | 'warn' | 'crit' | 'mute' }>
}>()

const route = useRoute()
const fallbackCode = computed(() => {
  const path = route.path
  if (path.startsWith('/vendors')) return 'VND'
  if (path.startsWith('/expos')) return 'EXP'
  if (path.startsWith('/pdfs')) return 'BR'
  if (path.startsWith('/runs')) return 'RW'
  if (path.startsWith('/diagnostik')) return 'DG'
  if (path.startsWith('/orkestrator')) return 'OR'
  if (path.startsWith('/konfigurasi')) return 'KF'
  if (path.startsWith('/labs')) return 'LB'
  return '—'
})
</script>

<template>
  <header class="page-header rule-b bg-bg flex items-end gap-6 px-6 pt-5 pb-4">
    <!-- Route code chip + title -->
    <div class="flex flex-col gap-2 min-w-0">
      <div class="flex items-center gap-2.5">
        <span class="dot dot-amber dot-glow"></span>
        <span class="font-mono text-[10.5px] font-bold tracking-[0.20em] text-amber">
          / {{ code ?? fallbackCode }} · {{ route.path }}
        </span>
      </div>
      <h1 class="text-[28px] font-bold tracking-[-0.02em] text-ink leading-[1] truncate">
        {{ title }}
      </h1>
      <p v-if="subtitle" class="text-[12.5px] text-ink-2 truncate">{{ subtitle }}</p>
    </div>

    <!-- Stat chips -->
    <div v-if="stats?.length" class="flex items-stretch gap-0 ml-auto rule rounded-[6px] overflow-hidden">
      <div
        v-for="(s, i) in stats"
        :key="i"
        class="flex flex-col px-4 py-2 min-w-[100px]"
        :class="i > 0 ? 'rule-l' : ''"
      >
        <span class="label label-mute">{{ s.label }}</span>
        <span
          class="num-display text-[18px] font-semibold mt-1 tabular-nums"
          :class="{
            'num-amber': !s.tone || s.tone === 'amber',
            'text-ok':   s.tone === 'ok',
            'text-warn': s.tone === 'warn',
            'text-crit': s.tone === 'crit',
            'text-ink-mute': s.tone === 'mute',
          }"
        >
          {{ s.value }}
        </span>
      </div>
    </div>

    <!-- Right-aligned actions (slot) -->
    <div class="flex items-center gap-2 shrink-0" :class="!$slots.actions ? 'hidden' : ''">
      <slot name="actions" />
    </div>
  </header>
</template>
