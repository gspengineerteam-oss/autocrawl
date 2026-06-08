import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
  /* @novnc/novnc 1.7.x ships top-level await in core/util/browser.js
   * (WebCodecs feature detection). Default Vite dep-scan target is
   * 'es2020' which doesn't allow it. Bumping deps target to 'es2022'
   * matches our build target and keeps the optimizer happy. */
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
})
