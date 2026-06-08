<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import AppShell from '@/layouts/AppShell.vue'
import { useCursorLight } from '@/composables/useCursorLight'

useCursorLight()
</script>

<template>
  <AppShell />

  <!-- Cursor gold tail — fixed dot + halo that follow the pointer. -->
  <div class="cursor-halo" aria-hidden="true" />
  <div class="cursor-dot" aria-hidden="true" />

  <Toaster
    theme="system"
    position="top-right"
    rich-colors
    close-button
    :offset="16"
  />
</template>
