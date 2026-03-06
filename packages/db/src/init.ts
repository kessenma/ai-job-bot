import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { runMigrations } from './migrate.ts'

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const dbPath = resolve(dataDir, 'job-app-bot.db')

let initialized = false

export function ensureDb() {
  if (initialized) return
  if (!existsSync(dbPath)) {
    console.log('First run — creating database...')
  }
  runMigrations()
  initialized = true
}
