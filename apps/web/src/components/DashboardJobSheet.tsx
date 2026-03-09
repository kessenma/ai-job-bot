import { useRef, useState } from 'react'
import {
  MapPinIcon, ArrowSquareOutIcon, EnvelopeSimpleIcon, PhoneIcon, LinkedinLogoIcon,
  FileText, CheckCircle, Trash, UploadSimple, CircleNotch,
} from '@phosphor-icons/react'
import {
  attachCoverLetterToJob,
  uploadCoverLetterForJob,
  removeCoverLetterFromJob,
} from '#/lib/jobs.api.ts'
import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import type { FileInfo } from '#/lib/uploads.server.ts'
import type { JobLead } from '#/lib/types.ts'
import type { ScannedEmail } from '#/lib/gmail.server.ts'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '#/components/ui/sheet.tsx'

const diffColors = {
  easy: 'bg-green-500/15 text-green-700',
  medium: 'bg-yellow-500/15 text-yellow-700',
  hard: 'bg-red-500/15 text-red-700',
}

export type CoverLetterMap = Record<string, { uploadName: string; originalName: string; createdAt: string }>

export function DashboardJobSheet({
  selectedJob,
  onClose,
  emails,
  coverLetter,
  coverLetterSamples,
  onCoverLetterChange,
}: {
  selectedJob: JobLead | null
  onClose: () => void
  emails: ScannedEmail[]
  coverLetter?: CoverLetterMap[string]
  coverLetterSamples: FileInfo[]
  onCoverLetterChange: (jobUrl: string, cl: CoverLetterMap[string] | null) => void
}) {
  return (
    <Sheet open={selectedJob !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {selectedJob && (
          <JobDetailContent
            job={selectedJob}
            emails={emails}
            coverLetter={coverLetter}
            coverLetterSamples={coverLetterSamples}
            onCoverLetterChange={onCoverLetterChange}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function JobDetailContent({
  job,
  emails,
  coverLetter,
  coverLetterSamples,
  onCoverLetterChange,
}: {
  job: JobLead
  emails: ScannedEmail[]
  coverLetter?: CoverLetterMap[string]
  coverLetterSamples: FileInfo[]
  onCoverLetterChange: (jobUrl: string, cl: CoverLetterMap[string] | null) => void
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'emails' | 'cover-letter'>('details')
  const [clLoading, setClLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const difficulty = ATS_DIFFICULTY[job.atsPlatform]

  const classificationColors: Record<string, string> = {
    rejection: 'bg-red-100 text-red-700',
    interview: 'bg-purple-100 text-purple-700',
    applied: 'bg-blue-100 text-blue-700',
    other: 'bg-gray-100 text-gray-600',
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-8">{job.company}</SheetTitle>
        <SheetDescription>{job.role}</SheetDescription>
      </SheetHeader>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--line)] px-4">
        {[
          { id: 'details' as const, label: 'Details' },
          { id: 'emails' as const, label: `Emails${emails.length > 0 ? ` (${emails.length})` : ''}` },
          { id: 'cover-letter' as const, label: `Cover Letter${coverLetter ? ' ✓' : ''}` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3 pb-2 text-sm font-medium transition-colors ${
              activeTab === t.id
                ? 'border-b-2 border-[var(--lagoon)] text-[var(--sea-ink)]'
                : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* Tags row */}
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-[var(--surface)] text-[var(--sea-ink-soft)]">
                {job.atsPlatform}
              </span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${diffColors[difficulty]}`}>
                {difficulty}
              </span>
            </div>

            {/* Location */}
            {job.location && (
              <div className="flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
                <MapPinIcon className="h-4 w-4 shrink-0" />
                {job.location}
              </div>
            )}

            {/* Status */}
            {job.applicationStatus && (
              <div>
                <div className="mb-1 text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Application Status</div>
                <div className="text-sm text-[var(--sea-ink)]">{job.applicationStatus}</div>
              </div>
            )}

            {job.activityStatus && (
              <div>
                <div className="mb-1 text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Activity</div>
                <div className="text-sm text-[var(--sea-ink)]">{job.activityStatus}</div>
              </div>
            )}

            {/* Recruiter */}
            {(job.recruiterEmail || job.recruiterPhone || job.recruiterLinkedin) && (
              <div>
                <div className="mb-2 text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Recruiter</div>
                <div className="space-y-1.5">
                  {job.recruiterEmail && job.recruiterEmail !== 'N/A' && !job.recruiterEmail.includes('Unavailable') && (
                    <a
                      href={`mailto:${job.recruiterEmail}`}
                      className="flex items-center gap-2 text-sm text-[var(--lagoon-deep)] no-underline hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EnvelopeSimpleIcon className="h-3.5 w-3.5 shrink-0" />
                      {job.recruiterEmail}
                    </a>
                  )}
                  {job.recruiterPhone && job.recruiterPhone !== 'N/A' && (
                    <div className="flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
                      <PhoneIcon className="h-3.5 w-3.5 shrink-0" />
                      {job.recruiterPhone}
                    </div>
                  )}
                  {job.recruiterLinkedin && job.recruiterLinkedin !== 'N/A' && (
                    <a
                      href={job.recruiterLinkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-[var(--lagoon-deep)] no-underline hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <LinkedinLogoIcon className="h-3.5 w-3.5 shrink-0" />
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Remarks */}
            {job.candidateRemarks && (
              <div>
                <div className="mb-1 text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Notes</div>
                <div className="text-sm text-[var(--sea-ink)]">{job.candidateRemarks}</div>
              </div>
            )}

            {/* Follow-up status */}
            {job.followUpEmailStatus && (
              <div>
                <div className="mb-1 text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Follow-up Email</div>
                <div className="text-sm text-[var(--sea-ink)]">{job.followUpEmailStatus}</div>
              </div>
            )}

            {/* Job link */}
            <a
              href={job.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white no-underline transition hover:opacity-90"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowSquareOutIcon className="h-4 w-4" />
              View Job Posting
            </a>
          </div>
        )}

        {activeTab === 'emails' && (
          <div>
            {emails.length === 0 ? (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--sea-ink-soft)]">
                No emails scanned for this company yet.
                <br />
                <span className="text-xs opacity-70">Go to Email Scanner to scan your inbox.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {emails.map((email) => (
                  <div
                    key={email.messageId}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--sea-ink)]">{email.subject}</div>
                        <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
                          {email.from} · {email.date}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${classificationColors[email.classification] ?? classificationColors.other}`}>
                        {email.classification}
                      </span>
                    </div>
                    {email.snippet && (
                      <p className="mt-2 text-xs text-[var(--sea-ink-soft)] opacity-80 line-clamp-3">
                        {email.snippet}
                      </p>
                    )}
                    {email.matchedKeywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {email.matchedKeywords.map((kw) => (
                          <span
                            key={kw}
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${classificationColors[email.classification] ?? classificationColors.other}`}
                          >
                            "{kw}"
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'cover-letter' && (
          <div className="space-y-4">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file || !job.jobUrl) return
                setClLoading(true)
                try {
                  const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve((reader.result as string).split(',')[1])
                    reader.readAsDataURL(file)
                  })
                  const result = await uploadCoverLetterForJob({
                    data: { jobUrl: job.jobUrl, fileName: file.name, base64Data: base64 },
                  })
                  onCoverLetterChange(job.jobUrl, {
                    uploadName: result.uploadName,
                    originalName: result.originalName,
                    createdAt: new Date().toISOString(),
                  })
                } catch {
                  // ignore
                } finally {
                  setClLoading(false)
                  e.target.value = ''
                }
              }}
            />

            {coverLetter ? (
              /* Currently attached */
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="text-sm font-medium text-[var(--sea-ink)]">{coverLetter.originalName}</div>
                      <div className="text-xs text-[var(--sea-ink-soft)]">
                        Attached {new Date(coverLetter.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setClLoading(true)
                      try {
                        await removeCoverLetterFromJob({ data: { jobUrl: job.jobUrl } })
                        onCoverLetterChange(job.jobUrl, null)
                      } finally {
                        setClLoading(false)
                      }
                    }}
                    disabled={clLoading}
                    className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-100 disabled:opacity-50"
                    title="Remove cover letter"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
                <FileText className="mx-auto h-8 w-8 text-[var(--sea-ink-soft)] opacity-50" />
                <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">No cover letter attached</p>
              </div>
            )}

            {/* Upload new */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={clLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:border-[var(--lagoon)] hover:text-[var(--lagoon)] disabled:opacity-50"
            >
              {clLoading ? (
                <CircleNotch className="h-4 w-4 animate-spin" />
              ) : (
                <UploadSimple className="h-4 w-4" />
              )}
              Upload Cover Letter
            </button>

            {/* Attach from existing */}
            {coverLetterSamples.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">
                  Or attach existing
                </div>
                <div className="space-y-1.5">
                  {coverLetterSamples.map((sample) => (
                    <button
                      key={sample.name}
                      onClick={async () => {
                        setClLoading(true)
                        try {
                          await attachCoverLetterToJob({
                            data: { jobUrl: job.jobUrl, uploadName: sample.name },
                          })
                          onCoverLetterChange(job.jobUrl, {
                            uploadName: sample.name,
                            originalName: sample.originalName,
                            createdAt: new Date().toISOString(),
                          })
                        } finally {
                          setClLoading(false)
                        }
                      }}
                      disabled={clLoading || coverLetter?.uploadName === sample.name}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        coverLetter?.uploadName === sample.name
                          ? 'border-green-300 bg-green-50 text-green-700'
                          : 'border-[var(--line)] text-[var(--sea-ink)] hover:border-[var(--lagoon)] hover:bg-[var(--lagoon)]/5'
                      } disabled:opacity-50`}
                    >
                      {coverLetter?.uploadName === sample.name ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-[var(--sea-ink-soft)]" />
                      )}
                      <span className="truncate">{sample.originalName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
