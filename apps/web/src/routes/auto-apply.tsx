import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Robot, ArrowSquareOut, Shield, ShieldWarning, ShieldSlash,
  MagnifyingGlass, CircleNotch, Trash, Globe, Warning,
} from '@phosphor-icons/react'
import { getJobs } from '#/lib/jobs.api.ts'
import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import type { JobLead } from '#/lib/types.ts'
import { requireAuth } from '#/lib/auth-guard.ts'
import {
  screenshotUrl, getScreenshots, deleteScreenshot, type Screenshot,
  getApplyProfile, saveApplyProfile, fillForm, parseResumeProfile,
  type ApplyProfile, type FillFormResult,
} from '#/lib/playwright.api.ts'
import { getResume } from '#/lib/resume.api.ts'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '#/components/ui/dialog'
import {
  Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle,
} from '#/components/ui/item'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/auto-apply')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, screenshots, profile, resume] = await Promise.all([
      getJobs(), getScreenshots(), getApplyProfile(), getResume(),
    ])
    return { jobs, screenshots, profile, hasResume: !!resume }
  },
  component: AutoApply,
})

function AutoApply() {
  const { jobs, screenshots: initialScreenshots, profile: initialProfile, hasResume } = Route.useLoaderData()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState<'screenshot' | 'fill' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<Screenshot[]>(initialScreenshots)
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null)
  const [profile, setProfile] = useState<ApplyProfile | null>(initialProfile)
  const [fillResult, setFillResult] = useState<FillFormResult | null>(null)

  const handleScreenshot = async () => {
    if (!url.trim()) return
    setLoading('screenshot')
    setError(null)
    try {
      const result = await screenshotUrl({ data: { url: url.trim() } })
      setScreenshots((prev) => [result, ...prev])
      setUrl('')
      setSelectedScreenshot(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to take screenshot')
    } finally {
      setLoading(null)
    }
  }

  const handleFillForm = async () => {
    if (!url.trim()) return
    if (!profile) {
      setError('Please save your profile first before filling forms.')
      return
    }
    setLoading('fill')
    setError(null)
    setFillResult(null)
    try {
      const result = await fillForm({ data: { url: url.trim() } })
      setFillResult(result)
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fill form')
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async (id: number) => {
    await deleteScreenshot({ data: { id } })
    setScreenshots((prev) => prev.filter((s) => s.id !== id))
    if (selectedScreenshot?.id === id) setSelectedScreenshot(null)
  }

  const candidates = jobs.filter((j) => {
    const activity = j.activityStatus.toLowerCase()
    const status = j.applicationStatus.toLowerCase()
    return (
      !activity.includes('expired') &&
      !activity.includes('will not') &&
      !status.includes('submitted') &&
      !status.includes('rejected') &&
      !status.includes('interview') &&
      !status.includes('applied') &&
      j.jobUrl
    )
  })

  const byDifficulty = {
    easy: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'easy'),
    medium: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'medium'),
    hard: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'hard'),
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <Robot className="h-6 w-6 text-[var(--lagoon)]" />
        Auto Apply Queue
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        Jobs grouped by ATS difficulty. "Easy" platforms (Recruitee, Join, Lever) have simple forms
        that can be filled automatically. "Medium" may have CAPTCHAs. "Hard" requires manual work.
      </p>

      {/* Apply Profile Section */}
      <ProfileForm profile={profile} onSave={setProfile} hasResume={hasResume} />

      {/* URL Input + Actions Section */}
      <section className="island-shell mb-8 rounded-xl p-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
          <MagnifyingGlass className="h-5 w-5 text-[var(--lagoon)]" />
          Job URL
        </h2>
        <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
          Enter a job URL to screenshot or auto-fill the application form.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleScreenshot()}
            placeholder="https://jobs.example.com/apply/12345"
            disabled={!!loading}
            className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleScreenshot}
            disabled={!!loading || !url.trim()}
            className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] disabled:pointer-events-none disabled:opacity-50"
          >
            {loading === 'screenshot' ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <MagnifyingGlass className="h-4 w-4" />
            )}
            {loading === 'screenshot' ? 'Capturing...' : 'Screenshot'}
          </button>
          <button
            onClick={handleFillForm}
            disabled={!!loading || !url.trim() || !profile}
            title={!profile ? 'Save your profile first' : undefined}
            className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading === 'fill' ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <Robot className="h-4 w-4" />
            )}
            {loading === 'fill' ? 'Filling...' : 'Fill Form'}
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            <Warning className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {/* Fill Form Result */}
      {fillResult && <FillResultCard result={fillResult} onClose={() => setFillResult(null)} />}

      {/* Screenshot Gallery */}
      {screenshots.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
            <Globe className="h-5 w-5 text-[var(--lagoon)]" />
            Screenshots
            <span className="text-sm font-normal text-[var(--sea-ink-soft)]">({screenshots.length})</span>
          </h2>
          <ItemGroup>
            {screenshots.map((s) => (
              <Item
                key={s.id}
                variant="outline"
                className="cursor-pointer bg-[var(--surface)] hover:bg-[var(--surface-strong)]"
                render={<button type="button" onClick={() => setSelectedScreenshot(s)} />}
              >
                <ItemMedia variant="image" className="!size-16 !rounded-md">
                  <img
                    alt={s.title ?? s.url}
                    src={`data:image/png;base64,${s.image}`}
                    className="object-cover object-top"
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {s.title || new URL(s.url).hostname}
                    {s.atsPlatform && (
                      <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
                        {s.atsPlatform}
                      </span>
                    )}
                  </ItemTitle>
                  <ItemDescription className="truncate">
                    {s.url}
                  </ItemDescription>
                </ItemContent>
                <ItemContent className="!flex-none text-right">
                  <StatusBadge status={s.status} hasCaptcha={s.hasCaptcha} />
                  <ItemDescription>
                    {new Date(s.createdAt).toLocaleDateString()}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}

      {/* Full-screen screenshot dialog */}
      <Dialog open={!!selectedScreenshot} onOpenChange={(open) => !open && setSelectedScreenshot(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-[var(--lagoon)]" />
              {selectedScreenshot?.title || 'Screenshot'}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-3 text-xs">
              <span className="truncate">{selectedScreenshot?.url}</span>
              {selectedScreenshot?.atsPlatform && (
                <span className="shrink-0 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
                  {selectedScreenshot.atsPlatform}
                </span>
              )}
              {selectedScreenshot && (
                <StatusBadge status={selectedScreenshot.status} hasCaptcha={selectedScreenshot.hasCaptcha} />
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedScreenshot && (
            <>
              <ActionsSummary actions={selectedScreenshot.actions} />
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--line)]">
                <img
                  src={`data:image/png;base64,${selectedScreenshot.image}`}
                  alt={selectedScreenshot.title ?? 'Screenshot'}
                  className="w-full"
                />
              </div>
            </>
          )}

          <DialogFooter>
            {selectedScreenshot && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(selectedScreenshot.id)}
                >
                  <Trash className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <a
                  href={selectedScreenshot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink)] no-underline hover:bg-[var(--surface-strong)]"
                >
                  <ArrowSquareOut className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Difficulty groups */}
      {(['easy', 'medium', 'hard'] as const).map((level) => (
        <section key={level} className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
            {level === 'easy' ? (
              <Shield className="h-5 w-5 text-green-600" />
            ) : level === 'medium' ? (
              <ShieldWarning className="h-5 w-5 text-yellow-600" />
            ) : (
              <ShieldSlash className="h-5 w-5 text-red-600" />
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                level === 'easy'
                  ? 'bg-green-500/15 text-green-700'
                  : level === 'medium'
                    ? 'bg-yellow-500/15 text-yellow-700'
                    : 'bg-red-500/15 text-red-700'
              }`}
            >
              {level}
            </span>
            {byDifficulty[level].length} jobs
          </h2>

          {byDifficulty[level].length === 0 ? (
            <p className="text-sm text-[var(--sea-ink-soft)]">No jobs at this difficulty level.</p>
          ) : (
            <div className="space-y-2">
              {byDifficulty[level].map((job, i) => (
                <AutoApplyRow key={`${job.company}-${i}`} job={job} />
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="island-shell rounded-xl p-6">
        <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">How Auto-Apply Works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--sea-ink-soft)]">
          <li>Playwright opens the job URL in a headless browser</li>
          <li>The ATS handler identifies form fields and fills them with your profile</li>
          <li>Resume and cover letter are uploaded</li>
          <li>If a CAPTCHA is detected, the job is flagged for manual completion</li>
          <li>If custom questions are found, they're logged for you to answer</li>
          <li>Results are written back to the spreadsheet</li>
        </ol>
        <p className="mt-4 text-xs text-[var(--sea-ink-soft)] opacity-70">
          Auto-apply is not yet wired up — this page shows what's in the queue.
          The Playwright handlers need to be built per ATS platform.
        </p>
      </section>
    </main>
  )
}

interface Actions {
  dismissedCookies: boolean
  clickedApply: boolean
  applyButtonText: string | null
  navigatedTo: string | null
}

function parseActions(actions: string | null): Actions | null {
  if (!actions) return null
  try { return JSON.parse(actions) } catch { return null }
}

function ActionsSummary({ actions: raw }: { actions: string | null }) {
  const actions = parseActions(raw)
  if (!actions) return null
  if (!actions.dismissedCookies && !actions.clickedApply) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--sea-ink-soft)]">
      <span className="font-medium text-[var(--sea-ink)]">Actions taken:</span>
      {actions.dismissedCookies && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
          Dismissed cookies
        </span>
      )}
      {actions.clickedApply && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
          Clicked "{actions.applyButtonText}"
        </span>
      )}
      {actions.navigatedTo && (
        <span className="truncate text-[var(--sea-ink-soft)]">
          → {actions.navigatedTo}
        </span>
      )}
    </div>
  )
}

function StatusBadge({ status, hasCaptcha }: { status: string | null; hasCaptcha: boolean | null }) {
  const color =
    status === 'loaded' ? 'bg-green-100 text-green-700' :
    status === 'expired' ? 'bg-gray-100 text-gray-500' :
    status === 'blocked' ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-600'

  return (
    <span className="flex items-center gap-1">
      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${color}`}>
        {status ?? 'unknown'}
      </span>
      {hasCaptcha && (
        <span className="inline-flex rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-700">
          CAPTCHA
        </span>
      )}
    </span>
  )
}

// --- Profile Form ---

const COUNTRY_CODES = [
  { code: '+49', label: 'DE +49' },
  { code: '+43', label: 'AT +43' },
  { code: '+41', label: 'CH +41' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+33', label: 'FR +33' },
  { code: '+31', label: 'NL +31' },
  { code: '+34', label: 'ES +34' },
  { code: '+39', label: 'IT +39' },
  { code: '+46', label: 'SE +46' },
  { code: '+45', label: 'DK +45' },
  { code: '+47', label: 'NO +47' },
  { code: '+48', label: 'PL +48' },
  { code: '+91', label: 'IN +91' },
  { code: '+86', label: 'CN +86' },
  { code: '+81', label: 'JP +81' },
  { code: '+82', label: 'KR +82' },
  { code: '+55', label: 'BR +55' },
  { code: '+61', label: 'AU +61' },
]

const AVAILABILITY_OPTIONS = ['Immediately', '2 weeks', '1 month', '2 months', '3 months', '6 months']
const VISA_OPTIONS = [
  'Yes - have work visa',
  'Yes - Blue Card',
  'Yes - EU Citizen',
  'No - will need sponsorship',
  'In process',
  'Not required',
]
const NATIONALITY_OPTIONS = ['US Citizen', 'German', 'Austrian', 'EU Citizen', 'Other']
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say']
const REFERRAL_OPTIONS = ['LinkedIn', 'Indeed', 'Glassdoor', 'Company Website', 'Job Board', 'Recruiter', 'Friend / Referral', 'Other']

const DISPLAY_FIELDS: { key: string; label: string }[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'zipCode', label: 'Zip Code' },
  { key: 'salaryExpectations', label: 'Salary' },
  { key: 'availability', label: 'Availability' },
  { key: 'earliestStartDate', label: 'Start Date' },
  { key: 'workVisaStatus', label: 'Visa' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'gender', label: 'Gender' },
  { key: 'referralSource', label: 'Referral' },
]

const inputClass = 'w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none'
const selectClass = 'w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none'

const EUR_TO_USD = 1.175

function parseRange(s: string): { min: number; max: number } | null {
  const nums = s.replace(/[^0-9.-]/g, ' ').trim().split(/\s+/).map(Number).filter((n) => !isNaN(n) && n > 0)
  if (nums.length === 0) return null
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: nums[0], max: nums[1] }
}

function formatRange(min: number, max: number): string {
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
  return min === max ? fmt(min) : `${fmt(min)}-${fmt(max)}`
}

function SalaryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Stored value is always "MIN-MAX EUR" format
  const range = parseRange(value)
  const eurStr = range ? formatRange(range.min, range.max) : ''
  const usdStr = range ? formatRange(range.min * EUR_TO_USD, range.max * EUR_TO_USD) : ''

  const handleEur = (raw: string) => {
    const r = parseRange(raw)
    if (!raw.trim()) { onChange(''); return }
    if (r) onChange(`${formatRange(r.min, r.max)} EUR`)
  }

  const handleUsd = (raw: string) => {
    const r = parseRange(raw)
    if (!raw.trim()) { onChange(''); return }
    if (r) onChange(`${formatRange(r.min / EUR_TO_USD, r.max / EUR_TO_USD)} EUR`)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-xs font-medium text-[var(--sea-ink-soft)]">EUR</span>
          <input
            type="text"
            defaultValue={eurStr}
            onBlur={(e) => handleEur(e.target.value)}
            placeholder="65,000-75,000"
            className={inputClass}
            key={`eur-${value}`}
          />
        </div>
      </div>
      <span className="text-xs text-[var(--sea-ink-soft)]">=</span>
      <div className="flex-1">
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-xs font-medium text-[var(--sea-ink-soft)]">USD</span>
          <input
            type="text"
            defaultValue={usdStr}
            onBlur={(e) => handleUsd(e.target.value)}
            placeholder="76,375-88,125"
            className={inputClass}
            key={`usd-${value}`}
          />
        </div>
      </div>
    </div>
  )
}

function ProfileForm({ profile, onSave, hasResume }: { profile: ApplyProfile | null; onSave: (p: ApplyProfile) => void; hasResume: boolean }) {
  const [editing, setEditing] = useState(!profile)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (!profile) return { phoneCountryCode: '+1' } as Record<string, string>
    return {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      email: profile.email ?? '',
      phoneCountryCode: profile.phoneCountryCode ?? '+1',
      phone: profile.phone ?? '',
      linkedinUrl: profile.linkedinUrl ?? '',
      city: profile.city ?? '',
      state: profile.state ?? '',
      country: profile.country ?? '',
      zipCode: profile.zipCode ?? '',
      salaryExpectations: profile.salaryExpectations ?? '',
      availability: profile.availability ?? '',
      earliestStartDate: profile.earliestStartDate ?? '',
      workVisaStatus: profile.workVisaStatus ?? '',
      nationality: profile.nationality ?? '',
      gender: profile.gender ?? '',
      referralSource: profile.referralSource ?? '',
    }
  })
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleParseResume = async () => {
    setParsing(true)
    try {
      const suggestion = await parseResumeProfile()
      if (!suggestion) return
      // Only fill in fields that are currently empty
      setForm((prev) => {
        const next = { ...prev }
        if (suggestion.firstName && !next.firstName) next.firstName = suggestion.firstName
        if (suggestion.lastName && !next.lastName) next.lastName = suggestion.lastName
        if (suggestion.email && !next.email) next.email = suggestion.email
        if (suggestion.phoneCountryCode && !next.phoneCountryCode) next.phoneCountryCode = suggestion.phoneCountryCode
        if (suggestion.phone && !next.phone) next.phone = suggestion.phone
        if (suggestion.linkedinUrl && !next.linkedinUrl) next.linkedinUrl = suggestion.linkedinUrl
        if (suggestion.currentLocation) {
          // Try to split "City, Country" into separate fields
          const parts = suggestion.currentLocation.split(/\s*,\s*/)
          if (parts[0] && !next.city) next.city = parts[0]
          if (parts[1] && !next.country) next.country = parts[1]
        }
        return next
      })
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async () => {
    if (!form.firstName || !form.lastName || !form.email) return
    setSaving(true)
    try {
      const result = await saveApplyProfile({
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phoneCountryCode: form.phoneCountryCode || null,
          phone: form.phone || null,
          linkedinUrl: form.linkedinUrl || null,
          city: form.city || null,
          state: form.state || null,
          country: form.country || null,
          zipCode: form.zipCode || null,
          salaryExpectations: form.salaryExpectations || null,
          availability: form.availability || null,
          earliestStartDate: form.earliestStartDate || null,
          workVisaStatus: form.workVisaStatus || null,
          nationality: form.nationality || null,
          gender: form.gender || null,
          referralSource: form.referralSource || null,
        },
      })
      onSave(result)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const displayPhone = profile ? [profile.phoneCountryCode, profile.phone].filter(Boolean).join(' ') : ''

  return (
    <section className="island-shell mb-8 rounded-xl p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
          <Robot className="h-5 w-5 text-[var(--lagoon)]" />
          Apply Profile
        </h2>
        {profile && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-[var(--lagoon-deep)] hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {!editing && profile ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {DISPLAY_FIELDS.map((f) => {
            const val = f.key === 'phone' ? displayPhone : (profile as Record<string, any>)[f.key]
            if (!val) return null
            let display = val
            if (f.key === 'salaryExpectations') {
              const r = parseRange(val)
              if (r) display = `${formatRange(r.min, r.max)} EUR / ${formatRange(r.min * EUR_TO_USD, r.max * EUR_TO_USD)} USD`
            }
            return (
              <div key={f.key}>
                <span className="text-[var(--sea-ink-soft)]">{f.label}: </span>
                <span className="font-medium text-[var(--sea-ink)]">{display}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
            This info is used to auto-fill job application forms. Fields marked * are required.
          </p>

          {hasResume && (
            <button
              onClick={handleParseResume}
              disabled={parsing}
              className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--lagoon)] px-3 py-1.5 text-xs font-medium text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
            >
              {parsing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <Robot className="h-3.5 w-3.5" />}
              {parsing ? 'Parsing resume...' : 'Auto-fill from resume'}
            </button>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Text fields */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">First Name *</label>
              <input type="text" value={form.firstName ?? ''} onChange={(e) => set('firstName', e.target.value)} placeholder="Jane" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Last Name *</label>
              <input type="text" value={form.lastName ?? ''} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Email *</label>
              <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="jane@example.com" className={inputClass} />
            </div>

            {/* Phone with country code */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Phone</label>
              <div className="flex gap-1">
                <select value={form.phoneCountryCode ?? '+49'} onChange={(e) => set('phoneCountryCode', e.target.value)} className={`${selectClass} !w-24 shrink-0`}>
                  {COUNTRY_CODES.map((cc) => (
                    <option key={cc.code} value={cc.code}>{cc.label}</option>
                  ))}
                </select>
                <input type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="170 1234567" className={inputClass} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">LinkedIn URL</label>
              <input type="url" value={form.linkedinUrl ?? ''} onChange={(e) => set('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/janedoe" className={inputClass} />
            </div>
            {/* Location fields */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">City</label>
              <input type="text" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} placeholder="Berlin" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">State / Region</label>
              <input type="text" value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} placeholder="Berlin" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Country</label>
              <input type="text" value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} placeholder="Germany" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Zip / Postal Code</label>
              <input type="text" value={form.zipCode ?? ''} onChange={(e) => set('zipCode', e.target.value)} placeholder="10115" className={inputClass} />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Salary Expectations</label>
              <SalaryInput value={form.salaryExpectations ?? ''} onChange={(v) => set('salaryExpectations', v)} />
            </div>

            {/* Dropdown fields */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Availability / Notice Period</label>
              <select value={form.availability ?? ''} onChange={(e) => set('availability', e.target.value)} className={selectClass}>
                <option value="">-- Select --</option>
                {AVAILABILITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Earliest Start Date</label>
              <input type="date" value={form.earliestStartDate ?? ''} onChange={(e) => set('earliestStartDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Work Visa / Blue Card</label>
              <select value={form.workVisaStatus ?? ''} onChange={(e) => set('workVisaStatus', e.target.value)} className={selectClass}>
                <option value="">-- Select --</option>
                {VISA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Nationality</label>
              <select value={form.nationality ?? ''} onChange={(e) => set('nationality', e.target.value)} className={selectClass}>
                <option value="">-- Select --</option>
                {NATIONALITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Gender</label>
              <select value={form.gender ?? ''} onChange={(e) => set('gender', e.target.value)} className={selectClass}>
                <option value="">-- Select --</option>
                {GENDER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Where did you hear about us?</label>
              <select value={form.referralSource ?? ''} onChange={(e) => set('referralSource', e.target.value)} className={selectClass}>
                <option value="">-- Select --</option>
                {REFERRAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.firstName || !form.lastName || !form.email}
              className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              {saving && <CircleNotch className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            {profile && (
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)]"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// --- Fill Result Card ---

function FillResultCard({ result, onClose }: { result: FillFormResult; onClose: () => void }) {
  return (
    <section className="island-shell mb-8 rounded-xl p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
          <Robot className="h-5 w-5 text-[var(--lagoon)]" />
          Form Fill Result
        </h2>
        <button onClick={onClose} className="text-xs text-[var(--sea-ink-soft)] hover:underline">
          Dismiss
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Filled fields */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-green-700">
            Filled ({result.filled.length})
          </h3>
          {result.filled.length === 0 ? (
            <p className="text-xs text-[var(--sea-ink-soft)]">No fields were auto-filled.</p>
          ) : (
            <div className="space-y-1">
              {result.filled.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 font-bold uppercase text-green-700">
                    {f.type}
                  </span>
                  <span className="text-[var(--sea-ink-soft)]">{f.label}:</span>
                  <span className="font-medium text-[var(--sea-ink)]">{f.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Skipped fields */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-yellow-700">
            Skipped ({result.skipped.length})
          </h3>
          {result.skipped.length === 0 ? (
            <p className="text-xs text-[var(--sea-ink-soft)]">All detected fields were filled.</p>
          ) : (
            <div className="space-y-1">
              {result.skipped.map((label, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex rounded-full bg-yellow-100 px-1.5 py-0.5 font-bold uppercase text-yellow-700">
                    skip
                  </span>
                  <span className="text-[var(--sea-ink)]">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Screenshot of filled form */}
      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <img
          src={`data:image/png;base64,${result.screenshot}`}
          alt={result.title ?? 'Filled form'}
          className="w-full"
        />
      </div>
    </section>
  )
}

function AutoApplyRow({ job }: { job: JobLead }) {
  return (
    <div className="island-shell flex items-center justify-between rounded-xl p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--sea-ink)]">{job.company}</span>
          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
            {job.atsPlatform}
          </span>
        </div>
        <div className="text-sm text-[var(--sea-ink-soft)]">{job.role}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--sea-ink-soft)]">{job.activityStatus}</span>
        <a
          href={job.jobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--lagoon-deep)] no-underline hover:bg-[var(--surface-strong)]"
        >
          <ArrowSquareOut className="h-3 w-3" />
          View
        </a>
      </div>
    </div>
  )
}
