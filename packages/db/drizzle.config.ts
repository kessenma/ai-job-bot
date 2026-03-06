import { defineConfig } from 'drizzle-kit'
import { resolve } from 'node:path'

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolve(dataDir, 'job-app-bot.db'),
  },
})
