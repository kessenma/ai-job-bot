import { defineConfig, loadEnv, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Load all env vars from repo root into process.env for server-side code
const env = loadEnv('', '../../', '')
Object.assign(process.env, env)

/**
 * Vite plugin that logs incoming requests during dev.
 * Decodes TanStack server function names from the base64 URL.
 */
function requestLogger(): Plugin {
  return {
    name: 'request-logger',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && !req.url.startsWith('/@') && !req.url.startsWith('/node_modules') && !req.url.startsWith('/src/') && !req.url.includes('?v=')) {
          let logUrl = req.url
          if (logUrl.startsWith('/_serverFn/')) {
            try {
              const decoded = JSON.parse(atob(logUrl.slice('/_serverFn/'.length).replace(/-/g, '+').replace(/_/g, '/')))
              logUrl = `/_serverFn/${decoded.export?.split('_')[0] || decoded.export || logUrl}`
            } catch {}
          }
          console.log(`[${req.method}] ${logUrl}`)
        }
        next()
      })
    },
  }
}

const config = defineConfig({
  envDir: '../../',
  server: {
    watch: {
      ignored: ['**/routeTree.gen.ts'],
    },
    proxy: {
      '/api/pw-stream': {
        target: process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:8084',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pw-stream/, ''),
      },
    },
  },
  ssr: {
    resolve: {
      conditions: ['bun'],
    },
    external: ['bun:sqlite', 'better-sqlite3'],
  },
  resolve: {
    alias: {
      'better-sqlite3': new URL('./src/lib/empty-module.ts', import.meta.url)
        .pathname,
    },
  },
  plugins: [
    devtools(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    requestLogger(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
