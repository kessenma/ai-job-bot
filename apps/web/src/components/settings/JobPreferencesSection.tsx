import { useState } from 'react'
import { Funnel, X, Plus, CircleNotch, CheckCircle, Sliders } from '@phosphor-icons/react'
import { saveJobPreferences } from '#/lib/preferences.api.ts'
import type { JobPreferences } from '#/lib/job-filters.ts'

export function JobPreferencesSection({ initialPrefs }: { initialPrefs: JobPreferences | null }) {
  const [prefs, setPrefs] = useState<JobPreferences>(initialPrefs ?? {
    companyBlacklist: [],
    titleBlacklist: [],
    workType: 'any',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: 'EUR',
    minSuitabilityScore: 5,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newTitle, setNewTitle] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await saveJobPreferences({ data: prefs })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const addCompany = () => {
    const val = newCompany.trim()
    if (val && !prefs.companyBlacklist.includes(val)) {
      setPrefs({ ...prefs, companyBlacklist: [...prefs.companyBlacklist, val] })
      setNewCompany('')
    }
  }

  const addTitle = () => {
    const val = newTitle.trim()
    if (val && !prefs.titleBlacklist.includes(val)) {
      setPrefs({ ...prefs, titleBlacklist: [...prefs.titleBlacklist, val] })
      setNewTitle('')
    }
  }

  return (
    <section className="island-shell mb-6 mt-6 rounded-2xl p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <Funnel className="h-5 w-5 text-[var(--lagoon)]" />
        Job Preferences
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Filter out jobs that don't match your criteria. Blacklisted companies and titles are excluded from auto-apply.
      </p>

      <div className="space-y-5">
        {/* Company Blacklist */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
            Company Blacklist
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {prefs.companyBlacklist.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700">
                {c}
                <button onClick={() => setPrefs({ ...prefs, companyBlacklist: prefs.companyBlacklist.filter((x) => x !== c) })} className="hover:text-red-900">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCompany()}
              placeholder="Company name..."
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            />
            <button onClick={addCompany} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface-strong)]">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Title Blacklist */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
            Title Keyword Blacklist
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {prefs.titleBlacklist.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-700">
                {t}
                <button onClick={() => setPrefs({ ...prefs, titleBlacklist: prefs.titleBlacklist.filter((x) => x !== t) })} className="hover:text-orange-900">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTitle()}
              placeholder="e.g. intern, junior, manager..."
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            />
            <button onClick={addTitle} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface-strong)]">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Min Suitability Score */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
            <Sliders className="h-3 w-3" />
            Min Suitability Score for Auto-Apply
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              value={prefs.minSuitabilityScore}
              onChange={(e) => setPrefs({ ...prefs, minSuitabilityScore: parseInt(e.target.value) })}
              className="flex-1"
            />
            <span className="w-8 text-center text-sm font-bold text-[var(--sea-ink)]">{prefs.minSuitabilityScore}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
            Jobs scoring below this threshold won't appear in the auto-apply queue.
          </p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <CircleNotch className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : null}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Preferences'}
        </button>
      </div>
    </section>
  )
}
