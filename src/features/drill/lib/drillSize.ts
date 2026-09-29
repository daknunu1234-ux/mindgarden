// Round size (pure, unit-tested): how many questions one practice or Mind Tournament round asks.
// The player picks 5, 10 or 20 (DrillSizeSelector); anything else falls back to 10.

export const DRILL_SIZES = [5, 10, 20] as const
export type DrillSize = (typeof DRILL_SIZES)[number]
export const DEFAULT_DRILL_SIZE: DrillSize = 10

// The player's last choice: localStorage for the selector, mirrored into a cookie so round pages
// opened from any link (mindmap, farm, profile…) use it too when the URL has no ?limit=.
export const DRILL_SIZE_KEY = 'mindgarden_drill_size'

// '5', 5 or ['20'] → a valid size; missing, garbled or other numbers (7, 50) → 10.
export function normalizeDrillSize(value: unknown): DrillSize {
  const raw = Array.isArray(value) ? value[0] : value
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  return (DRILL_SIZES as readonly number[]).includes(n) ? (n as DrillSize) : DEFAULT_DRILL_SIZE
}

// The URL's ?limit= wins; otherwise the saved preference; otherwise 10.
export const resolveDrillSize = (param: unknown, saved: unknown): DrillSize =>
  param !== undefined && param !== null && param !== '' ? normalizeDrillSize(param) : normalizeDrillSize(saved)

export type DrillSizeOption = {
  size: DrillSize
  // Can be picked. A size is offered while the smaller one doesn't already cover every question.
  enabled: boolean
  // Picked, it would ask fewer questions than its label (the tree has only `available`).
  short: boolean
}

// With `available` questions left: 4 → [5 (short)], 7 → [5, 10 (short)], 30 → all three.
// Sizes above the first one that covers everything are disabled (they'd ask the same questions).
export function drillSizeOptions(available: number): DrillSizeOption[] {
  const n = Math.max(0, Math.floor(available))
  return DRILL_SIZES.map((size, i) => {
    const smaller = i === 0 ? 0 : DRILL_SIZES[i - 1]
    const enabled = n > 0 && (size <= n || smaller < n)
    return { size, enabled, short: enabled && size > n }
  })
}

// The preferred size, or the largest size still offered when the preference is disabled.
export function effectiveDrillSize(preferred: DrillSize, available: number): DrillSize {
  const options = drillSizeOptions(available)
  if (options.find((o) => o.size === preferred)?.enabled) return preferred
  const offered = options.filter((o) => o.enabled)
  return offered.length > 0 ? offered[offered.length - 1].size : preferred
}

// Adds ?limit=<size> to a round URL, keeping its other parameters and #hash.
export function withDrillSize(href: string, size: DrillSize): string {
  const url = new URL(href, 'http://mindgarden.local')
  url.searchParams.set('limit', String(size))
  return `${url.pathname}${url.search}${url.hash}`
}
