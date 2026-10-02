// Day / night lighting for the farm (pure, unit-tested): which light the island stands in, from the
// player's local clock or from their own choice. Remembered per browser in localStorage.

import { DAY_START_HOUR, LIGHTING_BOOT_ATTRIBUTE, LIGHTING_BOOT_SCRIPT, LIGHTING_KEY, NIGHT_START_HOUR } from '@/shared/lib/lightingBoot'

export type LightingMode = 'day' | 'night'
// 'auto' follows the clock; 'day' / 'night' pin the light (for testing, or for taste).
export type LightingPreference = 'auto' | LightingMode

// The hours and the storage key are shared with the boot script that picks the light before the
// first paint (shared/lib/lightingBoot.ts): day runs from 06:00 up to (not including) 18:00.
export { DAY_START_HOUR, LIGHTING_BOOT_ATTRIBUTE, LIGHTING_BOOT_SCRIPT, LIGHTING_KEY, NIGHT_START_HOUR }

export const LIGHTING_PREFERENCE_DEFAULT: LightingPreference = 'auto'
// What the server and the first client render show (no clock there): daylight.
export const LIGHTING_MODE_DEFAULT: LightingMode = 'day'

export function lightingModeAt(hour: number): LightingMode {
  if (!Number.isFinite(hour)) return LIGHTING_MODE_DEFAULT
  const h = ((Math.floor(hour) % 24) + 24) % 24
  return h >= DAY_START_HOUR && h < NIGHT_START_HOUR ? 'day' : 'night'
}

// The light to draw: the pinned one, or the clock's. `hour` null = no clock yet (server render).
export const resolveLighting = (preference: LightingPreference, hour: number | null): LightingMode =>
  preference !== 'auto' ? preference : hour === null ? LIGHTING_MODE_DEFAULT : lightingModeAt(hour)

type ReadStore = Pick<Storage, 'getItem'>
type WriteStore = Pick<Storage, 'setItem'>

// Anything but the three stored values (nothing saved yet, a corrupted value) is the default.
export function parseLightingPreference(stored: string | null | undefined): LightingPreference {
  return stored === 'day' || stored === 'night' || stored === 'auto' ? stored : LIGHTING_PREFERENCE_DEFAULT
}

// Storage can be missing or blocked (server render, private mode): then the default applies.
export function readLightingPreference(store: ReadStore | null | undefined): LightingPreference {
  try {
    return parseLightingPreference(store?.getItem(LIGHTING_KEY))
  } catch {
    return LIGHTING_PREFERENCE_DEFAULT
  }
}

// Returns whether the choice was saved (false: storage blocked; the toggle still works this visit).
export function writeLightingPreference(store: WriteStore | null | undefined, preference: LightingPreference): boolean {
  try {
    if (!store) return false
    store.setItem(LIGHTING_KEY, preference)
    return true
  } catch {
    return false
  }
}

// The toggle steps through: follow the clock → always day → always night → follow the clock.
export const nextLightingPreference = (preference: LightingPreference): LightingPreference => (preference === 'auto' ? 'day' : preference === 'day' ? 'night' : 'auto')

// Class on the farm's root at night. globals.css hangs every night colour on it (shadow tint, the
// moonlit veil and vignette, glows), so switching the light re-renders no tree and no tile.
export const NIGHT_CLASS = 'mg-night'
export const lightingModeClass = (mode: LightingMode): string | undefined => (mode === 'night' ? NIGHT_CLASS : undefined)

// The toggle button's tooltip: what the light is now, and what pressing it does.
export function lightingToggleTitle(preference: LightingPreference, mode: LightingMode): string {
  const now = preference === 'auto' ? `Following your clock (${mode} now)` : `Always ${preference}`
  const next = nextLightingPreference(preference)
  return `${now}. Switch to ${next === 'auto' ? 'your clock' : `always ${next}`}`
}
