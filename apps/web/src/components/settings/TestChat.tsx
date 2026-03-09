import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChatCircle,
  CircleNotch,
  PaperPlaneTilt,
  FileText,
  CheckCircle,
  X,
  Plus,
} from '@phosphor-icons/react'
import { chatWithLlm } from '#/lib/llm.api.ts'
import { getAllDocuments } from '#/lib/resume.api.ts'

type ChatMessage = { role: 'user' | 'assistant'; text: string; time?: number }

type DocSummary = {
  name: string
  originalName: string
  category: string
  hasText: boolean
  embedded: boolean
}

export function TestChat({ activeModelName }: { activeModelName?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Document attachment
  const [attachedDocs, setAttachedDocs] = useState<DocSummary[]>([])
  const [availableDocs, setAvailableDocs] = useState<DocSummary[]>([])
  const [showDocPicker, setShowDocPicker] = useState(false)
  const [docsLoaded, setDocsLoaded] = useState(false)

  const loadDocs = useCallback(async () => {
    try {
      const docs = await getAllDocuments()
      setAvailableDocs(docs)
      setDocsLoaded(true)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (showDocPicker && !docsLoaded) loadDocs()
  }, [showDocPicker, docsLoaded, loadDocs])

  const toggleDoc = useCallback(
    (doc: DocSummary) => {
      setAttachedDocs((prev) => {
        const exists = prev.some((d) => d.name === doc.name)
        return exists ? prev.filter((d) => d.name !== doc.name) : [...prev, doc]
      })
    },
    [],
  )

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', text: msg }])
    setLoading(true)
    try {
      const documentNames = attachedDocs.map((d) => d.name)
      const res = await chatWithLlm({ data: { message: msg, documentNames: documentNames.length > 0 ? documentNames : undefined } })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: res.response, time: res.generationTime },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get response')
    } finally {
      setLoading(false)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [input, loading, attachedDocs])

  const unattachedDocs = availableDocs.filter(
    (d) => d.hasText && !attachedDocs.some((a) => a.name === d.name),
  )

  return (
    <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <ChatCircle className="h-4 w-4 text-[var(--lagoon)]" />
        <span className="text-sm font-medium text-[var(--sea-ink)]">Test Chat</span>
        {activeModelName && (
          <span className="ml-auto text-xs text-[var(--sea-ink-soft)]">{activeModelName}</span>
        )}
      </div>

      {/* Attached documents bar */}
      {attachedDocs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--line)] px-4 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
            Context:
          </span>
          {attachedDocs.map((doc) => (
            <span
              key={doc.name}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--lagoon)]/10 px-2 py-0.5 text-xs font-medium text-[var(--lagoon-deep)]"
            >
              <FileText className="h-3 w-3" />
              {doc.originalName}
              <button
                onClick={() => toggleDoc(doc)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--lagoon)]/20"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex h-64 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="m-auto text-center text-xs text-[var(--sea-ink-soft)]">
            {attachedDocs.length > 0
              ? 'Ask a question about your attached documents'
              : 'Send a message to test the active model'}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-[var(--lagoon)] text-white'
                  : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)]'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.time !== undefined && (
                <p className="mt-1 text-right text-[10px] opacity-60">{m.time}s</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink-soft)]">
              <CircleNotch className="h-3.5 w-3.5 animate-spin" /> Thinking...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Document picker dropdown */}
      {showDocPicker && (
        <div className="mx-4 mb-2 rounded-lg border border-[var(--line)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <span className="text-xs font-medium text-[var(--sea-ink)]">Attach Documents</span>
            <button
              onClick={() => setShowDocPicker(false)}
              className="rounded p-0.5 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {!docsLoaded ? (
              <div className="flex items-center justify-center py-4">
                <CircleNotch className="h-4 w-4 animate-spin text-[var(--sea-ink-soft)]" />
              </div>
            ) : availableDocs.filter((d) => d.hasText).length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-[var(--sea-ink-soft)]">
                No documents with extracted text available.
              </p>
            ) : (
              availableDocs
                .filter((d) => d.hasText)
                .map((doc) => {
                  const isAttached = attachedDocs.some((a) => a.name === doc.name)
                  return (
                    <button
                      key={doc.name}
                      onClick={() => toggleDoc(doc)}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                        isAttached
                          ? 'bg-[var(--lagoon)]/10 text-[var(--lagoon-deep)]'
                          : 'text-[var(--sea-ink)] hover:bg-gray-50'
                      }`}
                    >
                      {isAttached ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-[var(--lagoon)]" weight="fill" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-[var(--sea-ink-soft)]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{doc.originalName}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--sea-ink-soft)]">
                          <span className="capitalize">{doc.category}</span>
                          {doc.embedded && (
                            <span className="inline-flex items-center gap-0.5 text-green-600">
                              <CheckCircle className="h-2.5 w-2.5" /> embedded
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-[var(--line)] px-4 py-3">
        <button
          onClick={() => {
            setShowDocPicker((v) => !v)
          }}
          className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
            attachedDocs.length > 0
              ? 'border-[var(--lagoon)] bg-[var(--lagoon)]/10 text-[var(--lagoon-deep)]'
              : 'border-[var(--line)] text-[var(--sea-ink-soft)] hover:border-[var(--lagoon)] hover:text-[var(--lagoon)]'
          }`}
          title="Attach documents"
        >
          <Plus className="h-3.5 w-3.5" />
          <FileText className="h-3.5 w-3.5" />
          {attachedDocs.length > 0 && <span>{attachedDocs.length}</span>}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={
            attachedDocs.length > 0
              ? 'Ask about your documents...'
              : 'Type a message...'
          }
          disabled={loading}
          className="flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)]/40 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--lagoon-deep)] disabled:opacity-50"
        >
          <PaperPlaneTilt className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
