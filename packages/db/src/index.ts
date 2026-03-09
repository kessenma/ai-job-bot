// Default: bun:sqlite (self-hosted, no external DB needed)
// Optional: set DATABASE_URL to use PostgreSQL instead
export { db, schema, dbPath } from './drivers/bun-sqlite.ts'
