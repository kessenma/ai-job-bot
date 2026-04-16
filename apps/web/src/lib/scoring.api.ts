import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { eq } from 'drizzle-orm'
import { readResumeText } from './uploads.server.ts'
import { getConfigValue } from './config.server.ts'

const LLM_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8083'

export interface ScoreResult {
  score: number
  reason: string
  generationTime: number
}

/** Score a single job against the user's resume + profile */
export const scoreJob = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobUrl: string; jobDescription: string; company: string; role: string }) => data)
  .handler(async ({ data }): Promise<ScoreResult> => {
    const resumeText = await readResumeText()
    const profiles = await db.select().from(schema.applyProfile).limit(1)
    const profile = profiles[0]

    const profileSummary = profile
      ? [
          profile.city && profile.country ? `Location: ${profile.city}, ${profile.country}` : '',
          profile.salaryExpectations ? `Salary: ${profile.salaryExpectations}` : '',
          profile.workVisaStatus ? `Visa: ${profile.workVisaStatus}` : '',
          profile.availability ? `Availability: ${profile.availability}` : '',
        ].filter(Boolean).join('\n')
      : ''

    // Resolve active provider config
    const provider = await getConfigValue('active_provider')
    const modelId = await getConfigValue('active_model_id')
    const cliPath = await getConfigValue('claude_cli_path')
    const providerFields: Record<string, string> = {}
    if (provider === 'claude' && modelId) {
      providerFields.model_id = modelId.startsWith('claude/') ? modelId : `claude/${modelId}`
      if (cliPath) providerFields.cli_path = cliPath
    }

    const res = await fetch(`${LLM_URL}/score-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_description: data.jobDescription,
        company: data.company,
        role: data.role,
        resume_text: resumeText || '',
        profile_summary: profileSummary,
        ...providerFields,
      }),
      signal: AbortSignal.timeout(180000), // 3 min for CLI
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
    }

    const result = await res.json() as { score: number; reason: string; generation_time_s: number }

    // Save to database
    const jobs = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.jobUrl, data.jobUrl))
      .limit(1)

    if (jobs[0]) {
      await db.update(schema.jobs).set({
        suitabilityScore: result.score,
        suitabilityReason: result.reason,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.jobs.id, jobs[0].id))
    }

    return {
      score: result.score,
      reason: result.reason,
      generationTime: result.generation_time_s,
    }
  })

/** Batch score multiple jobs */
export const scoreJobs = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobs: { jobUrl: string; jobDescription: string; company: string; role: string }[] }) => data)
  .handler(async ({ data }): Promise<{ scored: number; errors: number }> => {
    let scored = 0
    let errors = 0
    for (const job of data.jobs) {
      try {
        await scoreJob({ data: job })
        scored++
      } catch {
        errors++
      }
    }
    return { scored, errors }
  })
