import { useState } from 'react'
import { Question, CheckCircle, CircleNotch } from '@phosphor-icons/react'
import type { FormQuestion } from '#/lib/questions.api.ts'
import { answerQuestion } from '#/lib/questions.api.ts'

export function UnansweredQuestions({ questions: initialQuestions }: { questions: FormQuestion[] }) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [saving, setSaving] = useState(false)

  if (questions.length === 0) return null

  const handleSaveAnswer = async (id: number) => {
    if (!answerText.trim()) return
    setSaving(true)
    try {
      await answerQuestion({ data: { id, answer: answerText.trim() } })
      setQuestions((prev) => prev.filter((q) => q.id !== id))
      setEditingId(null)
      setAnswerText('')
    } catch (err) {
      console.error('Failed to save answer:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="island-shell mb-8 rounded-xl p-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
        <Question className="h-5 w-5 text-yellow-600" />
        Unanswered Questions
        <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-700">
          {questions.length}
        </span>
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        These questions appeared in applications but couldn't be auto-filled. Provide answers to improve future auto-apply.
      </p>
      <div className="space-y-2">
        {questions.map((q) => (
          <div key={q.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-[var(--sea-ink)]">{q.questionText}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
                  <span className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 font-medium uppercase">
                    {q.fieldType}
                  </span>
                  <span>{q.platform}</span>
                  <span>seen {q.occurrences}x</span>
                </div>
                {q.options && (
                  <div className="mt-1 text-xs text-[var(--sea-ink-soft)]">
                    Options: {JSON.parse(q.options).join(', ')}
                  </div>
                )}
              </div>
              {editingId !== q.id ? (
                <button
                  onClick={() => { setEditingId(q.id); setAnswerText('') }}
                  className="shrink-0 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)]"
                >
                  Answer
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveAnswer(q.id)}
                    placeholder="Your answer..."
                    autoFocus
                    className="w-48 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none"
                  />
                  <button
                    onClick={() => handleSaveAnswer(q.id)}
                    disabled={saving || !answerText.trim()}
                    className="flex items-center gap-1 rounded-full bg-[var(--lagoon)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? <CircleNotch className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setAnswerText('') }}
                    className="text-xs text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
