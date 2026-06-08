<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

const { isDark, toggleDark } = useTheme()
</script>

<template>
  <button
    class="hud-btn-ghost h-8 w-8 p-0"
    :aria-label="isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'"
    @click="toggleDark()"
  >
    <FaIcon v-if="isDark" :icon="['far', 'sun']" class="text-xs" />
    <FaIcon v-else :icon="['far', 'moon']" class="text-xs" />
  </button>
</template>
