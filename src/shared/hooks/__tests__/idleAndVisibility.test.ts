// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useAfterIdle } from '../useAfterIdle'
import { useDocumentHidden } from '../useDocumentHidden'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

// Renders a hook in a real (happy-dom) root and reports its value after each render.
function renderHook<T>(hook: () => T) {
  const seen: T[] = []
  const Probe = () => {
    seen.push(hook())
    return null
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(createElement(Probe)))
  return { seen, unmount: () => act(() => root.unmount()) }
}

describe('useAfterIdle', () => {
  it('is false on the first paint, then true once the browser is idle (and runs onIdle once)', () => {
    vi.useFakeTimers()
    const idle = vi.fn()
    const w = window as unknown as Record<string, unknown>
    const saved = w.requestIdleCallback
    w.requestIdleCallback = undefined
    const { seen, unmount } = renderHook(() => useAfterIdle(idle))
    expect(seen.at(-1)).toBe(false)
    act(() => vi.advanceTimersByTime(250))
    expect(seen.at(-1)).toBe(true)
    expect(idle).toHaveBeenCalledTimes(1)
    unmount()
    w.requestIdleCallback = saved
    vi.useRealTimers()
  })

  it('cancels the pending idle callback when unmounted first', () => {
    const w = window as unknown as Record<string, unknown>
    const cancel = vi.fn()
    const saved = [w.requestIdleCallback, w.cancelIdleCallback]
    w.requestIdleCallback = vi.fn(() => 7)
    w.cancelIdleCallback = cancel
    const { unmount } = renderHook(() => useAfterIdle())
    unmount()
    expect(cancel).toHaveBeenCalledWith(7)
    ;[w.requestIdleCallback, w.cancelIdleCallback] = saved
  })
})

describe('useDocumentHidden', () => {
  it('follows the tab going to the background and back', () => {
    let state: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    const { seen, unmount } = renderHook(useDocumentHidden)
    expect(seen.at(-1)).toBe(false)
    act(() => {
      state = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(seen.at(-1)).toBe(true)
    act(() => {
      state = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(seen.at(-1)).toBe(false)
    unmount()
  })
})

describe('.mg-paused (globals.css)', () => {
  it('freezes every animation inside the paused farm, pseudo-elements included', () => {
    const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8')
    const rule = /\.mg-paused \*,\s*\.mg-paused \*::before,\s*\.mg-paused \*::after \{([^}]*)\}/.exec(css)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/animation-play-state: paused !important;/)
  })
})
