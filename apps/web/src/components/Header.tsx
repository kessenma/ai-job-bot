import { useNavigate, useRouterState } from '@tanstack/react-router'
import { SquaresFour, Robot, EnvelopeSimple, GearSix, Tray, BookOpen, Table } from '@phosphor-icons/react'
// @ts-expect-error -- JSX component without type declarations
import PillNav from './PillNav'
// @ts-expect-error -- JSX component without type declarations
import Dock from './Dock'

export default function Header() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const rootContext = routerState.matches[0]?.context as { auth?: { authenticated: boolean } } | undefined
  const authenticated = rootContext?.auth?.authenticated ?? false
  const currentPath = routerState.location.pathname

  if (authenticated) {
    return <AuthenticatedNav navigate={navigate} />
  }

  return <UnauthenticatedNav currentPath={currentPath} />
}

function UnauthenticatedNav({ currentPath }: { currentPath: string }) {
  return (
    <div className="fixed top-0 z-50 w-full flex justify-center">
      <PillNav
        logo="/favicon.ico"
        logoAlt="Job App Bot"
        items={[
          { href: '/', label: 'Home' },
          { href: '/about', label: 'About' },
        ]}
        activeHref={currentPath}
        baseColor="var(--header-bg, #1a1a2e)"
        pillColor="var(--lagoon, #56c6be)"
        hoveredPillTextColor="#fff"
        pillTextColor="#fff"
      />
    </div>
  )
}

function AuthenticatedNav({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const dockItems = [
    {
      icon: <SquaresFour className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Dashboard',
      onClick: () => navigate({ to: '/dashboard' }),
    },
    {
      icon: <Robot className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Auto Apply',
      onClick: () => navigate({ to: '/auto-apply' }),
    },
    {
      icon: <EnvelopeSimple className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Follow Up',
      onClick: () => navigate({ to: '/follow-up' }),
    },
    {
      icon: <Table className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Sheets',
      onClick: () => navigate({ to: '/sheets' }),
    },
    {
      icon: <Tray className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Email Scan',
      onClick: () => navigate({ to: '/email-scan' }),
    },
    {
      icon: <BookOpen className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Setup',
      onClick: () => navigate({ to: '/setup' }),
    },
    {
      icon: <GearSix className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Settings',
      onClick: () => navigate({ to: '/settings' }),
    },
  ]

  return (
    <div className="fixed bottom-0 z-50 w-full flex justify-center pointer-events-none">
      <div className="pointer-events-auto">
        <Dock
          items={dockItems}
          panelHeight={68}
          baseItemSize={50}
          magnification={70}
        />
      </div>
    </div>
  )
}
