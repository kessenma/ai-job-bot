import { createFileRoute } from '@tanstack/react-router'
import {
  Robot, EnvelopeSimple, Table, Tray, Lightning, Shield,
} from '@phosphor-icons/react'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 pb-16 pt-24">
      <section className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-3xl font-bold text-[var(--sea-ink)]">About Job App Bot</h1>
        <p className="mb-8 text-lg text-[var(--sea-ink-soft)]">
          Job App Bot automates the tedious parts of your job search &mdash; tracking applications,
          scanning emails for responses, and helping you follow up at the right time. All powered by
          your Google account with read-only access.
        </p>

        <h2 className="mb-6 text-xl font-bold text-[var(--sea-ink)]">Features</h2>
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
