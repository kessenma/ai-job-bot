import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Robot, EnvelopeSimple, Table, Tray, Lightning, Shield, CircleNotch,
} from '@phosphor-icons/react'
import { loginWithPassword } from '#/lib/gmail.api.ts'
import LightRays from '#/components/LightRays'
import ShinyText from '#/components/ShinyText'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    const { auth } = context as { auth: { authenticated: boolean } }
    if (auth.authenticated) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: Landing,
})

function Landing() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await loginWithPassword({ data: { password } })
      if (result.success) {
        window.location.href = '/dashboard'
      } else {
        setError(result.error || 'Invalid password')
      }
    } catch {
      setError('Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-20">
      {/* Hero */}
      <section className="relative mb-16 text-center">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <LightRays
            raysColor="#56c6be"
            raysOrigin="top-center"
            raysSpeed={0.6}
            lightSpread={1.2}
            rayLength={2.5}
            fadeDistance={1.2}
            followMouse
            mouseInfluence={0.05}
          />
        </div>
        <div className="relative z-10 mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-1.5 text-sm font-semibold text-[var(--sea-ink)]">
          <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
          Job App Bot
        </div>
        <h1 className="relative z-10 display-title mb-4 text-4xl font-bold leading-tight text-[var(--sea-ink)] sm:text-5xl">
          Your Job Search,
          <br />
          <ShinyText text="Automated" color="#4fb8b2" shineColor="#b8f0ed" speed={3} />
        </h1>
        <p className="relative z-10 mx-auto mb-8 max-w-lg text-lg text-[var(--sea-ink-soft)]">
          Track applications, scan emails for responses, and auto-apply to jobs &mdash;
          all from one dashboard connected to your Google account.
        </p>

        <form onSubmit={handleSubmit} className="relative z-10 mx-auto max-w-sm">
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="flex-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <CircleNotch className="h-4 w-4 animate-spin" /> : null}
              Sign In
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </form>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-3xl">
        <h2 className="mb-8 text-center text-xl font-bold text-[var(--sea-ink)]">
          What you get
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Table className="h-6 w-6 text-[var(--lagoon)]" />}
            title="Google Sheets Sync"
            description="Pull job leads directly from your Google Sheet. Auto-detects headers and tabs."
          />
          <FeatureCard
            icon={<Tray className="h-6 w-6 text-[var(--lagoon)]" />}
            title="Email Scanner"
            description="Scan Gmail for rejections, interview invites, and application confirmations."
          />
          <FeatureCard
            icon={<Robot className="h-6 w-6 text-[var(--lagoon)]" />}
            title="Auto Apply"
            description="Identify easy-to-apply jobs and streamline your application workflow."
          />
          <FeatureCard
            icon={<EnvelopeSimple className="h-6 w-6 text-[var(--lagoon)]" />}
            title="Follow-up Tracker"
            description="Track which recruiters to follow up with and when."
          />
          <FeatureCard
            icon={<Lightning className="h-6 w-6 text-[var(--lagoon)]" />}
            title="ATS Detection"
            description="Automatically classifies job postings by their Applicant Tracking System."
          />
          <FeatureCard
            icon={<Shield className="h-6 w-6 text-[var(--lagoon)]" />}
            title="Privacy First"
            description="Your data stays on your server. Read-only access to Gmail and Sheets."
          />
        </div>
      </section>
    </main>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="feature-card rounded-xl border border-[var(--line)] p-5 transition">
      <div className="mb-3">{icon}</div>
      <h3 className="mb-1 font-semibold text-[var(--sea-ink)]">{title}</h3>
      <p className="text-sm text-[var(--sea-ink-soft)]">{description}</p>
    </div>
  )
}
