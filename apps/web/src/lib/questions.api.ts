import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { eq, desc, and, sql } from 'drizzle-orm'
import { createHash } from 'crypto'

function hashQuestion(text: string): string {
  const normalized = text.toLowerCase().replace(/[?!.,;:'"]/g, '').replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

export interface QuestionInput {
  label: string
  value?: string
  type: 'text' | 'select' | 'radio' | 'checkbox' | 'file'
  options?: string[]
  required?: boolean
  profileField?: string
  status: 'answered' | 'unanswered'
}

export const saveFormQuestions = createServerFn({ method: 'POST' })
  .inputValidator((data: { questions: QuestionInput[]; platform: string; jobUrl?: string; jobId?: number }) => data)
  .handler(async ({ data }) => {
    const now = new Date().toISOString()

    for (const q of data.questions) {
      const hash = hashQuestion(q.label)

      // Try to find existing question with same hash + platform
      const existing = await db
        .select()
        .from(schema.formQuestions)
        .where(and(
          eq(schema.formQuestions.questionHash, hash),
          eq(schema.formQuestions.platform, data.platform),
        ))
        .limit(1)

      if (existing.length > 0) {
        // Update: increment occurrences, update lastSeenAt
        await db
          .update(schema.formQuestions)
          .set({
            occurrences: sql`${schema.formQuestions.occurrences} + 1`,
            lastSeenAt: now,
            // Update answer if we now have one and didn't before
            ...(q.status === 'answered' && existing[0].status === 'unanswered'
              ? { status: 'answered', answeredValue: q.value, profileField: q.profileField }
              : {}),
          })
          .where(eq(schema.formQuestions.id, existing[0].id))
      } else {
        // Insert new question
        await db.insert(schema.formQuestions).values({
          jobUrl: data.jobUrl || null,
          jobId: data.jobId || null,
          platform: data.platform,
          questionText: q.label,
          questionHash: hash,
          fieldType: q.type === 'file' ? 'text' : q.type,
          options: q.options ? JSON.stringify(q.options) : null,
          status: q.status,
          answeredValue: q.value || null,
          profileField: q.profileField || null,
        })
      }
    }

    return { saved: data.questions.length }
  })

export type FormQuestion = typeof schema.formQuestions.$inferSelect

export const getUnansweredQuestions = createServerFn({ method: 'GET' }).handler(async () => {
  return db
    .select()
    .from(schema.formQuestions)
    .where(eq(schema.formQuestions.status, 'unanswered'))
    .orderBy(desc(schema.formQuestions.occurrences))
})

export const answerQuestion = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; answer: string; profileField?: string }) => data)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(schema.formQuestions)
      .set({
        status: 'user_answered',
        answeredValue: data.answer,
        profileField: data.profileField || null,
        lastSeenAt: new Date().toISOString(),
      })
      .where(eq(schema.formQuestions.id, data.id))
      .returning()
    return updated
  })
