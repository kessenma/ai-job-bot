import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Funnel, Table, MagnifyingGlass, Tray, FileText, Globe,
} from '@phosphor-icons/react'
import { getJobs } from '#/lib/jobs.api.ts'
import { getGmailStatus, getSavedEmails } from '#/lib/gmail.api.ts'
import { getSheetsStatus } from '#/lib/sheets.api.ts'
import { getJobDescriptions } from '#/lib/playwright.api.ts'
import { requireAuth } from '#/lib/auth-guard.ts'
import { StatusPill, CollapsibleSection } from '#/components/ui/index.ts'
import { SheetsImport } from '#/components/pipeline/SheetsImport.tsx'
import { EmailScanner } from '#/components/scanners/EmailScanner.tsx'
import { DescriptionScanner } from '#/components/scanners/DescriptionScanner.tsx'
import { LinkedInScanner } from '#/components/scanners/LinkedInScanner.tsx'
import { MultiboardScanner } from '#/components/scanners/MultiboardScanner.tsx'
import type { JobDescription } from '#/lib/types.ts'

export const Route = createFileRoute('/pipeline')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, gmailStatus, sheetsStatus, savedEmails, jobDescriptions] = await Promise.all([
      getJobs(),
      getGmailStatus(),
      getSheetsStatus(),
      getSavedEmails(),
      getJobDescriptions(),
    ])
    return { jobs, gmailStatus, sheetsStatus, savedEmails, jobDescriptions }
  },
  component: Pipeline,
})

function Pipeline() {
  const { jobs, gmailStatus, sheetsStatus, savedEmails, jobDescriptions: initialDescMap } = Route.useLoaderData()
  const [descMap, setDescMap] = useState<Record<string, JobDescription>>(initialDescMap)

  const jobsWithUrls = jobs.filter((j) => j.jobUrl)
  const jobsWithDesc = jobsWithUrls.filter((j) => descMap[j.jobUrl])

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <Funnel className="h-6 w-6 text-[var(--lagoon)]" />
        Pipeline
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        Import jobs, search for new ones, scan emails, and scrape descriptions.
      </p>

      {/* Section 1: Import from Sheets */}
      <section className="island-shell mb-6 overflow-hidden rounded-2xl">
        <CollapsibleSection
          defaultOpen={!sheetsStatus.configured || !sheetsStatus.authenticated}
          trigger={(_open) => (
            <div className="flex items-center gap-3 p-6">
              <Table className="h-5 w-5 text-[var(--lagoon)]" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Import from Sheets</h2>
                <p className="text-sm text-[var(--sea-ink-soft)]">{jobs.length} jobs imported</p>
              </div>
              <StatusPill variant={sheetsStatus.configured && sheetsStatus.authenticated ? 'success' : 'warning'}>
                {sheetsStatus.configured && sheetsStatus.authenticated ? `${jobs.length} jobs` : 'Not connected'}
              </StatusPill>
            </div>
          )}
        >
          <div className="border-t border-[var(--line)] p-6">
            <SheetsImport initialJobs={jobs} sheetsStatus={sheetsStatus} />
          </div>
        </CollapsibleSection>
      </section>

      {/* Section 2: LinkedIn Job Search */}
      <section className="island-shell mb-6 overflow-hidden rounded-2xl">
        <CollapsibleSection
          defaultOpen={false}
          trigger={(_open) => (
            <div className="flex items-center gap-3 p-6">
              <MagnifyingGlass className="h-5 w-5 text-[var(--lagoon)]" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Search LinkedIn</h2>
                <p className="text-sm text-[var(--sea-ink-soft)]">Find new jobs matching your criteria</p>
              </div>
              <StatusPill variant="info">Search</StatusPill>
            </div>
          )}
        >
          <div className="border-t border-[var(--line)] p-6">
            <LinkedInScanner />
          </div>
        </CollapsibleSection>
      </section>

      {/* Section 3: Multi-Board Job Search */}
      <section className="island-shell mb-6 overflow-hidden rounded-2xl">
        <CollapsibleSection
          defaultOpen={false}
          trigger={(_open) => (
            <div className="flex items-center gap-3 p-6">
              <Globe className="h-5 w-5 text-[var(--lagoon)]" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Search Job Boards</h2>
                <p className="text-sm text-[var(--sea-ink-soft)]">Search Indeed, Glassdoor, ZipRecruiter & more</p>
              </div>
              <StatusPill variant="info">Search</StatusPill>
            </div>
          )}
        >
          <div className="border-t border-[var(--line)] p-6">
            <MultiboardScanner />
          </div>
        </CollapsibleSection>
      </section>

      {/* Section 4: Email Scanner */}
      <section className="island-shell mb-6 overflow-hidden rounded-2xl">
        <CollapsibleSection
          defaultOpen={false}
          trigger={(_open) => (
            <div className="flex items-center gap-3 p-6">
              <Tray className="h-5 w-5 text-[var(--lagoon)]" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Scan Emails</h2>
                <p className="text-sm text-[var(--sea-ink-soft)]">Check Gmail for rejections and interviews</p>
              </div>
              <StatusPill variant={gmailStatus.connected ? 'success' : 'warning'}>
                {gmailStatus.connected
                  ? savedEmails.length > 0 ? `${savedEmails.reduce((sum: number, r: { emails: unknown[] }) => sum + r.emails.length, 0)} emails` : 'Connected'
                  : 'Not connected'}
              </StatusPill>
            </div>
          )}
        >
          <div className="border-t border-[var(--line)] p-6">
            <EmailScanner jobs={jobs} gmailStatus={gmailStatus} savedEmails={savedEmails} />
          </div>
        </CollapsibleSection>
      </section>

      {/* Section 4: Description Scanner */}
      <section className="island-shell mb-6 overflow-hidden rounded-2xl">
        <CollapsibleSection
          defaultOpen={false}
          trigger={(_open) => (
            <div className="flex items-center gap-3 p-6">
              <FileText className="h-5 w-5 text-[var(--lagoon)]" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Scrape Descriptions</h2>
                <p className="text-sm text-[var(--sea-ink-soft)]">
                  {jobsWithDesc.length} of {jobsWithUrls.length} jobs have descriptions
                </p>
              </div>
              <StatusPill variant={jobsWithDesc.length === jobsWithUrls.length && jobsWithUrls.length > 0 ? 'success' : 'info'}>
                {jobsWithUrls.length > 0 ? `${jobsWithDesc.length}/${jobsWithUrls.length}` : 'No URLs'}
              </StatusPill>
            </div>
          )}
        >
          <div className="border-t border-[var(--line)] p-6">
            <DescriptionScanner
              jobs={jobs}
              existingDescriptions={descMap}
              onDescriptionsChange={setDescMap}
            />
          </div>
        </CollapsibleSection>
      </section>
    </main>
  )
}
