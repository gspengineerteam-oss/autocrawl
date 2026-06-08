<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Sidebar from '@/components/shell/Sidebar.vue'
import Topbar from '@/components/shell/Topbar.vue'
import KpiBand from '@/components/shell/KpiBand.vue'
import Footer from '@/components/shell/Footer.vue'
import EnrichProgressDisc from '@/components/EnrichProgressDisc.vue'
import EnrichSuccessToasts from '@/components/EnrichSuccessToasts.vue'

const route = useRoute()
/* KPI band is intentionally suppressed on the Atlas hero (route '/') —
 * the refined-cinematic hero owns its own headline figures and any
 * extra band above would steal vertical room from the map canvas. */
const showKpi = computed(() => false && route.path === '/')

/* Routes can opt out of the shell entirely by setting `meta.bare = true`.
 * Used for fullscreen / kiosk-like views (e.g. single-channel VNC) that
 * should fill the entire viewport without sidebar / topbar / footer. */
const bare = computed(() => Boolean(route.meta?.bare))
</script>

<template>
  <!-- Bare mode: just the route, no shell -->
  <RouterView v-if="bare" v-slot="{ Component }">
    <Transition name="op-fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>

  <!-- Standard shell -->
  <div v-else class="flex h-full bg-bg text-ink">
    <Sidebar />
    <div class="flex flex-1 flex-col overflow-hidden">
      <Topbar />
      <KpiBand v-if="showKpi" />
      <main class="relative flex-1 overflow-y-auto bg-bg">
        <RouterView v-slot="{ Component }">
          <Transition name="op-fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
      <Footer />
    </div>
    <EnrichProgressDisc />
    <EnrichSuccessToasts />
  </div>
</template>

<style scoped>
.op-fade-enter-active,
.op-fade-leave-active {
  transition: opacity 160ms cubic-bezier(0.20, 0.60, 0.20, 1),
              transform 160ms cubic-bezier(0.20, 0.60, 0.20, 1);
}
.op-fade-enter-from,
.op-fade-leave-to { opacity: 0; transform: translateY(4px); }
</style>
