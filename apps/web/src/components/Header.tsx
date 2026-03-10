import { useNavigate, useRouterState } from '@tanstack/react-router'
import { SquaresFour, Robot, EnvelopeSimple, GearSix, BookOpen, Table } from '@phosphor-icons/react'
import PillNav from './PillNav'
import Dock from './Dock'
import { useScanContext } from '#/hooks/useScanContext.tsx'

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
        onMobileMenuClick={() => {}}
      />
    </div>
  )
}

function AuthenticatedNav({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { descScan, linkedInScan } = useScanContext()
  const descProgress = descScan.active && descScan.progress.total > 0
    ? descScan.progress.current / descScan.progress.total
    : undefined
  const liProgress = linkedInScan.active ? linkedInScan.progress : undefined
  // Show whichever scan is active (desc scan takes priority if both somehow run)
  const scanProgress = descProgress ?? liProgress

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
      icon: <BookOpen className="h-6 w-6 text-[var(--lagoon)]" />,
      label: scanProgress !== undefined ? `Setup (${Math.round(scanProgress * 100)}%)` : 'Setup',
      onClick: () => navigate({ to: '/setup' }),
      progress: scanProgress,
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
