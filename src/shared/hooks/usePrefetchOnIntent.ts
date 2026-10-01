'use client'

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Prefetch routes the moment the player shows intent (pointer over, keyboard focus, or the start of
// a tap), once per element. For a dynamic route this fetches its code and its loading.tsx shell, so
// the click shows the skeleton at once while fresh data streams in; nothing is rendered or cached
// from the page's data (deck edits are optimistic and never revalidate, so a cached full prefetch
// could show stale statements). The router dedupes repeats and only prefetches in production.
export function usePrefetchOnIntent(hrefs: readonly string[]) {
  const router = useRouter()
  const done = useRef(false)
  const key = hrefs.join('\n')
  const prefetch = useCallback(() => {
    if (done.current) return
    done.current = true
    for (const href of key.split('\n')) if (href) router.prefetch(href)
  }, [router, key])
  return { onPointerEnter: prefetch, onFocus: prefetch, onPointerDown: prefetch }
}
