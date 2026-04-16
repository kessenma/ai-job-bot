#!/usr/bin/env node
import { readdirSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Find all job-app-bot.db* files anywhere in the project
const result = execSync(`find ${ROOT} -name "job-app-bot.db*" -not -path "*/node_modules/*"`, {
  encoding: 'utf-8',
}).trim()

const files = result ? result.split('\n').filter(Boolean) : []

if (files.length === 0) {
  console.log('No database files found. Already clean.')
  process.exit(0)
}

console.log(`Found ${files.length} database file(s):`)
files.forEach((f) => console.log(`  ${f.replace(ROOT + '/', '')}`))

for (const file of files) {
  try {
    unlinkSync(file)
  } catch (err) {
    console.error(`  Failed to delete ${file}: ${err.message}`)
  }
}

console.log(`\nDeleted ${files.length} file(s). Restart your dev server for a fresh database.`)
