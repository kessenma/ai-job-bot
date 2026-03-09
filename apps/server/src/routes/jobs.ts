import { db, schema } from '@job-app-bot/db'
import { classifyATS } from '@job-app-bot/shared/ats-classifier'
import type { JobLead } from '@job-app-bot/shared/types'

type JsonFn = (data: unknown, status?: number) => Response

export async function handleJobsRoutes(req: Request, url: URL, json: JsonFn): Promise<Response> {
  const path = url.pathname

  if (req.method === 'GET' && path === '/api/jobs') {
    const rows = db.select().from(schema.jobs).all()

    const jobs: JobLead[] = rows.map((row) => ({
      date: row.date ?? '',
      company: row.company,
      role: row.role ?? '',
      location: row.location ?? '',
      recruiterLinkedin: row.recruiterLinkedin ?? '',
      recruiterEmail: row.recruiterEmail ?? '',
      recruiterPhone: row.recruiterPhone ?? '',
      jobUrl: row.jobUrl ?? '',
      activityStatus: row.activityStatus ?? '',
      alignmentStatus: row.alignmentStatus ?? '',
      candidateRemarks: row.candidateRemarks ?? '',
      applicationStatus: row.applicationStatus ?? '',
      followUpEmailStatus: row.followUpEmailStatus ?? '',
      accountManagerRemarks: row.accountManagerRemarks ?? '',
      atsPlatform: classifyATS(row.jobUrl ?? ''),
    }))

    return json(jobs)
  }

  return json({ error: 'Not found' }, 404)
}
