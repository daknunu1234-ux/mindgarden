'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import {
  LIGHTING_KEY,
  LIGHTING_PREFERENCE_DEFAULT,
  nextLightingPreference,
  readLightingPreference,
  resolveLighting,
  writeLightingPreference,
  type LightingMode,
  type LightingPreference,
} from '../lib/dayNight'

// Same-tab changes: the `storage` event only fires in other tabs.
const CHANGED = 'mindgarden:lighting'

const storage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function subscribePreference(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === LIGHTING_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGED, onChange)
  }
}

// The local hour, looked at once a minute and when the tab comes back: dawn and dusk arrive while
// the farm is open. The snapshot only changes on the hour, so nothing re-renders in between.
function subscribeClock(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 60_000)
  document.addEventListener('visibilitychange', onChange)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onChange)
  }
}

// The farm's light (lib/dayNight.ts): the player's local hour decides day or night unless they pinned
// one with the toggle; the choice is remembered in localStorage. The server and the first client
// render carry the daylight markup (no hydration mismatch); the real light applies right after. If storage is
// blocked, the toggle still works for this visit.
// `live` is false on the server and while hydrating (no clock yet): until then the boot script's
// mark on <html> decides how the farm looks (shared/lib/lightingBoot.ts), so there is no flash.
export function useDayNight(): { mode: LightingMode; preference: LightingPreference; live: boolean; cycle: () => void } {
  const stored = useSyncExternalStore(
    subscribePreference,
    () => readLightingPreference(storage()),
    () => LIGHTING_PREFERENCE_DEFAULT,
  )
  const hour = useSyncExternalStore<number | null>(
    subscribeClock,
    () => new Date().getHours(),
    () => null,
  )
  // Only used when the choice could not be saved.
  const [unsaved, setUnsaved] = useState<LightingPreference | null>(null)
  const preference = unsaved ?? stored

  const cycle = useCallback(() => {
    const next = nextLightingPreference(preference)
    if (writeLightingPreference(storage(), next)) {
      setUnsaved(null)
      window.dispatchEvent(new Event(CHANGED))
    } else {
      setUnsaved(next)
    }
  }, [preference])

  return { mode: resolveLighting(preference, hour), preference, live: hour !== null, cycle }
}
