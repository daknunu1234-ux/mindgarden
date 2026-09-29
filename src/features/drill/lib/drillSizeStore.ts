// Client-side memory of the chosen round size (localStorage `mindgarden_drill_size`, mirrored into a
// cookie of the same name for the round pages). Storage can be missing or throw (private mode,
// blocked site data): then the default size is used and nothing is remembered.
import { DEFAULT_DRILL_SIZE, DRILL_SIZE_KEY, normalizeDrillSize, type DrillSize } from './drillSize'

const CHANGE_EVENT = 'mindgarden:drill-size'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function readDrillSize(): DrillSize {
  try {
    return normalizeDrillSize(window.localStorage.getItem(DRILL_SIZE_KEY))
  } catch {
    return DEFAULT_DRILL_SIZE
  }
}

export function saveDrillSize(size: DrillSize): void {
  try {
    window.localStorage.setItem(DRILL_SIZE_KEY, String(size))
  } catch {
    // Not remembered: fine, the links still carry ?limit=.
  }
  document.cookie = `${DRILL_SIZE_KEY}=${size}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

// useSyncExternalStore subscription: this tab's saves and other tabs' storage events.
export function subscribeDrillSize(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}
