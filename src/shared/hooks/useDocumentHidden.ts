'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

// Whether the page is in a background tab (or the phone screen is off). The server and the first
// render say "visible".
export function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === 'hidden',
    () => false,
  )
}
