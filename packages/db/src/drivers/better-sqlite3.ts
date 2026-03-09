import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as schema from '../schema.ts'

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

const dbPath = resolve(dataDir, 'job-app-bot.db')
const sqlite = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })
export { schema }
export { dbPath }
