<script setup lang="ts">
defineProps<{
  title?: string
  code?: string
  accent?: boolean
}>()
</script>

<template>
  <section
    :class="[
      'hud-panel relative flex flex-col',
      accent ? 'shadow-hud' : '',
    ]"
  >
    <header v-if="title || code || $slots.actions" class="hud-panel-head">
      <div class="flex items-center gap-2">
        <span v-if="code" class="font-mono text-2xs uppercase tracking-ops text-base-400 dark:text-base-500">
          {{ code }}
        </span>
        <h2 v-if="title" class="hud-panel-title">{{ title }}</h2>
      </div>
      <div class="flex items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <div class="hud-panel-body flex-1">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="border-t border-base-200 px-3 py-2 dark:border-base-700">
      <slot name="footer" />
    </footer>
  </section>
</template>
