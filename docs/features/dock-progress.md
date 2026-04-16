# Dock Progress Indicators

Enhances the bottom navigation dock to show detailed scan progress without needing to navigate to the Pipeline page.

## Features

### Badge Count
A small teal notification badge appears on the Pipeline dock icon:
- Shows **saved count** when a LinkedIn scan completes (e.g., "5")
- Shows **current progress** number during description scraping
- Animates in/out with scale transition

### Rich Hover Tooltip
When hovering over the Pipeline dock icon, a detailed tooltip appears instead of the plain "Pipeline" label:

**During LinkedIn scan:**
- Spinning icon + stage label (e.g., "Scanning LinkedIn for 5 matching jobs...")
- Linear progress bar
- Scan stats: "Scanned 12 jobs, 3 matches" (for find_matches mode)

**During description scraping:**
- Spinning icon + "Scraping descriptions"
- Progress bar (current/total)
- Current job being scraped

**After completion:**
- Green checkmark + summary (e.g., "Found 4/5 matches — 3 new saved")

**On error:**
- Red warning + error message

**When idle:** Falls back to plain "Pipeline" label (no rich tooltip).

## Architecture

### DockItemData interface (Dock.tsx)
```typescript
interface DockItemData {
  icon: ReactElement
  label: string           // plain text fallback
  onClick?: () => void
  progress?: number       // 0-1 for circular progress ring
  tooltip?: ReactNode     // rich content replaces label on hover
  badge?: number | string // notification count on icon corner
}
```

### Data Flow
```
useScanContext (linkedInScan / descScan state)
    |
    v
Header.tsx: buildPipelineTooltip()
    |-- builds ReactNode from scan state
    |-- calculates badge value
    v
Dock.tsx: DockItem
    |-- renders ProgressRing (circular SVG)
    |-- renders DockBadge (top-right count)
    |-- renders DockLabel with tooltip content
```

### DockLabel behavior
- If `tooltip` prop is provided: renders wider tooltip container (min-width 180px, padding) with rich content
- If no tooltip: renders the plain string label as before (compact, whitespace-pre)
- Uses the same framer-motion animation (fade + slide up)

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/components/Dock.tsx` | `DockBadge` component, `tooltip`/`badge` props on `DockItemData` |
| `apps/web/src/components/Header.tsx` | `buildPipelineTooltip()` builds tooltip ReactNode from scan state |
| `apps/web/src/hooks/useScanContext.tsx` | `scannedSoFar` and `matchedSoFar` fields on `LinkedInScanState` |
