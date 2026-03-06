import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, Bot, Mail, Settings, Inbox, BookOpen, Table } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const routerState = useRouterState()
  const rootData = routerState.matches[0]?.loaderData as { auth?: { authenticated: boolean } } | undefined
  const authenticated = rootData?.auth?.authenticated ?? false

  return (
    <header className="fixed top-0 z-50 w-full border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-lg">
      <nav className="page-wrap flex items-center gap-4 px-4 py-3">
        <Link
          to={authenticated ? '/dashboard' : '/'}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] no-underline shadow-sm"
        >
          <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
          Job App Bot
        </Link>

        {authenticated && (
          <div className="flex items-center gap-4 text-sm font-semibold">
            <Link to="/dashboard" className="nav-link inline-flex items-center gap-1.5" activeProps={{ className: 'nav-link is-active' }}>
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
            <Link to="/auto-apply" className="nav-link inline-flex items-center gap-1.5" activeProps={{ className: 'nav-link is-active' }}>
              <Bot className="h-3.5 w-3.5" />
              Auto Apply
            </Link>
            <Link to="/follow-up" className="nav-link inline-flex items-center gap-1.5" activeProps={{ className: 'nav-link is-active' }}>
              <Mail className="h-3.5 w-3.5" />
              Follow Up
            </Link>
            <Link to="/sheets" className="nav-link inline-flex items-center gap-1.5" activeProps={{ className: 'nav-link is-active' }}>
              <Table className="h-3.5 w-3.5" />
              Sheets
            </Link>
            <Link to="/email-scan" className="nav-link inline-flex items-center gap-1.5" activeProps={{ className: 'nav-link is-active' }}>
              <Inbox className="h-3.5 w-3.5" />
              Email Scan
            </Link>
            <Link to="/setup" className="nav-link inline-flex items-center gap-1.5" activeProps={{ className: 'nav-link is-active' }}>
              <BookOpen className="h-3.5 w-3.5" />
              Setup
            </Link>
            <Link to="/settings" className="nav-link inline-flex items-center gap-1.5" activeProps={{ className: 'nav-link is-active' }}>
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Link>
          </div>
        )}

        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
