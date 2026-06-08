<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import GlobeBackdrop from '@/components/GlobeBackdrop.vue'

/**
 * Login — globe-anchored editorial console access.
 *
 * Struktural focal: rotating globe (Lottie sphere) di tengah kiri,
 * cinema-scale wordmark overlay sebagian, vertical stencil di tepi.
 * Auth panel di kanan minim 34%, dossier-minor treatment.
 *
 * Gold = locked accent <=10% screen, terkonsentrasi di wordmark + ring
 * pada submit button hover. Globe di-overlay tint warm via blend mode.
 */

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)
const shake = ref(false)
const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

const dateStamp = computed(() => {
  const d = new Date(now.value)
  const dd = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const yr = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return { date: `${dd}.${mo}.${yr}`, time: `${hh}:${mi}:${ss}` }
})

async function handleSubmit() {
  if (submitting.value) return
  error.value = null
  submitting.value = true
  const result = await auth.login(username.value, password.value)
  submitting.value = false
  if (!result.ok) {
    error.value = result.error ?? 'Kombinasi nama dan kata sandi tidak cocok.'
    shake.value = false
    requestAnimationFrame(() => { shake.value = true })
    setTimeout(() => { shake.value = false }, 380)
    return
  }
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.replace(redirect)
}

onMounted(() => {
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
  if (auth.isAuthenticated) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  }
})
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <div class="login">
    <!-- LEFT — Globe-anchored editorial canvas -->
    <section class="login__canvas">
      <!-- Vertical stencil far-left edge -->
      <div class="login__stencil" aria-hidden="true">
        AUTOCRAWL &middot; OPERATOR CONSOLE &middot; ACCESS GATE &middot; 24/7 &middot; GLOBAL EXHIBITOR INTELLIGENCE
      </div>

      <header class="login__header">
        <span class="label label-mute">// CONSOLE ACCESS</span>
        <div class="login__stamp num">
          <span>{{ dateStamp.date }}</span>
          <span class="login__stamp-sep">·</span>
          <span>{{ dateStamp.time }}</span>
        </div>
      </header>

      <!-- Globe — the visual focal, rotating slow continuous -->
      <div class="login__globe-stage" aria-hidden="true">
        <GlobeBackdrop class="login__globe" :speed="0.45" />
        <div class="login__globe-veil" />
        <div class="login__globe-tint" />
      </div>

      <!-- Wordmark overlays the globe lower-center, breaks visual grid -->
      <div class="login__wordmark-wrap">
        <span class="label label-mute login__caption">// PINTU MASUK</span>
        <h1 class="login__wordmark">AUTOCRAWL</h1>
        <p class="login__tagline">
          Pusat komando crawler 24 jam, vendor intelijen, dossier ekspo global.
        </p>
      </div>

      <!-- Quiet corner mark -->
      <div class="login__corner-pair">
        <span class="login__corner-mark">01 / 01</span>
        <span class="login__corner-mark login__corner-mark--mute">TAILNET</span>
      </div>
    </section>

    <!-- RIGHT — Auth panel -->
    <aside class="login__panel" :class="{ 'is-shaking': shake }">
      <div class="login__panel-head">
        <span class="label label-mute">// 01 &middot; IDENTIFIKASI</span>
        <h2 class="login__panel-title">Masuk ke console</h2>
        <p class="login__panel-sub">
          Operator harus terverifikasi sebelum konsol dapat diakses.
        </p>
      </div>

      <form class="login__form" @submit.prevent="handleSubmit" novalidate>
        <label class="login__field">
          <span class="label label-mute">Nama operator</span>
          <input
            v-model="username"
            type="text"
            name="username"
            autocomplete="username"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            class="login__input login__input--mono"
            :disabled="submitting"
            required
          />
        </label>

        <label class="login__field">
          <span class="label label-mute">Kata sandi</span>
          <input
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            class="login__input login__input--mono"
            :disabled="submitting"
            required
          />
        </label>

        <div v-if="error" class="login__error" role="alert">
          <span class="login__error-mark" aria-hidden="true">!</span>
          <span>{{ error }}</span>
        </div>

        <button
          type="submit"
          class="login__submit"
          :disabled="submitting || !username || !password"
        >
          <span v-if="!submitting" class="login__submit-label">Masuk</span>
          <span v-else class="login__submit-label">Memverifikasi</span>
          <span class="login__submit-icon" aria-hidden="true">
            <svg v-if="!submitting" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7h8M7 3l4 4-4 4" />
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" class="login__spinner">
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="22" stroke-dashoffset="14" stroke-linecap="round" />
            </svg>
          </span>
        </button>
      </form>

      <div class="login__panel-foot">
        <div class="login__rule" />
        <div class="login__foot-row">
          <span class="label label-mute">SESI</span>
          <span class="num">DURASI TAK TERBATAS</span>
        </div>
        <div class="login__foot-row">
          <span class="label label-mute">JARINGAN</span>
          <span class="num">TAILNET PRIVAT</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.login {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: 66fr 34fr;
  background: rgb(var(--bg));
  color: rgb(var(--ink));
  font-family: 'Hanken Grotesk Variable', 'Hanken Grotesk', system-ui, sans-serif;
  overflow: hidden;
}

/* ============ LEFT — Globe-anchored canvas ============ */
.login__canvas {
  position: relative;
  padding: 32px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: rgb(var(--bg));
  overflow: hidden;
}

.login__header {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.login__stamp {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  color: rgb(var(--ink-mute));
  font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
  font-feature-settings: 'tnum' on, 'zero' on, 'ss19' on;
  font-variant-numeric: tabular-nums;
}
.login__stamp-sep { opacity: 0.4; }

.login__stencil {
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%) rotate(-90deg);
  transform-origin: left center;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.42em;
  color: rgb(var(--ink-mute) / 0.55);
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  z-index: 5;
  animation: login-stencil-in 700ms cubic-bezier(0.22, 1, 0.36, 1) 240ms both;
}
@keyframes login-stencil-in {
  from { opacity: 0; transform: translateY(-50%) rotate(-90deg) translateX(-8px); }
  to   { opacity: 0.55; transform: translateY(-50%) rotate(-90deg); }
}

/* GLOBE STAGE — absolute, oversized, cropped at edges for cinema feel */
.login__globe-stage {
  position: absolute;
  /* Center the globe horizontally with slight bias left of zone center. */
  top: 50%;
  left: 50%;
  transform: translate(-52%, -50%);
  width: min(78vh, 720px);
  height: min(78vh, 720px);
  z-index: 1;
  animation: login-globe-in 900ms cubic-bezier(0.22, 1, 0.36, 1) 60ms both;
  will-change: transform, opacity;
}
@keyframes login-globe-in {
  from { opacity: 0; transform: translate(-52%, -50%) scale(0.92); }
  to   { opacity: 1; transform: translate(-52%, -50%) scale(1); }
}

.login__globe {
  position: absolute;
  inset: 0;
  /* Mix-blend supaya globe terintegrasi dengan paper bg, lalu tint gold
     via overlay layer di bawahnya. */
  mix-blend-mode: multiply;
  opacity: 0.92;
}
:root[data-theme='ink'] .login__globe,
:root[data-theme='ink-dark'] .login__globe {
  mix-blend-mode: screen;
  opacity: 0.82;
}

/* Gold tint overlay -- gives the globe brand identity without changing JSON */
.login__globe-tint {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    60% 60% at 50% 50%,
    rgb(var(--accent) / 0.18) 0%,
    rgb(var(--accent) / 0.06) 45%,
    transparent 72%
  );
  mix-blend-mode: multiply;
  pointer-events: none;
}
:root[data-theme='ink'] .login__globe-tint,
:root[data-theme='ink-dark'] .login__globe-tint {
  mix-blend-mode: screen;
  background: radial-gradient(
    60% 60% at 50% 50%,
    rgb(var(--accent) / 0.32) 0%,
    rgb(var(--accent) / 0.10) 45%,
    transparent 72%
  );
}

/* Soft veil mask -- fade globe at edges supaya merge ke background */
.login__globe-veil {
  position: absolute;
  inset: -10%;
  background: radial-gradient(
    closest-side at 50% 50%,
    transparent 55%,
    rgb(var(--bg) / 0.6) 78%,
    rgb(var(--bg)) 100%
  );
  pointer-events: none;
}

/* WORDMARK — overlays the globe, anchored bottom-left of grid row 3 */
.login__wordmark-wrap {
  position: relative;
  z-index: 4;
  grid-row: 3;
  align-self: end;
  max-width: 92%;
  padding-left: 48px;
  padding-bottom: 8px;
  animation: login-wordmark-in 620ms cubic-bezier(0.22, 1, 0.36, 1) 220ms both;
}
@keyframes login-wordmark-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
.login__caption { display: block; margin-bottom: 14px; }
.login__wordmark {
  font-family: 'Geist Variable', 'Geist', system-ui, sans-serif;
  font-weight: 700;
  font-size: clamp(4.6rem, 10.5vw, 9.5rem);
  line-height: 0.9;
  letter-spacing: -0.045em;
  color: rgb(var(--accent));
  margin: 0;
  padding-inline: 0 0.05em;
  /* The one accent on screen, solid no gradient. */
}
.login__tagline {
  max-width: 50ch;
  margin: 18px 0 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: rgb(var(--ink-2));
}

.login__corner-pair {
  position: absolute;
  right: 32px;
  bottom: 28px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  z-index: 5;
}
.login__corner-mark {
  font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: rgb(var(--ink-mute));
  font-variant-numeric: tabular-nums;
}
.login__corner-mark--mute { color: rgb(var(--ink-mute) / 0.55); font-size: 9.5px; }

/* ============ RIGHT — Auth panel ============ */
.login__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 48px 48px;
  background: rgb(var(--surface));
  border-left: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  animation: login-panel-in 520ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
  z-index: 10;
}
@keyframes login-panel-in {
  from { opacity: 0; transform: translateX(14px); }
  to   { opacity: 1; transform: translateX(0); }
}
.login__panel.is-shaking { animation: login-shake 360ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
@keyframes login-shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-7px); }
  40%, 60% { transform: translateX(7px); }
}
@media (prefers-reduced-motion: reduce) {
  .login__panel, .login__panel.is-shaking,
  .login__stencil, .login__wordmark-wrap, .login__globe-stage { animation: none; }
}

.login__panel-head { margin-bottom: 32px; }
.login__panel-title {
  margin: 12px 0 8px;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.014em;
  line-height: 1.15;
  color: rgb(var(--ink));
}
.login__panel-sub {
  margin: 0;
  max-width: 38ch;
  font-size: 13px;
  line-height: 1.55;
  color: rgb(var(--ink-mute));
}

.login__form { display: flex; flex-direction: column; gap: 18px; }
.login__field { display: flex; flex-direction: column; gap: 8px; }
.login__field > .label { padding-left: 2px; }

.login__input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  background: rgb(var(--surface-2));
  border: 1px solid rgb(var(--rule) / var(--rule-alpha));
  border-radius: 6px;
  color: rgb(var(--ink));
  font-size: 15px;
  line-height: 1.2;
  outline: none;
  transition:
    border-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow   180ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.login__input--mono {
  font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
  font-feature-settings: 'tnum' on, 'zero' on, 'ss19' on;
  font-size: 14px;
  letter-spacing: -0.005em;
}
.login__input:hover { background: rgb(var(--surface-3)); }
.login__input:focus-visible {
  border-color: rgb(var(--accent) / 0.85);
  box-shadow:
    0 0 0 1px rgb(var(--accent) / 0.40),
    0 0 0 4px rgb(var(--accent) / 0.10);
}
.login__input:disabled { opacity: 0.45; cursor: not-allowed; }

.login__error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgb(var(--crit) / 0.06);
  border: 1px solid rgb(var(--crit) / 0.30);
  border-radius: 6px;
  color: rgb(var(--crit));
  font-size: 12px;
  line-height: 1.4;
}
.login__error-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px; height: 18px; flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid rgb(var(--crit) / 0.60);
  font-weight: 700;
  font-size: 11px;
  line-height: 1;
}

.login__submit {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 46px;
  padding: 0 18px;
  background: rgb(var(--ink));
  color: rgb(var(--bg));
  border: 1px solid rgb(var(--ink));
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  transition:
    background-color 200ms cubic-bezier(0.22, 1, 0.36, 1),
    color            200ms cubic-bezier(0.22, 1, 0.36, 1),
    transform        160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.login__submit:hover:not(:disabled) {
  background: rgb(var(--accent));
  border-color: rgb(var(--accent));
  color: rgb(var(--bg));
}
.login__submit:active:not(:disabled) { transform: scale(0.985); }
.login__submit:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 1px rgb(var(--bg)),
    0 0 0 3px rgb(var(--accent) / 0.55);
}
.login__submit:disabled { opacity: 0.45; cursor: not-allowed; }
.login__submit-icon { display: inline-flex; }
.login__spinner {
  animation: login-spin 800ms linear infinite;
  will-change: transform;
}
@keyframes login-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .login__spinner { animation-duration: 2400ms; }
}

.login__panel-foot { margin-top: auto; padding-top: 24px; }
.login__rule {
  height: 1px;
  background: rgb(var(--rule) / var(--rule-alpha));
  margin-bottom: 14px;
}
.login__foot-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 0;
  font-size: 11px;
  color: rgb(var(--ink-mute));
}
.login__foot-row .num {
  font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
  font-feature-settings: 'tnum' on, 'zero' on, 'ss19' on;
  font-size: 10.5px;
  letter-spacing: 0.08em;
}

/* ============ RESPONSIVE ============ */
@media (max-width: 860px) {
  .login {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .login__canvas { padding: 22px 22px 28px; min-height: 42vh; }
  .login__stencil { display: none; }
  .login__globe-stage { width: 88vw; height: 88vw; }
  .login__wordmark-wrap { padding-left: 0; }
  .login__panel {
    padding: 32px 24px;
    border-left: none;
    border-top: 1px solid rgb(var(--rule) / var(--rule-strong-alpha));
  }
  .login__corner-pair { display: none; }
}
</style>
