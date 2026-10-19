import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// Cross-origin isolation. The student workspace runs projects in a StackBlitz
// WebContainer, which needs SharedArrayBuffer, which the browser only allows on a
// cross-origin-isolated page. Without these two headers the workspace can't boot.
// - credentialless (not require-corp): require-corp would also demand a CORP header
//   on every cross-origin file, which breaks CDN assets.
// - The SAME headers are set for production in vercel.json — keep the two in sync.
// See design-docs/02-tech-stack.md "Deployment".
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
      // shared/ is imported by both the Vue app and the Edge Functions (see design-docs/09 §1)
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },

  // ESSENTIAL FOR WEBCONTAINER TO RUN, needs SharedArrayBuffer
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
