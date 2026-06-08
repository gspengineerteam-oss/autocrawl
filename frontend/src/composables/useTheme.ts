import { useStorage } from '@vueuse/core'
import { computed, watchEffect } from 'vue'

type ThemeName = 'paper' | 'ink'

const themeRef = useStorage<ThemeName>('atlas-theme', 'paper', undefined, {
  serializer: {
    read: (v) => (v === 'ink-dark' ? 'ink' : (v as ThemeName)),
    write: (v) => v,
  },
})

if (typeof document !== 'undefined') {
  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', themeRef.value)
  })
}

const isDark = computed({
  get: () => themeRef.value === 'ink',
  set: (v: boolean) => { themeRef.value = v ? 'ink' : 'paper' },
})

function toggleDark() {
  isDark.value = !isDark.value
}

export function useTheme() {
  return { isDark, toggleDark, theme: themeRef }
}
