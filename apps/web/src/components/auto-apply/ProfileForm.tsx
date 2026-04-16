import { useState, useEffect, useRef } from 'react'
import { Robot, CircleNotch, Cpu } from '@phosphor-icons/react'
import {
  saveApplyProfile, parseResumeProfile, parseResumeProfileWithCli,
  getProfileParseProgress, type ApplyProfile,
} from '#/lib/playwright.api.ts'
import {
  COUNTRY_CODES, AVAILABILITY_OPTIONS, VISA_OPTIONS, NATIONALITY_OPTIONS,
  GENDER_OPTIONS, REFERRAL_OPTIONS, DISPLAY_FIELDS, inputClass, selectClass,
} from './profile-constants.ts'
import { EUR_TO_USD, parseRange, formatRange } from './salary-utils.ts'
import { SalaryInput } from './SalaryInput.tsx'

export function ProfileForm({
  profile,
  onSave,
  hasResume,
  claudeCliAvailable = false,
  copilotCliAvailable = false,
  llmConnected = false,
}: {
  profile: ApplyProfile | null
  onSave: (p: ApplyProfile) => void
  hasResume: boolean
  claudeCliAvailable?: boolean
  copilotCliAvailable?: boolean
  llmConnected?: boolean
}) {
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
  const [aiProgressStep, setAiProgressStep] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const anyCliAvailable = claudeCliAvailable || copilotCliAvailable || llmConnected

  /** Compute an ISO date string from an availability / notice period value. */
  const startDateFromAvailability = (avail: string): string => {
    const now = new Date()
    switch (avail) {
      case 'Immediately': return now.toISOString().slice(0, 10)
      case '2 weeks': { now.setDate(now.getDate() + 14); return now.toISOString().slice(0, 10) }
      case '1 month': { now.setMonth(now.getMonth() + 1); return now.toISOString().slice(0, 10) }
      case '2 months': { now.setMonth(now.getMonth() + 2); return now.toISOString().slice(0, 10) }
      case '3 months': { now.setMonth(now.getMonth() + 3); return now.toISOString().slice(0, 10) }
      case '6 months': { now.setMonth(now.getMonth() + 6); return now.toISOString().slice(0, 10) }
      default: return ''
    }
  }

  // Auto-refresh the start date on mount when availability is set
  useEffect(() => {
    if (!form.availability) return
    const fresh = startDateFromAvailability(form.availability)
    if (fresh && fresh !== form.earliestStartDate) {
      setForm((prev) => ({ ...prev, earliestStartDate: fresh }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      // When availability changes, auto-compute the start date
      if (key === 'availability') {
        const date = startDateFromAvailability(value)
        if (date) next.earliestStartDate = date
      }
      return next
    })
  }

  // Poll for CLI parse progress
  useEffect(() => {
    if (!parsing) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const progress = await getProfileParseProgress()
        if (progress.step) setAiProgressStep(progress.step)
      } catch { /* ignore */ }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [parsing])

  const handleParseResume = async (provider?: 'claude' | 'copilot' | 'local') => {
    setParsing(true)
    setAiError(null)
    setAiProgressStep(null)
    try {
      if (provider && anyCliAvailable) {
        // Set the active provider before parsing
        const { setAppConfig } = await import('#/lib/config.api.ts')
        await setAppConfig({ data: { key: 'active_provider', value: provider } })

        const result = await parseResumeProfileWithCli({ data: {} })
        // Fill in fields that are currently empty
        setForm((prev) => {
          const next = { ...prev }
          if (result.firstName && !next.firstName) next.firstName = result.firstName
          if (result.lastName && !next.lastName) next.lastName = result.lastName
          if (result.email && !next.email) next.email = result.email
          if (result.phoneCountryCode && !next.phoneCountryCode) next.phoneCountryCode = result.phoneCountryCode
          if (result.phone && !next.phone) next.phone = result.phone
          if (result.linkedinUrl && !next.linkedinUrl) next.linkedinUrl = result.linkedinUrl
          if (result.city && !next.city) next.city = result.city
          if (result.state && !next.state) next.state = result.state
          if (result.country && !next.country) next.country = result.country
          if (result.zipCode && !next.zipCode) next.zipCode = result.zipCode
          return next
        })
      } else {
        // Fallback: regex-based parsing (no CLI needed)
        const suggestion = await parseResumeProfile()
        if (!suggestion) return
        setForm((prev) => {
          const next = { ...prev }
          if (suggestion.firstName && !next.firstName) next.firstName = suggestion.firstName
          if (suggestion.lastName && !next.lastName) next.lastName = suggestion.lastName
          if (suggestion.email && !next.email) next.email = suggestion.email
          if (suggestion.phoneCountryCode && !next.phoneCountryCode) next.phoneCountryCode = suggestion.phoneCountryCode
          if (suggestion.phone && !next.phone) next.phone = suggestion.phone
          if (suggestion.linkedinUrl && !next.linkedinUrl) next.linkedinUrl = suggestion.linkedinUrl
          if (suggestion.currentLocation) {
            const parts = suggestion.currentLocation.split(/\s*,\s*/)
            if (parts[0] && !next.city) next.city = parts[0]
            if (parts[1] && !next.country) next.country = parts[1]
          }
          return next
        })
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Auto-fill failed')
    } finally {
      setParsing(false)
      setAiProgressStep(null)
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
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {claudeCliAvailable && (
                  <button
                    onClick={() => handleParseResume('claude')}
                    disabled={parsing}
                    className="flex items-center gap-2 rounded-lg border border-[var(--lagoon)] px-3 py-1.5 text-xs font-medium text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
                  >
                    {parsing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <Robot className="h-3.5 w-3.5" />}
                    {parsing ? 'Parsing...' : 'Auto-fill with Claude'}
                  </button>
                )}
                {copilotCliAvailable && (
                  <button
                    onClick={() => handleParseResume('copilot')}
                    disabled={parsing}
                    className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
                  >
                    {parsing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                    {parsing ? 'Parsing...' : 'Auto-fill with Copilot'}
                  </button>
                )}
                {llmConnected && (
                  <button
                    onClick={() => handleParseResume('local')}
                    disabled={parsing}
                    className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
                  >
                    {parsing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                    {parsing ? 'Parsing...' : 'Auto-fill with Local LLM'}
                  </button>
                )}
                {!anyCliAvailable && (
                  <button
                    onClick={() => handleParseResume()}
                    disabled={parsing}
                    className="flex items-center gap-2 rounded-lg border border-[var(--lagoon)] px-3 py-1.5 text-xs font-medium text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
                  >
                    {parsing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <Robot className="h-3.5 w-3.5" />}
                    {parsing ? 'Parsing resume...' : 'Auto-fill from resume'}
                  </button>
                )}
              </div>
              {parsing && aiProgressStep && (
                <p className="text-xs text-[var(--sea-ink-soft)]">{aiProgressStep}</p>
              )}
              {aiError && (
                <p className="text-xs text-red-600">{aiError}</p>
              )}
            </div>
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
