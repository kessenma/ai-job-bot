import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Load all env vars from repo root into process.env for server-side code
const env = loadEnv('', '../../', '')
Object.assign(process.env, env)

const config = defineConfig({
  envDir: '../../',
  server: {
    watch: {
      ignored: ['**/routeTree.gen.ts'],
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
    tanstackStart(),
    viteReact(),
  ],
})

export default config
