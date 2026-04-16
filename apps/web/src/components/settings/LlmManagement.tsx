import { useCallback, useEffect, useState } from 'react'
import { ArrowSquareOut, CheckCircle, CircleNotch, DownloadSimple, Trash, Cpu, Terminal } from '@phosphor-icons/react'
import { getLlmModels, switchLlmModel, deleteLlmModel } from '#/lib/llm.api.ts'
import { setAppConfig } from '#/lib/config.api.ts'
import { ProgressBar } from '#/components/ui/index.ts'
import { TestChat } from './TestChat.tsx'

const MODEL_HF_URLS: Record<string, string> = {
  '1b': 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF',
  '3b': 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
  '7b': 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
}

export interface ModelInfo {
  id: string
  name: string
  size_gb: number
  downloaded: boolean
  active: boolean
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error' | 'unavailable'
  download_progress: number
  current_step: string
  error?: string | null
  provider?: string
  context_window?: number
  cli?: boolean
}

export function LlmManagement({
  initialStatus,
  initialModels,
}: {
  initialStatus: { connected: boolean; status: string }
  initialModels: { models: ModelInfo[]; current_model: string | null }
}) {
  const [models, setModels] = useState<ModelInfo[]>(initialModels.models)
  const [connected, setConnected] = useState(initialStatus.connected)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeCliModel, setActiveCliModel] = useState<string | null>(null)

  const localModels = models.filter((m) => !m.cli)
  const cliModels = models.filter((m) => m.cli)

  // Poll when any model is downloading or loading
  useEffect(() => {
    const isActive = models.some((m) => m.status === 'downloading' || m.status === 'loading')
    if (!isActive) return
    const interval = setInterval(async () => {
      try {
        const res = await getLlmModels()
        setModels(res.models)
      } catch {
        // ignore polling errors
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [models])

  const handleSwitch = useCallback(async (modelId: string) => {
    setError(null)
    setSwitching(modelId)
    try {
      await switchLlmModel({ data: { modelId } })
      const res = await getLlmModels()
      setModels(res.models)
      setConnected(true)
      // Set as active local provider
      await setAppConfig({ data: { key: 'active_provider', value: 'local' } })
      await setAppConfig({ data: { key: 'active_model_id', value: modelId } })
      setActiveCliModel(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch model')
    } finally {
      setSwitching(null)
    }
  }, [])

  const handleSelectCliModel = useCallback(async (modelId: string) => {
    setError(null)
    try {
      await setAppConfig({ data: { key: 'active_provider', value: 'claude' } })
      await setAppConfig({ data: { key: 'active_model_id', value: modelId } })
      setActiveCliModel(modelId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to select CLI model')
    }
  }, [])

  const handleDelete = useCallback(async (modelId: string) => {
    setError(null)
    try {
      await deleteLlmModel({ data: { modelId } })
      const res = await getLlmModels()
      setModels(res.models)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete model')
    }
  }, [])

  return (
    <section className="mt-6 island-shell rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
          <Cpu className="h-5 w-5 text-[var(--lagoon)]" />
          LLM Management
        </h2>
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-[var(--sea-ink-soft)]">{connected ? 'Service connected' : 'Service unreachable'}</span>
        </span>
      </div>

      {/* Local Models Section */}
      {localModels.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold text-[var(--sea-ink)]">Local Models</h3>
          <p className="mb-3 text-xs text-[var(--sea-ink-soft)]">
            Self-hosted models via{' '}
            <a href="https://ai.meta.com/llama/" target="_blank" rel="noopener noreferrer" className="text-[var(--lagoon-deep)] hover:underline">
              Meta Llama <ArrowSquareOut className="mb-0.5 inline h-3 w-3" />
            </a>
            . Stored in Docker volume <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">llm-models</code>.
          </p>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {localModels.map((model) => (
              <LocalModelCard
                key={model.id}
                model={model}
                switching={switching}
                onSwitch={handleSwitch}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}

      {/* CLI Models Section */}
      {cliModels.length > 0 && (
        <>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--sea-ink)]">
            <Terminal className="h-4 w-4" />
            Claude CLI Models
          </h3>
          <p className="mb-3 text-xs text-[var(--sea-ink-soft)]">
            Uses the Claude CLI — no download needed. Billing through your CLI subscription.
          </p>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {cliModels.map((model) => (
              <CliModelCard
                key={model.id}
                model={model}
                isActive={activeCliModel === model.id}
                onSelect={handleSelectCliModel}
              />
            ))}
          </div>
        </>
      )}

      {models.length === 0 && (
        <p className="text-sm text-[var(--sea-ink-soft)]">
          No models available. Make sure the LLM service is running.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* Chat test panel */}
      {(models.some((m) => m.active && m.status === 'ready') || activeCliModel) && (
        <TestChat activeModelName={activeCliModel ? cliModels.find((m) => m.id === activeCliModel)?.name : localModels.find((m) => m.active)?.name} />
      )}
    </section>
  )
}

function LocalModelCard({
  model,
  switching,
  onSwitch,
  onDelete,
}: {
  model: ModelInfo
  switching: string | null
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        model.active
          ? 'border-[var(--lagoon)] bg-[var(--lagoon)]/5'
          : 'border-[var(--line)] bg-[var(--surface)]'
      }`}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="font-medium text-[var(--sea-ink)]">{model.name}</span>
        {MODEL_HF_URLS[model.id] && (
          <a
            href={MODEL_HF_URLS[model.id]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--sea-ink-soft)] hover:text-[var(--lagoon-deep)]"
            title="View on HuggingFace"
          >
            <ArrowSquareOut className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <div className="mb-3 text-xs text-[var(--sea-ink-soft)]">{model.size_gb} GB</div>

      <ModelStatusBadge model={model} />

      {model.status === 'downloading' && (
        <div className="mb-3">
          <ProgressBar current={model.download_progress} total={100} label="Downloading..." />
        </div>
      )}

      <div className="flex gap-2">
        {model.active ? null : (
          <button
            onClick={() => onSwitch(model.id)}
            disabled={switching !== null || model.status === 'downloading' || model.status === 'loading'}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--lagoon-deep)] disabled:opacity-50"
          >
            {switching === model.id ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : model.downloaded ? (
              'Activate'
            ) : (
              <>
                <DownloadSimple className="h-4 w-4" />
                Download & Activate
              </>
            )}
          </button>
        )}
        {model.downloaded && (
          <button
            onClick={() => onDelete(model.id)}
            disabled={switching !== null || model.status === 'downloading' || model.status === 'loading'}
            className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
            title="Delete model"
          >
            <Trash className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function CliModelCard({
  model,
  isActive,
  onSelect,
}: {
  model: ModelInfo
  isActive: boolean
  onSelect: (id: string) => void
}) {
  const available = model.status !== 'unavailable'
  const contextK = model.context_window ? `${Math.round(model.context_window / 1000)}K` : ''

  return (
    <div
      className={`rounded-xl border p-4 ${
        isActive
          ? 'border-[var(--lagoon)] bg-[var(--lagoon)]/5'
          : 'border-[var(--line)] bg-[var(--surface)]'
      }`}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="font-medium text-[var(--sea-ink)]">{model.name}</span>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">CLI</span>
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
        {contextK && <span>{contextK} context</span>}
      </div>

      <div className="mb-3">
        {isActive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle className="h-3 w-3" /> Selected
          </span>
        ) : available ? (
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            Available
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
            CLI not configured
          </span>
        )}
      </div>

      {!isActive && available && (
        <button
          onClick={() => onSelect(model.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--lagoon-deep)]"
        >
          <Terminal className="h-4 w-4" />
          Select
        </button>
      )}
    </div>
  )
}

function ModelStatusBadge({ model }: { model: ModelInfo }) {
  return (
    <div className="mb-3">
      {model.status === 'ready' && model.active && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          <CheckCircle className="h-3 w-3" /> Active
        </span>
      )}
      {model.status === 'ready' && !model.active && (
        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          Downloaded
        </span>
      )}
      {model.status === 'idle' && (
        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          Not downloaded
        </span>
      )}
      {model.status === 'downloading' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          <CircleNotch className="h-3 w-3 animate-spin" /> Downloading
        </span>
      )}
      {model.status === 'loading' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          <CircleNotch className="h-3 w-3 animate-spin" /> Loading...
        </span>
      )}
      {model.status === 'error' && (
        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Error
        </span>
      )}
    </div>
  )
}
