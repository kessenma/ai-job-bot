let initialized = false

export async function ensureDb() {
  if (initialized) return
  initialized = true

  if (process.env.DATABASE_URL) {
    const { runMigrations } = await import('./migrate-pg.ts')
    await runMigrations()
  } else {
    const { runMigrations } = await import('./migrate.ts')
    runMigrations()
  }
}
