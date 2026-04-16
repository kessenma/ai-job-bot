import { useState, useEffect, useRef } from 'react'
import {
  Briefcase, Plus, Trash, PencilSimple, X, CircleNotch, CheckCircle,
  CaretDown, CaretUp, ClipboardText, GraduationCap, BookOpen, Lightbulb,
  Robot, Cpu,
} from '@phosphor-icons/react'
import { saveExperienceEntry, removeExperienceEntry, parseResumesWithLlm, getParseProgress } from '#/lib/experience.api.ts'
import type { ExperienceEntry, ExperienceCategory } from '#/lib/experience.api.ts'

const CATEGORY_CONFIG: Record<ExperienceCategory, {
  label: string
  icon: typeof Briefcase
  color: string
  emptyLabel: string
}> = {
  work: { label: 'Work Experience', icon: Briefcase, color: 'var(--lagoon)', emptyLabel: 'No work experience added' },
  education: { label: 'Education', icon: GraduationCap, color: '#6366f1', emptyLabel: 'No education added' },
  project: { label: 'Projects', icon: Lightbulb, color: '#f59e0b', emptyLabel: 'No projects added' },
  publication: { label: 'Publications', icon: BookOpen, color: '#10b981', emptyLabel: 'No publications added' },
}

const CATEGORY_ORDER: ExperienceCategory[] = ['work', 'education', 'project', 'publication']

const EMPTY_ENTRY: ExperienceEntry = {
  category: 'work',
  company: '',
  role: '',
  startDate: '',
  endDate: null,
  description: '',
  skills: [],
}

// ── Paste-import helpers ──────────────────────────────────────────────

/** Detect which category a section header maps to. */
function detectCategory(header: string): ExperienceCategory | null {
  const h = header.toLowerCase().trim()
  if (/experience|employment|work history/i.test(h)) return 'work'
  if (/education|academic|degree|university|college/i.test(h)) return 'education'
  if (/project/i.test(h)) return 'project'
  if (/publication|paper|research/i.test(h)) return 'publication'
  return null
}

/**
 * Split pasted resume text into entries by detecting section headers
 * and individual positions within each section.
 */
function parseResumeText(text: string): ExperienceEntry[] {
  const lines = text.split('\n')
  const entries: ExperienceEntry[] = []
  let currentCategory: ExperienceCategory = 'work'
  let buffer: string[] = []

  const flushBuffer = () => {
    const raw = buffer.join('\n').trim()
    if (!raw) return
    if (currentCategory === 'publication') {
      // Publications: each bullet or line is a separate entry
      const pubs = raw
        .split('\n')
        .map((l) => l.replace(/^[\s*•\-–—]+/, '').trim())
        .filter(Boolean)
      for (const pub of pubs) {
        entries.push({
          category: 'publication',
          company: '',
          role: '',
          startDate: null,
          endDate: null,
          description: pub,
          skills: [],
        })
      }
    } else {
      // For work/education/project: store the whole block as one entry
      // The first non-empty line is treated as the role/title,
      // the second as the company/org, rest is description
      const contentLines = raw.split('\n').filter((l) => l.trim())
      if (contentLines.length === 0) return

      const firstLine = contentLines[0].trim()
      const secondLine = contentLines.length > 1 ? contentLines[1].trim() : ''
      const descLines = contentLines.slice(2)

      entries.push({
        category: currentCategory,
        company: secondLine,
        role: firstLine,
        startDate: null,
        endDate: null,
        description: descLines.map((l) => l.trim()).join('\n'),
        skills: [],
      })
    }
    buffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Check if this line is a section header
    const cat = detectCategory(trimmed)
    if (cat && trimmed.length < 60) {
      flushBuffer()
      currentCategory = cat
      continue
    }

    // Detect position boundaries: a blank line followed by new content
    // indicates a new entry within the same section
    if (trimmed === '' && buffer.length > 0 && currentCategory !== 'publication') {
      // Check if the buffer has meaningful content (at least 2 lines suggesting a full entry)
      const meaningfulLines = buffer.filter((l) => l.trim()).length
      if (meaningfulLines >= 2) {
        flushBuffer()
        continue
      }
    }

    buffer.push(line)
  }
  flushBuffer()

  return entries
}

// ── Component ─────────────────────────────────────────────────────────

export type ResumeInfo = { name: string; originalName: string; isPrimary?: boolean }

export function ExperienceProfileSection({
  initialEntries,
  llmConnected = false,
  claudeCliAvailable = false,
  copilotCliAvailable = false,
  resumes = [],
}: {
  initialEntries: ExperienceEntry[]
  llmConnected?: boolean
  claudeCliAvailable?: boolean
  copilotCliAvailable?: boolean
  resumes?: ResumeInfo[]
}) {
  const hasResumes = resumes.length > 0
  const [entries, setEntries] = useState<ExperienceEntry[]>(initialEntries)
  const [editing, setEditing] = useState<ExperienceEntry | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newSkill, setNewSkill] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Paste-import state
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteCategory, setPasteCategory] = useState<ExperienceCategory>('work')
  const [parsedPreview, setParsedPreview] = useState<ExperienceEntry[] | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)

  // Resume selection for AI parse
  const [selectedResumes, setSelectedResumes] = useState<Set<string>>(new Set())
  const [showResumePicker, setShowResumePicker] = useState(false)

  // AI parse state
  const [aiParsing, setAiParsing] = useState(false)
  const [aiParseError, setAiParseError] = useState<string | null>(null)
  const [aiParseTime, setAiParseTime] = useState<number | null>(null)
  const [aiProgressStep, setAiProgressStep] = useState<string | null>(null)
  const [aiProgressLog, setAiProgressLog] = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Entry CRUD ───────────────────────────────────────────────────

  const startAdd = (category: ExperienceCategory = 'work') => {
    setEditing({ ...EMPTY_ENTRY, category })
    setIsNew(true)
    setNewSkill('')
  }

  const startEdit = (entry: ExperienceEntry) => {
    setEditing({ ...entry, skills: [...entry.skills] })
    setIsNew(false)
    setNewSkill('')
  }

  const cancelEdit = () => {
    setEditing(null)
    setIsNew(false)
  }

  const addSkill = () => {
    const val = newSkill.trim()
    if (val && editing && !editing.skills.includes(val)) {
      setEditing({ ...editing, skills: [...editing.skills, val] })
      setNewSkill('')
    }
  }

  const removeSkill = (skill: string) => {
    if (editing) {
      setEditing({ ...editing, skills: editing.skills.filter((s) => s !== skill) })
    }
  }

  const handleSave = async () => {
    if (!editing) return
    // Publications only need description; others need company+role+description
    if (editing.category !== 'publication') {
      if (!editing.company.trim() || !editing.role.trim() || !editing.description.trim()) return
    } else {
      if (!editing.description.trim()) return
    }

    setSaving(true)
    setSaved(false)
    try {
      const result = await saveExperienceEntry({ data: editing })
      if (isNew) {
        setEntries([...entries, result])
      } else {
        setEntries(entries.map((e) => (e.id === result.id ? result : e)))
      }
      setEditing(null)
      setIsNew(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await removeExperienceEntry({ data: { id } })
    setEntries(entries.filter((e) => e.id !== id))
    if (editing?.id === id) cancelEdit()
  }

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start) return ''
    return `${start} – ${end ?? 'Present'}`
  }

  // ── Paste import ─────────────────────────────────────────────────

  const handleParsePaste = () => {
    if (!pasteText.trim()) return
    const parsed = parseResumeText(pasteText)
    if (parsed.length === 0) {
      // If auto-detection found nothing, treat entire text as a single entry
      setParsedPreview([{
        ...EMPTY_ENTRY,
        category: pasteCategory,
        description: pasteText.trim(),
      }])
    } else {
      setParsedPreview(parsed)
    }
  }

  const handleConfirmImport = async () => {
    if (!parsedPreview) return
    setSaving(true)
    setImportProgress({ current: 0, total: parsedPreview.length })
    try {
      const imported: ExperienceEntry[] = []
      for (let i = 0; i < parsedPreview.length; i++) {
        const result = await saveExperienceEntry({ data: parsedPreview[i] })
        imported.push(result)
        setEntries((prev) => [...prev, result])
        setImportProgress({ current: i + 1, total: parsedPreview.length })
      }
      setParsedPreview(null)
      setPasteText('')
      setShowPaste(false)
      setSaved(true)
      setImportProgress(null)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const removeFromPreview = (index: number) => {
    if (!parsedPreview) return
    const updated = parsedPreview.filter((_, i) => i !== index)
    setParsedPreview(updated.length > 0 ? updated : null)
  }

  // ── AI resume parse ─────────────────────────────────────────────

  // Poll for progress while parsing
  useEffect(() => {
    if (!aiParsing) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const progress = await getParseProgress()
        if (progress.step && progress.step !== aiProgressStep) {
          setAiProgressStep(progress.step)
          setAiProgressLog((prev) => {
            if (prev[prev.length - 1] === progress.step) return prev
            return [...prev, progress.step!]
          })
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [aiParsing, aiProgressStep])

  const handleAiParse = async (provider?: 'claude' | 'copilot' | 'local') => {
    // Set the active provider before parsing if specified
    if (provider) {
      const { setAppConfig } = await import('#/lib/config.api.ts')
      await setAppConfig({ data: { key: 'active_provider', value: provider } })
    }

    setAiParsing(true)
    setAiParseError(null)
    setAiParseTime(null)
    setAiProgressStep(null)
    setAiProgressLog([])
    try {
      const resumeNames = selectedResumes.size > 0 ? Array.from(selectedResumes) : undefined
      const result = await parseResumesWithLlm({ data: { resumeNames } })
      setAiParseTime(result.generationTime)
      setParsedPreview(result.entries)
      setShowResumePicker(false)
    } catch (e) {
      setAiParseError(e instanceof Error ? e.message : 'AI parse failed')
    } finally {
      setAiParsing(false)
      setAiProgressStep(null)
    }
  }

  const anyProviderAvailable = llmConnected || claudeCliAvailable || copilotCliAvailable

  // ── Group entries by category ────────────────────────────────────

  const grouped = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = entries.filter((e) => (e.category ?? 'work') === cat)
      return acc
    },
    {} as Record<ExperienceCategory, ExperienceEntry[]>,
  )

  // ── Render helpers ───────────────────────────────────────────────

  const renderWorkEntry = (entry: ExperienceEntry) => (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[var(--sea-ink)]">{entry.role}</span>
        <span className="text-[var(--sea-ink-soft)]">at</span>
        <span className="font-medium text-[var(--sea-ink)]">{entry.company}</span>
      </div>
      {(entry.startDate || entry.endDate) && (
        <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
          {formatDateRange(entry.startDate, entry.endDate)}
        </div>
      )}
      {entry.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.skills.map((s) => (
            <span key={s} className="rounded-full bg-[var(--lagoon)]/10 px-2 py-0.5 text-xs font-medium text-[var(--lagoon)]">
              {s}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id!)}
        className="mt-2 flex items-center gap-1 text-xs text-[var(--lagoon)] hover:underline"
      >
        {expandedId === entry.id ? (
          <><CaretUp className="h-3 w-3" /> Hide details</>
        ) : (
          <><CaretDown className="h-3 w-3" /> Show details</>
        )}
      </button>
      {expandedId === entry.id && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--sea-ink-soft)]">{entry.description}</p>
      )}
    </div>
  )

  const renderEducationEntry = (entry: ExperienceEntry) => (
    <div className="min-w-0 flex-1">
      <div className="font-medium text-[var(--sea-ink)]">{entry.role}</div>
      <div className="text-sm text-[var(--sea-ink-soft)]">{entry.company}</div>
      {(entry.startDate || entry.endDate) && (
        <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
          {formatDateRange(entry.startDate, entry.endDate)}
        </div>
      )}
      {entry.description && (
        <>
          <button
            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id!)}
            className="mt-1 flex items-center gap-1 text-xs text-[#6366f1] hover:underline"
          >
            {expandedId === entry.id ? (
              <><CaretUp className="h-3 w-3" /> Hide details</>
            ) : (
              <><CaretDown className="h-3 w-3" /> Show details</>
            )}
          </button>
          {expandedId === entry.id && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--sea-ink-soft)]">{entry.description}</p>
          )}
        </>
      )}
    </div>
  )

  const renderPublicationEntry = (entry: ExperienceEntry) => (
    <div className="min-w-0 flex-1">
      <p className="text-sm text-[var(--sea-ink)]">{entry.description}</p>
    </div>
  )

  const renderProjectEntry = (entry: ExperienceEntry) => (
    <div className="min-w-0 flex-1">
      <div className="font-medium text-[var(--sea-ink)]">{entry.role || entry.company}</div>
      {entry.company && entry.role && (
        <div className="text-sm text-[var(--sea-ink-soft)]">{entry.company}</div>
      )}
      {entry.skills.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {entry.skills.map((s) => (
            <span key={s} className="rounded-full bg-[#f59e0b]/10 px-2 py-0.5 text-xs font-medium text-[#f59e0b]">
              {s}
            </span>
          ))}
        </div>
      )}
      {entry.description && (
        <>
          <button
            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id!)}
            className="mt-1 flex items-center gap-1 text-xs text-[#f59e0b] hover:underline"
          >
            {expandedId === entry.id ? (
              <><CaretUp className="h-3 w-3" /> Hide</>
            ) : (
              <><CaretDown className="h-3 w-3" /> Details</>
            )}
          </button>
          {expandedId === entry.id && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--sea-ink-soft)]">{entry.description}</p>
          )}
        </>
      )}
    </div>
  )

  const renderEntry = (entry: ExperienceEntry) => {
    switch (entry.category) {
      case 'education': return renderEducationEntry(entry)
      case 'publication': return renderPublicationEntry(entry)
      case 'project': return renderProjectEntry(entry)
      default: return renderWorkEntry(entry)
    }
  }

  // ── Determine which fields the edit form should show ──────────

  const editingIsPublication = editing?.category === 'publication'
  const editingIsEducation = editing?.category === 'education'

  return (
    <section className="island-shell mb-6 mt-6 rounded-2xl p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <Briefcase className="h-5 w-5 text-[var(--lagoon)]" />
        Experience Profile
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Your work experience, education, projects, and publications. The LLM uses this to generate tailored resumes.
      </p>

      {/* ── Category sections ─────────────────────────────────── */}
      {CATEGORY_ORDER.map((cat) => {
        const config = CATEGORY_CONFIG[cat]
        const Icon = config.icon
        const catEntries = grouped[cat]
        if (catEntries.length === 0) return null

        return (
          <div key={cat} className="mb-5">
            <h3
              className="mb-2 flex items-center gap-2 text-sm font-semibold"
              style={{ color: config.color }}
            >
              <Icon className="h-4 w-4" />
              {config.label}
            </h3>
            <div className="space-y-2">
              {catEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start gap-3">
                    {renderEntry(entry)}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => startEdit(entry)}
                        className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
                      >
                        <PencilSimple className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id!)}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-50"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* ── Action buttons ────────────────────────────────────── */}
      {!editing && !parsedPreview && !showPaste && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {CATEGORY_ORDER.map((cat) => {
            const config = CATEGORY_CONFIG[cat]
            const Icon = config.icon
            return (
              <button
                key={cat}
                onClick={() => startAdd(cat)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:border-[var(--lagoon)] hover:text-[var(--lagoon)]"
              >
                <Plus className="h-3.5 w-3.5" />
                <Icon className="h-3.5 w-3.5" />
                {config.label}
              </button>
            )
          })}
          <button
            onClick={() => setShowPaste(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--lagoon)]/30 bg-[var(--lagoon)]/5 px-4 py-2 text-sm font-medium text-[var(--lagoon)] transition hover:bg-[var(--lagoon)]/10"
          >
            <ClipboardText className="h-4 w-4" />
            Paste from Resume
          </button>

          {/* AI Parse — opens resume picker */}
          {hasResumes && anyProviderAvailable && (
            <button
              onClick={() => { setShowResumePicker(!showResumePicker); setSelectedResumes(new Set()) }}
              disabled={aiParsing}
              className="flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-500/20 disabled:opacity-40"
            >
              <Robot className="h-4 w-4" />
              Parse with AI
            </button>
          )}
          {!hasResumes && (
            <span className="text-xs text-[var(--sea-ink-soft)] italic">Upload a resume to enable AI parsing</span>
          )}
          {hasResumes && !anyProviderAvailable && (
            <span className="text-xs text-[var(--sea-ink-soft)] italic">Set up an AI provider above to enable parsing</span>
          )}
        </div>
      )}

      {/* ── Resume picker + provider selection ───────────────── */}
      {showResumePicker && !aiParsing && !parsedPreview && (
        <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              Select resumes to parse
            </h3>
            <button
              onClick={() => setShowResumePicker(false)}
              className="text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-[var(--sea-ink-soft)]">
            Pick which resumes to extract experience from. Select multiple to combine entries from different resumes into one profile.
            {selectedResumes.size === 0 && ' Leave all unchecked to parse all resumes.'}
          </p>
          <div className="space-y-1.5">
            {resumes.map((r) => (
              <label key={r.name} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-strong)] transition">
                <input
                  type="checkbox"
                  checked={selectedResumes.has(r.name)}
                  onChange={(e) => {
                    setSelectedResumes((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(r.name)
                      else next.delete(r.name)
                      return next
                    })
                  }}
                  className="h-4 w-4 rounded border-[var(--line)] text-purple-600 focus:ring-purple-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--sea-ink)]">
                    {r.originalName}
                    {r.isPrimary && (
                      <span className="rounded-full bg-[var(--lagoon)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--lagoon)]">
                        Primary
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-medium text-[var(--sea-ink-soft)] mr-1">Parse with:</span>
            {claudeCliAvailable && (
              <button
                onClick={() => handleAiParse('claude')}
                className="flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-500/20"
              >
                <Robot className="h-3.5 w-3.5" />
                Claude
              </button>
            )}
            {copilotCliAvailable && (
              <button
                onClick={() => handleAiParse('copilot')}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-500/20"
              >
                <Robot className="h-3.5 w-3.5" />
                Copilot
              </button>
            )}
            {llmConnected && (
              <button
                onClick={() => handleAiParse('local')}
                className="flex items-center gap-1.5 rounded-lg bg-gray-500/10 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-500/20"
              >
                <Cpu className="h-3.5 w-3.5" />
                Local LLM
              </button>
            )}
            <span className="text-[10px] text-[var(--sea-ink-soft)]">
              {selectedResumes.size === 0 ? `All ${resumes.length} resumes` : `${selectedResumes.size} selected`}
            </span>
          </div>
        </div>
      )}

      {/* AI parse progress */}
      {aiParsing && aiProgressLog.length > 0 && (
        <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-purple-700">
            <CircleNotch className="h-3.5 w-3.5 animate-spin" />
            Parsing with AI...
          </div>
          <div className="space-y-1">
            {aiProgressLog.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {i < aiProgressLog.length - 1 ? (
                  <CheckCircle className="h-3 w-3 shrink-0 text-green-600" />
                ) : (
                  <CircleNotch className="h-3 w-3 shrink-0 animate-spin text-purple-500" />
                )}
                <span className={i < aiProgressLog.length - 1 ? 'text-[var(--sea-ink-soft)]' : 'text-[var(--sea-ink)]'}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI parse error */}
      {aiParseError && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{aiParseError}</div>
      )}
      {aiParseTime && !parsedPreview && (
        <div className="mt-2 text-xs text-[var(--sea-ink-soft)]">
          Parsed in {aiParseTime.toFixed(1)}s
        </div>
      )}

      {/* ── Paste import panel ────────────────────────────────── */}
      {showPaste && !parsedPreview && (
        <div className="mt-4 space-y-3 rounded-xl border border-[var(--lagoon)]/30 bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              Paste from Resume
            </h3>
            <button
              onClick={() => { setShowPaste(false); setPasteText('') }}
              className="text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-[var(--sea-ink-soft)]">
            Paste your resume text below. Section headers like "Experience", "Education", "Publications" are auto-detected.
            Or select a category and paste a single section.
          </p>
          <div className="flex gap-2">
            {CATEGORY_ORDER.map((cat) => {
              const config = CATEGORY_CONFIG[cat]
              return (
                <button
                  key={cat}
                  onClick={() => setPasteCategory(cat)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    pasteCategory === cat
                      ? 'bg-[var(--lagoon)] text-white'
                      : 'border border-[var(--line)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]'
                  }`}
                >
                  {config.label}
                </button>
              )
            })}
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`Paste your resume text here...\n\nSection headers like "Work Experience", "Education", "Publications" will be auto-detected.\nEntries are split on blank lines.`}
            rows={12}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={handleParsePaste}
            disabled={!pasteText.trim()}
            className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Preview Entries
          </button>
        </div>
      )}

      {/* ── Parsed preview ────────────────────────────────────── */}
      {parsedPreview && (
        <div className="mt-4 space-y-3 rounded-xl border border-[var(--lagoon)]/30 bg-[var(--lagoon)]/5 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              Preview: {parsedPreview.length} {parsedPreview.length === 1 ? 'entry' : 'entries'} detected
            </h3>
            <button
              onClick={() => setParsedPreview(null)}
              className="text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {parsedPreview.map((entry, i) => {
              const config = CATEGORY_CONFIG[entry.category ?? 'work']
              const Icon = config.icon
              return (
                <div key={i} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                        <span className="text-xs font-medium" style={{ color: config.color }}>
                          {config.label}
                        </span>
                      </div>
                      {entry.category === 'publication' ? (
                        <p className="text-sm text-[var(--sea-ink)]">{entry.description}</p>
                      ) : (
                        <>
                          {entry.role && <div className="font-medium text-[var(--sea-ink)]">{entry.role}</div>}
                          {entry.company && <div className="text-sm text-[var(--sea-ink-soft)]">{entry.company}</div>}
                          {entry.description && (
                            <p className="mt-1 line-clamp-3 text-xs text-[var(--sea-ink-soft)]">{entry.description}</p>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromPreview(i)}
                      className="shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-50"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirmImport}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <CircleNotch className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {saving && importProgress
                ? `Importing ${importProgress.current}/${importProgress.total}...`
                : 'Import All'}
            </button>
            <button
              onClick={() => setParsedPreview(null)}
              className="text-sm text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Edit/Add form ─────────────────────────────────────── */}
      {editing && (
        <div className="mt-4 space-y-4 rounded-xl border border-[var(--lagoon)]/30 bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              {isNew ? `Add ${CATEGORY_CONFIG[editing.category].label}` : `Edit ${CATEGORY_CONFIG[editing.category].label}`}
            </h3>
            <button onClick={cancelEdit} className="text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Category selector (only when adding new) */}
          {isNew && (
            <div className="flex gap-2">
              {CATEGORY_ORDER.map((cat) => {
                const config = CATEGORY_CONFIG[cat]
                return (
                  <button
                    key={cat}
                    onClick={() => setEditing({ ...editing, category: cat })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      editing.category === cat
                        ? 'bg-[var(--lagoon)] text-white'
                        : 'border border-[var(--line)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]'
                    }`}
                  >
                    {config.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Publication form — just description */}
          {editingIsPublication ? (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Publication Citation
              </label>
              <textarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="e.g. IEEE RO-MAN 2021: A Meta-Analysis of Human and Robot Personality..."
                rows={3}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <>
              {/* Company + Role */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    {editingIsEducation ? 'Institution' : 'Company'}
                  </label>
                  <input
                    value={editing.company}
                    onChange={(e) => setEditing({ ...editing, company: e.target.value })}
                    placeholder={editingIsEducation ? 'University of Michigan' : 'Acme Corp'}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    {editingIsEducation ? 'Degree' : 'Role'}
                  </label>
                  <input
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    placeholder={editingIsEducation ? 'B.S. Computer Science' : 'Senior Software Engineer'}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Start Date
                  </label>
                  <input
                    type="month"
                    value={editing.startDate ?? ''}
                    onChange={(e) => setEditing({ ...editing, startDate: e.target.value || null })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    End Date
                    <label className="flex items-center gap-1 normal-case tracking-normal">
                      <input
                        type="checkbox"
                        checked={editing.endDate === null}
                        onChange={(e) =>
                          setEditing({ ...editing, endDate: e.target.checked ? null : '' })
                        }
                        className="h-3 w-3"
                      />
                      <span className="text-xs">Current</span>
                    </label>
                  </label>
                  {editing.endDate !== null ? (
                    <input
                      type="month"
                      value={editing.endDate ?? ''}
                      onChange={(e) => setEditing({ ...editing, endDate: e.target.value || null })}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
                    />
                  ) : (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink-soft)]">
                      Present
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  {editingIsEducation ? 'Details' : 'Technical Description'}
                </label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder={editingIsEducation
                    ? 'Relevant coursework, honors, activities...'
                    : 'Describe what you built, technologies used, impact, quantified achievements...'}
                  rows={8}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
                  Be detailed — the LLM will draw from this to craft tailored resumes.
                </p>
              </div>

              {/* Skills (work + project only) */}
              {(editing.category === 'work' || editing.category === 'project') && (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Skills & Technologies
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {editing.skills.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--lagoon)]/10 px-2.5 py-1 text-xs font-medium text-[var(--lagoon)]"
                      >
                        {s}
                        <button onClick={() => removeSkill(s)} className="hover:text-[var(--sea-ink)]">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                      placeholder="e.g. React, PostgreSQL, Kubernetes..."
                      className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
                    />
                    <button
                      onClick={addSkill}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface-strong)]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || (editingIsPublication
              ? !editing.description.trim()
              : !editing.company.trim() || !editing.role.trim() || !editing.description.trim()
            )}
            className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <CircleNotch className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : null}
            {saving ? 'Saving...' : isNew ? 'Add Entry' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Saved toast */}
      {saved && !editing && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Experience saved
        </div>
      )}
    </section>
  )
}
