import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import {
  BookOpen, ChevronDown, ChevronUp, ExternalLink, Copy, CheckCircle,
  Table, Mail, Key, Link2, Unlink, Loader2,
} from 'lucide-react'
import { getGmailStatus } from '#/lib/gmail.api.ts'
import { getSheetsStatus, setSheetsUrl, removeSheetsUrl } from '#/lib/sheets.api.ts'
import { requireAuth } from '#/lib/auth-guard.ts'

export const Route = createFileRoute('/setup')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [gmailStatus, sheetsStatus] = await Promise.all([
      getGmailStatus(),
      getSheetsStatus(),
    ])
    return { gmailStatus, sheetsStatus }
  },
  component: Setup,
})

// --- Step definitions ---

interface Step {
  title: string
  description: React.ReactNode
  image: string
  link?: string
}

const OAUTH_STEPS: Step[] = [
  {
    title: 'Create a Google Cloud Project',
    description:
      'Go to the Google Cloud Console and click "Create project" in the top right.',
    image: '/setup/0-create-gcp-project.png',
    link: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    title: 'Name your project',
    description:
      'Give it any name you like (e.g. "job-bot"). Leave the organization as "No organization" and click Create.',
    image: '/setup/1-project-name.png',
  },
  {
    title: 'Configure the OAuth consent screen',
    description:
      'After your project is created, you\'ll see a banner prompting you to configure the OAuth consent screen. Click "Configure consent screen".',
    image: '/setup/2-configure-consent-screen.png',
  },
  {
    title: 'Fill in consent screen details',
    description:
      'Enter an app name (e.g. "job-bot"), select your email as the support email, then click Next through the remaining steps (Audience, Contact Info) and click Create.',
    image: '/setup/3-consent-screen-details.png',
  },
  {
    title: 'Create an OAuth client',
    description:
      'From the OAuth Overview page, click "Create OAuth client". Select "Web application" as the application type.',
    image: '/setup/4-create-OAuth-client.png',
  },
  {
    title: 'Configure the OAuth client',
    description: (
      <>
        Leave <strong>Authorized JavaScript origins</strong> blank. Under{' '}
        <strong>Authorized redirect URIs</strong>, click "+ Add URI" and enter:
        <code className="my-2 block rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
          http://localhost:3000/auth/callback
        </code>
        Then click Create.
      </>
    ),
    image: '/setup/5-OAuth-client-details.png',
  },
  {
    title: 'Copy your credentials',
    description: (
      <>
        Google will show your <strong>Client ID</strong> and{' '}
        <strong>Client secret</strong>. Copy both values — you&apos;ll need them for your{' '}
        <code>.env</code> file.
      </>
    ),
    image: '/setup/6-copy-OAuth-credentials.png',
  },
]

const GMAIL_STEPS: Step[] = [
  {
    title: 'Search for Gmail API',
    description:
      'In your GCP project, search for "Gmail" in the top search bar to find the Gmail API.',
    image: '/setup/gmail/00-gmail-search-in-gcp.png',
    link: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  },
  {
    title: 'Enable the Gmail API',
    description:
      'Click the "Enable" button to activate the Gmail API for your project. This is required for email scanning.',
    image: '/setup/gmail/0.1-enable-gmail-api.png',
  },
  {
    title: 'Add yourself as a test user',
    description: (
      <>
        Go to <strong>Google Auth Platform &rarr; Audience</strong>. Under{' '}
        <strong>Test users</strong>, click <strong>Add users</strong> and enter your Gmail
        address. This is required because the app is in &ldquo;Testing&rdquo; mode.
      </>
    ),
    image: '/setup/gmail/7-audience.png',
    link: 'https://console.cloud.google.com/auth/audience',
  },
  {
    title: 'Add test user email',
    description:
      'Enter the Gmail address you want to connect (the same one you used to create the project works fine), then save.',
    image: '/setup/gmail/8-set-testers.png',
  },
  {
    title: 'Connect Gmail from the app',
    description: (
      <>
        After adding your credentials to <code>.env</code> and restarting the dev server,
        go to the <strong>Email Scanner</strong> page and click{' '}
        <strong>Connect Gmail</strong>.
      </>
    ),
    image: '/setup/gmail/9-connect-gmail.png',
  },
  {
    title: 'Sign in with Google',
    description:
      'You\'ll be redirected to Google\'s sign-in page. Select your account and grant read-only access to Gmail and Sheets.',
    image: '/setup/gmail/10-sign-in.png',
  },
  {
    title: 'Scan your emails',
    description:
      'Once connected, you can scan for rejection and interview emails across all companies in your spreadsheet.',
    image: '/setup/gmail/11-scan-emails.png',
  },
]

const SHEETS_STEPS: Step[] = [
  {
    title: 'Search for Google Sheets API',
    description:
      'In your GCP project, search for "Google Sheets API" in the top search bar.',
    image: '/setup/sheets/0-google-sheets-search.png',
    link: 'https://console.cloud.google.com/apis/library/sheets.googleapis.com',
  },
  {
    title: 'Enable the Google Sheets API',
    description:
      'Click the "Enable" button to activate the Sheets API for your project.',
    image: '/setup/sheets/1-enable-google-sheets-api.png',
  },
]

// --- Components ---

function Setup() {
  const { gmailStatus, sheetsStatus } = Route.useLoaderData()

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <BookOpen className="h-6 w-6 text-[var(--lagoon)]" />
        Setup Guide
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        Connect your Google account to scan Gmail for emails and read job data from Google Sheets.
      </p>

      {/* Section 1: OAuth Credentials */}
      <SetupSection
        icon={<Key className="h-5 w-5 text-[var(--lagoon)]" />}
        title="1. Google OAuth Credentials"
        subtitle="Create a GCP project and OAuth client to authenticate with Google APIs."
        status={gmailStatus.configured ? 'done' : 'pending'}
        statusText={gmailStatus.configured ? 'Configured' : 'Not configured'}
        steps={OAUTH_STEPS}
      />

      {/* Env file */}
      <section className="mt-4 island-shell rounded-2xl p-6">
        <h3 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">
          Add credentials to your .env file
        </h3>
        <p className="mb-3 text-sm text-[var(--sea-ink-soft)]">
          Create a <code>.env</code> file in the <code>app/</code> directory (copy from{' '}
          <code>.env.example</code>) and paste your credentials:
        </p>
        <EnvBlock />
        <p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
          After saving, restart the dev server.
        </p>
      </section>

      {/* Section 2: Gmail Connection */}
      <div className="mt-8">
        <SetupSection
          icon={<Mail className="h-5 w-5 text-[var(--lagoon)]" />}
          title="2. Connect Gmail"
          subtitle="Add yourself as a test user and connect your Gmail account for email scanning."
          status={gmailStatus.connected ? 'done' : gmailStatus.configured ? 'ready' : 'pending'}
          statusText={
            gmailStatus.connected
              ? 'Connected'
              : gmailStatus.configured
                ? 'Ready to connect'
                : 'Needs OAuth credentials first'
          }
          steps={GMAIL_STEPS}
        />
      </div>

      {/* Section 3: Google Sheets */}
      <div className="mt-8">
        <SetupSection
          icon={<Table className="h-5 w-5 text-[var(--lagoon)]" />}
          title="3. Google Sheets"
          subtitle="Enable the Sheets API and connect your job tracking spreadsheet."
          status={sheetsStatus.configured ? 'done' : 'pending'}
          statusText={sheetsStatus.configured ? 'Sheet connected' : 'No sheet configured'}
          steps={SHEETS_STEPS}
        />
      </div>

      {/* Sheet URL input */}
      <div className="mt-4">
        <SheetUrlConfig
          initialUrl={sheetsStatus.sheetUrl}
          authenticated={sheetsStatus.authenticated}
        />
      </div>
    </main>
  )
}

function SetupSection({
  icon,
  title,
  subtitle,
  status,
  statusText,
  steps,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  status: 'done' | 'ready' | 'pending'
  statusText: string
  steps: Step[]
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  const statusColors = {
    done: 'bg-green-500/10 text-green-700',
    ready: 'bg-blue-500/10 text-blue-700',
    pending: 'bg-amber-500/10 text-amber-700',
  }

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {icon}
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">{title}</h2>
            <p className="text-sm text-[var(--sea-ink-soft)]">{subtitle}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusColors[status]}`}>
          {statusText}
        </span>
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <StepCard
            key={i}
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            image={step.image}
            link={step.link}
            expanded={expandedStep === i}
            onToggle={() => setExpandedStep(expandedStep === i ? null : i)}
          />
        ))}
      </div>
    </div>
  )
}

function StepCard({
  stepNumber,
  title,
  description,
  image,
  link,
  expanded,
  onToggle,
}: {
  stepNumber: number
  title: string
  description: React.ReactNode
  image: string
  link?: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="island-shell overflow-hidden rounded-xl">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lagoon)] text-xs font-bold text-white">
          {stepNumber}
        </span>
        <span className="flex-1 font-semibold text-[var(--sea-ink)]">{title}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--sea-ink-soft)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--line)] p-4">
          <div className="mb-3 text-sm text-[var(--sea-ink-soft)]">{description}</div>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-1.5 text-xs font-medium text-white no-underline transition hover:opacity-90"
            >
              <ExternalLink className="h-3 w-3" />
              Open in Google Cloud
            </a>
          )}
          <img
            src={image}
            alt={`Step ${stepNumber}: ${title}`}
            className="mt-2 w-full rounded-lg border border-[var(--line)] shadow-sm"
          />
        </div>
      )}
    </div>
  )
}

function SheetUrlConfig({
  initialUrl,
  authenticated,
}: {
  initialUrl: string | null
  authenticated: boolean
}) {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [savedUrl, setSavedUrl] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!url.trim()) return
    setSaving(true)
    setError(null)
    try {
      await setSheetsUrl({ data: { url: url.trim() } })
      setSavedUrl(url.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [url])

  const handleDisconnect = useCallback(async () => {
    setSaving(true)
    try {
      await removeSheetsUrl()
      setUrl('')
      setSavedUrl(null)
    } finally {
      setSaving(false)
    }
  }, [])

  return (
    <section className="island-shell rounded-2xl p-6">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
        <Link2 className="h-4 w-4 text-[var(--lagoon)]" />
        Google Sheet URL
      </h3>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Paste the URL of your job tracking spreadsheet. The dashboard will pull live data from it.
      </p>

      {savedUrl ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-green-700">Sheet connected</div>
            <div className="truncate text-xs text-green-600">{savedUrl}</div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
          >
            <Unlink className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={saving || !url.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Connect
            </button>
          </div>
          {!authenticated && (
            <p className="mt-2 text-xs text-amber-600">
              You need to connect your Google account first (step 2 above) before the sheet can be read.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}
    </section>
  )
}

function EnvBlock() {
  const [copied, setCopied] = useState(false)
  const envText = `GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback`

  const handleCopy = () => {
    navigator.clipboard.writeText(envText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <pre className="rounded-lg bg-[var(--surface)] p-4 text-xs text-[var(--sea-ink)]">
        {envText}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--sea-ink-soft)] transition hover:text-[var(--sea-ink)]"
      >
        {copied ? (
          <>
            <CheckCircle className="h-3 w-3 text-green-600" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy
          </>
        )}
      </button>
    </div>
  )
}
