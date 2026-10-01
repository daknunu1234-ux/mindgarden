'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { readShowAllTreeLabels, SHOW_ALL_TREE_LABELS_DEFAULT, TREE_LABELS_KEY, writeShowAllTreeLabels } from '../lib/treeLabels'

// Same-tab changes: the `storage` event only fires in other tabs.
const CHANGED = 'mindgarden:tree-labels'

const storage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === TREE_LABELS_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGED, onChange)
  }
}

// The "show all tree labels" preference, remembered in localStorage (lib/treeLabels.ts). The server
// and the first client render use the default (no hydration mismatch); the saved choice applies
// right after. If storage is blocked, the toggle still works for this visit.
export function useTreeLabels(): { showAll: boolean; toggle: () => void } {
  const stored = useSyncExternalStore(
    subscribe,
    () => readShowAllTreeLabels(storage()),
    () => SHOW_ALL_TREE_LABELS_DEFAULT,
  )
  // Only used when the choice could not be saved.
  const [unsaved, setUnsaved] = useState<boolean | null>(null)
  const showAll = unsaved ?? stored

  const toggle = useCallback(() => {
    const next = !showAll
    if (writeShowAllTreeLabels(storage(), next)) {
      setUnsaved(null)
      window.dispatchEvent(new Event(CHANGED))
    } else {
      setUnsaved(next)
    }
  }, [showAll])

  return { showAll, toggle }
}
