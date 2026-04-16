import { useState } from 'react'
import {
  Globe, ArrowSquareOut, Trash,
} from '@phosphor-icons/react'
import {
  deleteScreenshot, type Screenshot,
} from '#/lib/playwright.api.ts'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '#/components/ui/dialog'
import {
  Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle,
} from '#/components/ui/item'
import { Button } from '#/components/ui/button'

interface Actions {
  dismissedCookies: boolean
  clickedApply: boolean
  applyButtonText: string | null
  navigatedTo: string | null
}

function parseActions(actions: string | null): Actions | null {
  if (!actions) return null
  try { return JSON.parse(actions) } catch { return null }
}

function ActionsSummary({ actions: raw }: { actions: string | null }) {
  const actions = parseActions(raw)
  if (!actions) return null
  if (!actions.dismissedCookies && !actions.clickedApply) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--sea-ink-soft)]">
      <span className="font-medium text-[var(--sea-ink)]">Actions taken:</span>
      {actions.dismissedCookies && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
          Dismissed cookies
        </span>
      )}
      {actions.clickedApply && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
          Clicked "{actions.applyButtonText}"
        </span>
      )}
      {actions.navigatedTo && (
        <span className="truncate text-[var(--sea-ink-soft)]">
          → {actions.navigatedTo}
        </span>
      )}
    </div>
  )
}

function ScreenshotStatusBadge({ status, hasCaptcha }: { status: string | null; hasCaptcha: boolean | null }) {
  const color =
    status === 'loaded' ? 'bg-green-100 text-green-700' :
    status === 'expired' ? 'bg-gray-100 text-gray-500' :
    status === 'blocked' ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-600'

  return (
    <span className="flex items-center gap-1">
      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${color}`}>
        {status ?? 'unknown'}
      </span>
      {hasCaptcha && (
        <span className="inline-flex rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-700">
          CAPTCHA
        </span>
      )}
    </span>
  )
}

export function ScreenshotGallery({
  screenshots: initialScreenshots,
}: {
  screenshots: Screenshot[]
}) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>(initialScreenshots)
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null)

  const handleDelete = async (id: number) => {
    await deleteScreenshot({ data: { id } })
    setScreenshots((prev) => prev.filter((s) => s.id !== id))
    if (selectedScreenshot?.id === id) setSelectedScreenshot(null)
  }

  if (screenshots.length === 0) return null

  return (
    <>
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
          <Globe className="h-5 w-5 text-[var(--lagoon)]" />
          Screenshots
          <span className="text-sm font-normal text-[var(--sea-ink-soft)]">({screenshots.length})</span>
        </h2>
        <ItemGroup>
          {screenshots.map((s) => (
            <Item
              key={s.id}
              variant="outline"
              className="cursor-pointer bg-[var(--surface)] hover:bg-[var(--surface-strong)]"
              render={<button type="button" onClick={() => setSelectedScreenshot(s)} />}
            >
              <ItemMedia variant="image" className="!size-16 !rounded-md">
                <img
                  alt={s.title ?? s.url}
                  src={`data:image/png;base64,${s.image}`}
                  className="object-cover object-top"
                />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {s.title || new URL(s.url).hostname}
                  {s.atsPlatform && (
                    <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
                      {s.atsPlatform}
                    </span>
                  )}
                </ItemTitle>
                <ItemDescription className="truncate">
                  {s.url}
                </ItemDescription>
              </ItemContent>
              <ItemContent className="!flex-none text-right">
                <ScreenshotStatusBadge status={s.status} hasCaptcha={s.hasCaptcha} />
                <ItemDescription>
                  {new Date(s.createdAt).toLocaleDateString()}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </section>

      {/* Full-screen screenshot dialog */}
      <Dialog open={!!selectedScreenshot} onOpenChange={(open) => !open && setSelectedScreenshot(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-[var(--lagoon)]" />
              {selectedScreenshot?.title || 'Screenshot'}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-3 text-xs">
              <span className="truncate">{selectedScreenshot?.url}</span>
              {selectedScreenshot?.atsPlatform && (
                <span className="shrink-0 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
                  {selectedScreenshot.atsPlatform}
                </span>
              )}
              {selectedScreenshot && (
                <ScreenshotStatusBadge status={selectedScreenshot.status} hasCaptcha={selectedScreenshot.hasCaptcha} />
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedScreenshot && (
            <>
              <ActionsSummary actions={selectedScreenshot.actions} />
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--line)]">
                <img
                  src={`data:image/png;base64,${selectedScreenshot.image}`}
                  alt={selectedScreenshot.title ?? 'Screenshot'}
                  className="w-full"
                />
              </div>
            </>
          )}

          <DialogFooter>
            {selectedScreenshot && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(selectedScreenshot.id)}
                >
                  <Trash className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <a
                  href={selectedScreenshot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink)] no-underline hover:bg-[var(--surface-strong)]"
                >
                  <ArrowSquareOut className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
