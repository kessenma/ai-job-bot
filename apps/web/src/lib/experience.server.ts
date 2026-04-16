import { db, schema } from '@job-app-bot/db'
import { eq, asc } from 'drizzle-orm'

export type ExperienceCategory = 'work' | 'education' | 'publication' | 'project'

export interface ExperienceEntry {
  id?: number
  category: ExperienceCategory
  company: string
  role: string
  startDate: string | null
  endDate: string | null
  description: string
  skills: string[]
  sortOrder?: number
}

export async function listExperienceEntries(): Promise<ExperienceEntry[]> {
  const rows = await db
    .select()
    .from(schema.experienceEntries)
    .orderBy(asc(schema.experienceEntries.sortOrder))

  return rows.map((r) => ({
    id: r.id,
    category: (r.category ?? 'work') as ExperienceCategory,
    company: r.company,
    role: r.role,
    startDate: r.startDate,
    endDate: r.endDate,
    description: r.description,
    skills: r.skills ? (JSON.parse(r.skills) as string[]) : [],
    sortOrder: r.sortOrder ?? 0,
  }))
}

export async function upsertExperienceEntry(entry: ExperienceEntry): Promise<ExperienceEntry> {
  const skillsJson = JSON.stringify(entry.skills)
  const now = new Date().toISOString()

  if (entry.id) {
    await db
      .update(schema.experienceEntries)
      .set({
        category: entry.category,
        company: entry.company,
        role: entry.role,
        startDate: entry.startDate,
        endDate: entry.endDate,
        description: entry.description,
        skills: skillsJson,
        sortOrder: entry.sortOrder ?? 0,
        updatedAt: now,
      })
      .where(eq(schema.experienceEntries.id, entry.id))
    return { ...entry, skills: entry.skills }
  }

  const [inserted] = await db
    .insert(schema.experienceEntries)
    .values({
      category: entry.category,
      company: entry.company,
      role: entry.role,
      startDate: entry.startDate,
      endDate: entry.endDate,
      description: entry.description,
      skills: skillsJson,
      sortOrder: entry.sortOrder ?? 0,
    })
    .returning()

  return {
    id: inserted.id,
    category: (inserted.category ?? 'work') as ExperienceCategory,
    company: inserted.company,
    role: inserted.role,
    startDate: inserted.startDate,
    endDate: inserted.endDate,
    description: inserted.description,
    skills: entry.skills,
    sortOrder: inserted.sortOrder ?? 0,
  }
}

export async function deleteExperienceEntry(id: number): Promise<boolean> {
  await db
    .delete(schema.experienceEntries)
    .where(eq(schema.experienceEntries.id, id))
  return true
}
