#!/usr/bin/env node

/**
 * Migration Sync Checker
 *
 * Compares table names defined in schema.ts against all migration files
 * and reports any tables that are missing from specific files.
 *
 * Usage: node scripts/migrate-check.mjs
 *
 * See docs/database/migration-rules.md for the full checklist.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dbSrc = resolve(root, 'packages/db/src')

// Files to check
const files = {
  'schema.ts': resolve(dbSrc, 'schema.ts'),
  'schema-pg.ts': resolve(dbSrc, 'schema-pg.ts'),
  'drivers/bun-sqlite.ts': resolve(dbSrc, 'drivers/bun-sqlite.ts'),
  'migrate.ts': resolve(dbSrc, 'migrate.ts'),
  'migrate-pg.ts': resolve(dbSrc, 'migrate-pg.ts'),
}

// Extract table names from schema files (sqliteTable('name', ...) or pgTable('name', ...))
function extractSchemaTables(content) {
  const matches = [...content.matchAll(/(?:sqliteTable|pgTable)\s*\(\s*['"](\w+)['"]/g)]
  return matches.map((m) => m[1])
}

// Extract table names from SQL migration files (CREATE TABLE IF NOT EXISTS name)
function extractSqlTables(content) {
  const matches = [...content.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi)]
  return matches.map((m) => m[1])
}

// Read all files
const contents = {}
for (const [name, path] of Object.entries(files)) {
  try {
    contents[name] = readFileSync(path, 'utf-8')
  } catch {
    console.error(`  MISSING FILE: ${path}`)
    process.exit(1)
  }
}

// Get the canonical table list from schema.ts
const schemaTables = extractSchemaTables(contents['schema.ts'])
const schemaSet = new Set(schemaTables)

console.log(`\nFound ${schemaTables.length} tables in schema.ts:\n  ${schemaTables.join(', ')}\n`)

let hasErrors = false

// Check schema-pg.ts
const pgSchemaTables = new Set(extractSchemaTables(contents['schema-pg.ts']))
const missingFromPgSchema = schemaTables.filter((t) => !pgSchemaTables.has(t))
if (missingFromPgSchema.length > 0) {
  console.log(`MISSING from schema-pg.ts (${missingFromPgSchema.length}):`)
  missingFromPgSchema.forEach((t) => console.log(`  - ${t}`))
  console.log()
  hasErrors = true
}

// Check SQL migration files
for (const fileName of ['drivers/bun-sqlite.ts', 'migrate.ts', 'migrate-pg.ts']) {
  const sqlTables = new Set(extractSqlTables(contents[fileName]))
  const missing = schemaTables.filter((t) => !sqlTables.has(t))
  if (missing.length > 0) {
    console.log(`MISSING from ${fileName} (${missing.length}):`)
    missing.forEach((t) => console.log(`  - ${t}`))
    console.log()
    hasErrors = true
  }
}

if (hasErrors) {
  console.log('Some tables are not defined in all migration files.')
  console.log('See docs/database/migration-rules.md for how to fix this.\n')
  process.exit(1)
} else {
  console.log('All tables are present in all migration files.\n')
}
