import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  Robot, EnvelopeSimple, Table, Tray, Lightning, Shield,
} from '@phosphor-icons/react'
import { getAuthState } from '#/lib/gmail.api.ts'
import LightRays from '#/components/LightRays'
import ShinyText from '#/components/ShinyText'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    const { auth } = context as { auth: { authenticated: boolean } }
    if (auth.authenticated) {
      throw redirect({ to: '/dashboard' })
    }
  },
  loader: async () => {
    return await getAuthState()
  },
  component: Landing,
})

function Landing() {
  const { configured, authUrl } = Route.useLoaderData()

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

        {configured ? (
          <a
            href={authUrl ?? '#'}
            className="relative z-10 inline-flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-8 py-3 text-base font-semibold text-white no-underline shadow-lg transition hover:opacity-90"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </a>
        ) : (
          <div className="relative z-10 mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            Google OAuth credentials are not configured yet. Set up <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in your <code>.env</code> file.
          </div>
        )}
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
