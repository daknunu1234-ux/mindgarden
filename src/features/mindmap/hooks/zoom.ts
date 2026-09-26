export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 1.5
export const ZOOM_STEP = 0.25

// Next zoom level, clamped and rounded so repeated steps never drift (0.75, not 0.7500001).
export function stepZoom(current: number, direction: 1 | -1): number {
  const next = Math.round((current + direction * ZOOM_STEP) * 100) / 100
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
}
