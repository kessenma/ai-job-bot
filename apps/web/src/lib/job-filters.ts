import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import type { ATSPlatform, JobLead } from '#/lib/types.ts'

export type FilterTab = 'all' | 'ready' | 'applied' | 'followup' | 'rejected' | 'expired'

export interface JobPreferences {
  companyBlacklist: string[]
  titleBlacklist: string[]
  workType: 'remote' | 'hybrid' | 'onsite' | 'any'
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  minSuitabilityScore: number
}

/** Filter jobs by dashboard tab and optional ATS platform */
export function filterJobsByTab(
  jobs: JobLead[],
  tab: FilterTab,
  platformFilter: ATSPlatform | 'all' = 'all',
): JobLead[] {
  return jobs.filter((j) => {
    if (platformFilter !== 'all' && j.atsPlatform !== platformFilter) return false
    const status = j.applicationStatus.toLowerCase()
    const activity = j.activityStatus.toLowerCase()
    switch (tab) {
      case 'ready':
        return (
          activity.includes('candidate should apply') ||
          status.includes('action needed') ||
          (activity.includes('applied') === false &&
            !activity.includes('expired') &&
            !activity.includes('will not'))
        )
      case 'applied':
        return status.includes('submitted') || status.includes('applied')
      case 'followup':
        return (
          (status.includes('submitted') || status.includes('applied')) &&
          j.recruiterEmail &&
          j.recruiterEmail !== 'N/A' &&
          j.recruiterEmail !== 'Unavailable' &&
          !j.recruiterEmail.includes('Unavailable') &&
          !j.followUpEmailStatus?.toLowerCase().includes('sent')
        )
      case 'rejected':
        return status.includes('rejected')
      case 'expired':
        return activity.includes('expired') || status.includes('expired')
      default:
        return true
    }
  })
}

/** Compute dashboard summary stats */
export function computeJobStats(jobs: JobLead[]) {
  return {
    total: jobs.length,
    submitted: jobs.filter((j) => j.applicationStatus.toLowerCase().includes('submitted')).length,
    interview: jobs.filter((j) => j.applicationStatus.toLowerCase().includes('interview')).length,
    rejected: jobs.filter((j) => j.applicationStatus.toLowerCase().includes('rejected')).length,
    needsAction: jobs.filter(
      (j) =>
        j.activityStatus.toLowerCase().includes('candidate should apply') ||
        j.applicationStatus.toLowerCase().includes('action needed'),
    ).length,
    canAutoApply: jobs.filter(
      (j) =>
        ATS_DIFFICULTY[j.atsPlatform] === 'easy' &&
        !j.activityStatus.toLowerCase().includes('expired') &&
        !j.applicationStatus.toLowerCase().includes('submitted') &&
        !j.applicationStatus.toLowerCase().includes('rejected') &&
        !j.activityStatus.toLowerCase().includes('will not'),
    ).length,
  }
}

/** Get follow-up candidates: active jobs with recruiter email, not yet followed up */
export function getFollowUpCandidates(jobs: JobLead[]): JobLead[] {
  return jobs.filter((j) => {
    const status = j.applicationStatus.toLowerCase()
    const hasEmail =
      j.recruiterEmail &&
      j.recruiterEmail !== 'N/A' &&
      !j.recruiterEmail.includes('Unavailable') &&
      j.recruiterEmail !== 'Expired' &&
      !j.recruiterEmail.includes('Not Found')
    const notFollowedUp = !j.followUpEmailStatus?.toLowerCase().includes('sent')
    const isActive =
      status.includes('submitted') || status.includes('applied') || status.includes('interview')

    return hasEmail && notFollowedUp && isActive
  })
}

/** Get auto-apply candidates: jobs that aren't expired/submitted/rejected, have a URL, and pass preference filters */
export function getAutoApplyCandidates(jobs: JobLead[], prefs?: JobPreferences | null): JobLead[] {
  // Deduplicate by jobUrl — keep only the first occurrence
  const seenUrls = new Set<string>()

  return jobs.filter((j) => {
    const activity = j.activityStatus.toLowerCase()
    const status = j.applicationStatus.toLowerCase()

    // Base eligibility
    if (
      activity.includes('expired') ||
      activity.includes('will not') ||
      status.includes('submitted') ||
      status.includes('rejected') ||
      status.includes('interview') ||
      status.includes('applied') ||
      !j.jobUrl
    ) return false

    // Duplicate URL detection
    if (seenUrls.has(j.jobUrl)) return false
    seenUrls.add(j.jobUrl)

    // Preference-based filtering
    if (prefs) {
      if (isBlacklisted(j, prefs)) return false
      if (prefs.minSuitabilityScore && j.suitabilityScore != null && j.suitabilityScore < prefs.minSuitabilityScore) return false
    }

    return true
  })
}

/** Check if a job is blacklisted by company name or title keywords */
export function isBlacklisted(job: JobLead, prefs: JobPreferences): boolean {
  const company = job.company.toLowerCase()
  const role = (job.role || '').toLowerCase()

  for (const bl of prefs.companyBlacklist) {
    if (company.includes(bl.toLowerCase())) return true
  }
  for (const bl of prefs.titleBlacklist) {
    if (role.includes(bl.toLowerCase())) return true
  }
  return false
}

/** Group candidates by ATS difficulty level */
export function groupByDifficulty(jobs: JobLead[]) {
  return {
    easy: jobs.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'easy'),
    medium: jobs.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'medium'),
    hard: jobs.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'hard'),
  }
}
