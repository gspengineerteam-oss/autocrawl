import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
/**
 * Auth store untuk single-operator console. Credentials di-hardcode
 * (single-user self-hosted app). LocalStorage persistence supaya
 * session bertahan refresh.
 *
 * NOTE: ini gate friction-level untuk casual access control. Bukan
 * cryptographic auth (frontend-only validation = bisa dilihat di
 * bundle). Cukup untuk single-user defense intel operator app yang
 * jalan di tailnet privat.
 */
const STORAGE_KEY = 'autocrawl-auth-v1';
const VALID_USERNAME = 'gsp';
const VALID_PASSWORD = 'gsp12#';
function loadPersisted() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.user === 'string' && parsed.user === VALID_USERNAME) {
            return parsed;
        }
        return null;
    }
    catch {
        return null;
    }
}
export const useAuthStore = defineStore('auth', () => {
    const persisted = loadPersisted();
    const user = ref(persisted?.user ?? null);
    const loggedInAt = ref(persisted?.loggedInAt ?? null);
    const isAuthenticated = computed(() => user.value !== null);
    async function login(username, password) {
        // Simulasi network roundtrip kecil supaya loading state terasa nyata,
        // bukan instant snap yang membuat aksi terasa palsu.
        await new Promise((resolve) => setTimeout(resolve, 320));
        const u = (username || '').trim();
        const p = password || '';
        if (u !== VALID_USERNAME || p !== VALID_PASSWORD) {
            return { ok: false, error: 'Kombinasi nama dan kata sandi tidak cocok.' };
        }
        user.value = u;
        loggedInAt.value = Date.now();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: user.value, loggedInAt: loggedInAt.value }));
        }
        catch {
            /* storage unavailable, fall back to in-memory only */
        }
        return { ok: true };
    }
    function logout() {
        user.value = null;
        loggedInAt.value = null;
        try {
            localStorage.removeItem(STORAGE_KEY);
        }
        catch { /* noop */ }
    }
    return { user, loggedInAt, isAuthenticated, login, logout };
});
