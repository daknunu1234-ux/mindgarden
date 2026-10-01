// "Show all tree labels" preference for the farm (pure, unit-tested): whether every planted tree
// always shows its name sign and mastery badge, or only the tree under the pointer / the one just
// tapped does. Remembered per browser in localStorage.

export const TREE_LABELS_KEY = 'mindgarden:showAllTreeLabels'

// Off by default: a clean island, labels on hover.
export const SHOW_ALL_TREE_LABELS_DEFAULT = false

type ReadStore = Pick<Storage, 'getItem'>
type WriteStore = Pick<Storage, 'setItem'>

// Anything but the two stored values (nothing saved yet, a corrupted value) is the default.
export function parseShowAllTreeLabels(stored: string | null | undefined): boolean {
  if (stored === 'true') return true
  if (stored === 'false') return false
  return SHOW_ALL_TREE_LABELS_DEFAULT
}

// Storage can be missing or blocked (server render, private mode): then the default applies.
export function readShowAllTreeLabels(store: ReadStore | null | undefined): boolean {
  try {
    return parseShowAllTreeLabels(store?.getItem(TREE_LABELS_KEY))
  } catch {
    return SHOW_ALL_TREE_LABELS_DEFAULT
  }
}

// Returns whether the choice was saved (false: storage blocked; the toggle still works this visit).
export function writeShowAllTreeLabels(store: WriteStore | null | undefined, showAll: boolean): boolean {
  try {
    if (!store) return false
    store.setItem(TREE_LABELS_KEY, String(showAll))
    return true
  } catch {
    return false
  }
}

// Class on the farm's root. In hover mode, globals.css hides every `.mg-tree-label` and reveals the
// ones of the tree that is hovered, focused or was just tapped; with all labels on there is no class
// and nothing is hidden. One class on one element: no tree re-renders when the toggle flips.
export const TREE_LABELS_HOVER_CLASS = 'mg-labels-hover'
export const treeLabelsModeClass = (showAll: boolean): string | undefined => (showAll ? undefined : TREE_LABELS_HOVER_CLASS)

// The toggle button's tooltip: what pressing it will do.
export const treeLabelsToggleTitle = (showAll: boolean): string => (showAll ? 'Hide labels (hover only)' : 'Show all labels & progress')
