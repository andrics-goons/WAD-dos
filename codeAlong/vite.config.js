import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// The in-browser coding sandbox only starts if the page sends these two security headers.
// Same headers as vercel.json (the live site) — change both together.
const crossOriginIsolation = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  server: { headers: crossOriginIsolation }, // pnpm dev
  preview: { headers: crossOriginIsolation }, // pnpm preview (the production build, locally)
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // code shared by the website and the server functions
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
})
