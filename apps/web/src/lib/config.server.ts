import { db, schema } from '@job-app-bot/db'
import { eq } from 'drizzle-orm'

export async function getConfigValue(key: string): Promise<string | null> {
  const row = await db
    .select()
    .from(schema.appConfig)
    .where(eq(schema.appConfig.key, key))
    .limit(1)
  return row[0]?.value ?? null
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await db
    .insert(schema.appConfig)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: schema.appConfig.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
}

export async function setConfigBatch(entries: { key: string; value: string }[]): Promise<void> {
  for (const { key, value } of entries) {
    await setConfigValue(key, value)
  }
}

export async function deleteConfigValue(key: string): Promise<void> {
  await db.delete(schema.appConfig).where(eq(schema.appConfig.key, key))
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await db.select().from(schema.appConfig)
  const config: Record<string, string> = {}
  for (const row of rows) {
    config[row.key] = row.value
  }
  return config
}
