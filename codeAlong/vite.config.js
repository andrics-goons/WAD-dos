import { fileURLToPath, URL } from 'node:url'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

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

// Popped out previews open /webcontainer/connect/<id> to find their project (see connect.html).
// That page has to skip the isolation headers above, but Vite adds server.headers to every
// html it sends, so this middleware answers those requests itself before Vite gets to them.
// - The SAME exception is set for production in vercel.json.
const CONNECT_PATH = '/webcontainer/connect/'

function webcontainerConnect() {
  const serveConnectPage = (htmlFile, transform) => async (req, res, next) => {
    if (!req.url?.startsWith(CONNECT_PATH)) return next()
    try {
      const html = await readFile(htmlFile(), 'utf-8')
      res.setHeader('Content-Type', 'text/html')
      res.end(transform ? await transform(req, html) : html)
    } catch (e) {
      next(e)
    }
  }

  return {
    name: 'webcontainer-connect',
    // pnpm dev: serve the source connect.html, run through Vite so its script gets bundled
    configureServer(server) {
      server.middlewares.use(
        serveConnectPage(
          () => path.resolve(server.config.root, 'connect.html'),
          (req, html) => server.transformIndexHtml(req.url, html, req.originalUrl),
        ),
      )
    },
    // pnpm preview: serve the built connect.html
    configurePreviewServer(server) {
      server.middlewares.use(
        serveConnectPage(() =>
          path.resolve(server.config.root, server.config.build.outDir, 'connect.html'),
        ),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), webcontainerConnect()],
  build: {
    rolldownOptions: {
      // connect.html is a second page, so it has to be listed for the build to output it
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        connect: fileURLToPath(new URL('./connect.html', import.meta.url)),
      },
    },
  },
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
