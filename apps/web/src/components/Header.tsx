import { useNavigate, useRouterState } from '@tanstack/react-router'
import { SquaresFour, Robot, Funnel, GearSix, CircleNotch, CheckCircle, Warning } from '@phosphor-icons/react'
import PillNav from './PillNav'
import Dock from './Dock'
import { useScanContext, type LinkedInScanState } from '#/hooks/useScanContext.tsx'
import type { ReactNode } from 'react'

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

function buildPipelineTooltip(descScan: { active: boolean; progress: { current: number; total: number; currentJob: string } }, linkedInScan: LinkedInScanState): ReactNode | undefined {
  // LinkedIn scan active
  if (linkedInScan.active) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <CircleNotch className="h-3 w-3 animate-spin text-[var(--lagoon,#56c6be)]" />
          <span className="text-[11px] font-medium">{linkedInScan.stageLabel}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--lagoon,#56c6be)] transition-all duration-300"
            style={{ width: `${Math.max(linkedInScan.progress * 100, 5)}%` }}
          />
        </div>
        {linkedInScan.scannedSoFar !== undefined && (
          <div className="text-[10px] text-neutral-400">
            Scanned {linkedInScan.scannedSoFar} jobs, {linkedInScan.matchedSoFar ?? 0} matches
          </div>
        )}
      </div>
    )
  }

  // Desc scan active
  if (descScan.active && descScan.progress.total > 0) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <CircleNotch className="h-3 w-3 animate-spin text-[var(--lagoon,#56c6be)]" />
          <span className="text-[11px] font-medium">Scraping descriptions</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--lagoon,#56c6be)] transition-all duration-300"
            style={{ width: `${(descScan.progress.current / descScan.progress.total) * 100}%` }}
          />
        </div>
        <div className="text-[10px] text-neutral-400">
          {descScan.progress.current}/{descScan.progress.total} — {descScan.progress.currentJob}
        </div>
      </div>
    )
  }

  // LinkedIn scan done/error (show last result)
  if (linkedInScan.stage === 'done' && linkedInScan.stageLabel) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle className="h-3 w-3 text-green-400" />
        <span className="text-[11px]">{linkedInScan.stageLabel}</span>
      </div>
    )
  }

  if (linkedInScan.stage === 'error' && linkedInScan.stageLabel) {
    return (
      <div className="flex items-center gap-1.5">
        <Warning className="h-3 w-3 text-red-400" />
        <span className="text-[11px]">{linkedInScan.stageLabel}</span>
      </div>
    )
  }

  return undefined // fall back to plain label
}

function AuthenticatedNav({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { descScan, linkedInScan } = useScanContext()
  const descProgress = descScan.active && descScan.progress.total > 0
    ? descScan.progress.current / descScan.progress.total
    : undefined
  const liProgress = linkedInScan.active ? linkedInScan.progress : undefined
  // Show whichever scan is active (desc scan takes priority if both somehow run)
  const scanProgress = descProgress ?? liProgress

  const tooltip = buildPipelineTooltip(descScan, linkedInScan)

  // Badge: show saved count when done, or spinning indicator when active
  const badge = linkedInScan.stage === 'done' && linkedInScan.savedCount
    ? linkedInScan.savedCount
    : descScan.active
      ? descScan.progress.current
      : undefined

  const dockItems = [
    {
      icon: <SquaresFour className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Jobs',
      onClick: () => navigate({ to: '/dashboard' }),
    },
    {
      icon: <Funnel className="h-6 w-6 text-[var(--lagoon)]" />,
      label: scanProgress !== undefined ? `Pipeline (${Math.round(scanProgress * 100)}%)` : 'Pipeline',
      onClick: () => navigate({ to: '/pipeline' }),
      progress: scanProgress,
      tooltip,
      badge,
    },
    {
      icon: <Robot className="h-6 w-6 text-[var(--lagoon)]" />,
      label: 'Apply',
      onClick: () => navigate({ to: '/auto-apply' }),
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
