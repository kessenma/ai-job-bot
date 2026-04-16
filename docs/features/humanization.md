# Human-like Behavior (Humanization)

Prevents LinkedIn from detecting automated behavior by simulating natural human interactions.

## Key File

`apps/playwright/src/humanize.ts`

## Functions

### `humanDelay(minMs, maxMs)`

Random delay using a beta-like distribution that favors shorter waits with occasional longer pauses.

```
wait = min + (random^1.4) * (max - min)
```

This produces a distribution skewed toward the lower end rather than a flat uniform distribution, which is more realistic.

### `humanType(page, selector, text)`

Types text character-by-character with realistic timing:

- **Per-keystroke delay**: ~60ms base with triangular variance (~80ms range)
- **Thinking pauses**: Every 8-15 characters, pauses for 200-500ms
- **Long text fallback**: Text over 200 characters uses `page.fill()` for efficiency

### `humanClick(page, selector)`

Clicks with natural mouse movement:

1. Waits for element visibility
2. Gets bounding box, calculates a random point within the element (not dead center)
3. Moves mouse to target with smooth interpolation (5-10 steps)
4. Pre-click pause (100-300ms)
5. Click
6. Post-click pause (200-600ms)

### `humanScroll(page, pixels)`

Scrolls in 2-4 smaller increments with delays between each, rather than one large jump.

### `waitForFullLoad(page)`

Waits for both `domcontentloaded` and `load` events, then adds a 2-4 second delay for async UI rendering (LinkedIn loads content progressively).

## Usage

All LinkedIn automation (`linkedin.ts`, `linkedin-easy-apply.ts`) imports these functions instead of using inline delays. The previous `randomDelay()` and `humanType()` functions in `linkedin.ts` have been replaced.
