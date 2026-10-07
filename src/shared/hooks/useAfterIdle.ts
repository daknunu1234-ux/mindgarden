'use client'

import { useEffect, useState } from 'react'

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

// False until the browser is first idle after mount (requestIdleCallback, at most `timeout` ms
// later; a short timer where it isn't supported), then true for good. `onIdle` runs at that moment
// too (e.g. to preload code). For work that must not compete with the first paint or a route
// transition: secondary dialogs, prefetches.
export function useAfterIdle(onIdle?: () => void, timeout = 1500): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const w = window as IdleWindow
    const done = () => {
      onIdle?.()
      setIdle(true)
    }
    if (w.requestIdleCallback) {
      const handle = w.requestIdleCallback(done, { timeout })
      return () => w.cancelIdleCallback?.(handle)
    }
    const timer = window.setTimeout(done, 200)
    return () => window.clearTimeout(timer)
    // Once per mount: onIdle is a fire-and-forget preload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout])
  return idle
}
