// The Workshop's keyboard shortcut panel (pure, unit-tested): open or minimized, remembered per
// browser in localStorage. Until the owner picks, it follows the screen: open beside the outline on
// large screens (lg, ≥ 1024 px), minimized to a "?" trigger below it on smaller ones. That default is
// pure CSS, so the server render and the first client render agree (no flash, no hydration mismatch).

export const SHORTCUT_PANEL_KEY = 'mindgarden:workshopShortcuts'

// null = not chosen yet: the screen decides.
export type ShortcutPanelChoice = boolean | null

type ReadStore = Pick<Storage, 'getItem'>
type WriteStore = Pick<Storage, 'setItem'>

export function parseShortcutPanel(stored: string | null | undefined): ShortcutPanelChoice {
  if (stored === 'open') return true
  if (stored === 'closed') return false
  return null
}

// Storage can be missing or blocked (server render, private mode): then the screen decides.
export function readShortcutPanel(store: ReadStore | null | undefined): ShortcutPanelChoice {
  try {
    return parseShortcutPanel(store?.getItem(SHORTCUT_PANEL_KEY))
  } catch {
    return null
  }
}

// Returns whether the choice was saved (false: storage blocked; the toggle still works this visit).
export function writeShortcutPanel(store: WriteStore | null | undefined, open: boolean): boolean {
  try {
    if (!store) return false
    store.setItem(SHORTCUT_PANEL_KEY, open ? 'open' : 'closed')
    return true
  } catch {
    return false
  }
}

// Whether the panel shows its list now: the owner's choice, else the screen (`wide` = lg and up).
export const shortcutPanelOpen = (choice: ShortcutPanelChoice, wide: boolean): boolean => choice ?? wide

// Classes for the list and the minimized trigger. With no choice yet the breakpoint switches them in
// CSS (`lg:`), so nothing depends on JavaScript having measured the screen.
export function shortcutPanelClasses(choice: ShortcutPanelChoice): { body: string; trigger: string; aside: string } {
  if (choice === true) return { body: 'block', trigger: 'hidden', aside: 'w-full max-w-48 lg:w-44' }
  if (choice === false) return { body: 'hidden', trigger: 'flex', aside: 'w-auto' }
  return { body: 'hidden lg:block', trigger: 'flex lg:hidden', aside: 'w-full max-w-48 lg:w-44' }
}
