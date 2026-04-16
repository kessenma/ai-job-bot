import { HeadContent, Scripts, Outlet, createRootRoute, useMatch } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import Header from '../components/Header'
import { ScanProvider, useScanContext } from '#/hooks/useScanContext.tsx'
import { BotViewerPanel } from '#/components/ui/BotViewerPanel.tsx'
import { getAuthState } from '#/lib/gmail.api.ts'

import appCss from '../styles.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Job App Bot',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  beforeLoad: async () => {
    const auth = await getAuthState()
    return { auth }
  },
  component: RootComponent,
  shellComponent: RootShell,
})

function FloatingBotViewer() {
  const { linkedInScan, botStream } = useScanContext()
  const onPipeline = useMatch({ from: '/pipeline', shouldThrow: false })

  // Don't render when user is on /pipeline — the in-page panel handles it there
  if (onPipeline) return null

  const streamHasData = botStream.connected || botStream.done || botStream.logs.length > 0 || botStream.latestScreenshot
  if (!linkedInScan.active && !streamHasData) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] max-h-[80vh] overflow-auto rounded-2xl shadow-2xl border border-[var(--line)] bg-[var(--surface)]">
      <BotViewerPanel
        stream={botStream}
        isSearching={linkedInScan.active}
        title="LinkedIn Search"
      />
    </div>
  )
}

function RootComponent() {
  return (
    <ScanProvider>
      <Header />
      <Outlet />
      <FloatingBotViewer />
    </ScanProvider>
  )
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
