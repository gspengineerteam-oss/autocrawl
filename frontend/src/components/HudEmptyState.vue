<script setup lang="ts">
withDefaults(
  defineProps<{
    icon?: string
    title: string
    hint?: string
  }>(),
  { icon: 'circle-info' },
)
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 p-8 text-center">
    <FaIcon :icon="['fas', icon]" class="text-3xl text-base-300 dark:text-base-600" />
    <div class="font-mono text-2xs uppercase tracking-ops text-base-500 dark:text-base-400">
      {{ title }}
    </div>
    <div v-if="hint" class="max-w-md text-xs text-base-500 dark:text-base-400">
      {{ hint }}
    </div>
  </div>
</template>
