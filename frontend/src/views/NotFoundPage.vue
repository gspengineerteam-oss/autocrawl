<script setup lang="ts">
import { useRoute, RouterLink } from 'vue-router'

const route = useRoute()
</script>

<template>
  <section class="flex h-full flex-col items-center justify-center gap-8 px-8 py-16">
    <!-- Glitchy 404 hex -->
    <div class="relative">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <defs>
          <radialGradient id="nf-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgb(255 184 64)" stop-opacity="0.55"/>
            <stop offset="60%" stop-color="rgb(255 184 64)" stop-opacity="0.10"/>
            <stop offset="100%" stop-color="rgb(255 184 64)" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <!-- Ambient glow background -->
        <circle cx="90" cy="90" r="80" fill="url(#nf-glow)"/>
        <!-- Hex outline -->
        <polygon points="90,18 150,52 150,128 90,162 30,128 30,52"
                 fill="none" stroke="rgb(255 184 64)" stroke-width="1.5" stroke-opacity="0.45"/>
        <polygon points="90,30 138,58 138,122 90,150 42,122 42,58"
                 fill="none" stroke="rgb(255 184 64)" stroke-width="0.8" stroke-opacity="0.20" stroke-dasharray="3 4"/>
        <!-- 404 text -->
        <text x="90" y="100" text-anchor="middle"
              font-family="Geist Mono Variable, monospace"
              font-weight="800" font-size="44"
              fill="rgb(255 184 64)" style="letter-spacing:-0.04em">404</text>
      </svg>
    </div>

    <div class="flex flex-col items-center gap-3 text-center">
      <span class="label label-amber">SIGNAL LOST</span>
      <h1 class="text-[34px] font-bold tracking-[-0.02em] text-ink leading-[1]">
        Tersesat dari peta
      </h1>
      <p class="num-display text-[12px] text-ink-mute">PATH · {{ route.fullPath }}</p>
      <p class="max-w-md text-[13.5px] text-ink-2 mt-2">
        Halaman ini tidak terdaftar di indeks Autocrawl.
        Kembali ke pusat komando atau telusuri bagian melalui sidebar.
      </p>
    </div>

    <RouterLink to="/" class="btn btn-amber h-10 px-5">
      <FaIcon :icon="['fas', 'gauge-high']" class="text-[11px]" />
      Kembali ke Pusat Komando
    </RouterLink>
  </section>
</template>
