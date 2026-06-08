import { useStorage } from '@vueuse/core';
import { computed, watchEffect } from 'vue';
const themeRef = useStorage('atlas-theme', 'paper', undefined, {
    serializer: {
        read: (v) => (v === 'ink-dark' ? 'ink' : v),
        write: (v) => v,
    },
});
if (typeof document !== 'undefined') {
    watchEffect(() => {
        document.documentElement.setAttribute('data-theme', themeRef.value);
    });
}
const isDark = computed({
    get: () => themeRef.value === 'ink',
    set: (v) => { themeRef.value = v ? 'ink' : 'paper'; },
});
function toggleDark() {
    isDark.value = !isDark.value;
}
export function useTheme() {
    return { isDark, toggleDark, theme: themeRef };
}
