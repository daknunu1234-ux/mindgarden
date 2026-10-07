// @vitest-environment happy-dom
import { act, createElement, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fitZoom, type CameraShot } from '@/shared/lib/camera'
import { FLIGHT_MS, useCamera } from '../useCamera'

// The camera flies to its initial shot after the first measurement (ease-out, FLIGHT_MS) and the
// player always wins: any touch stops the flight where it is.

const VIEW = { w: 800, h: 600 }
const WORLD = { w: 2400, h: 1800 }
const TARGET: CameraShot = { center: { x: 1500, y: 700 }, zoom: 1.3 }

let root: Root
let host: HTMLDivElement
// What the probe hands the test after each render (set in a layout effect, not during render).
const probe = { camera: null as ReturnType<typeof useCamera> | null }
const zooms: number[] = []
const cam = () => probe.camera!

function Farm() {
  const ref = useRef<HTMLDivElement>(null)
  // A callback ref (createElement has no JSX ref sugar).
  const attach = useCallback((el: HTMLDivElement | null) => {
    ref.current = el
  }, [])
  const camera = useCamera(ref, WORLD, { x: WORLD.w / 2, y: WORLD.h / 2 }, WORLD, { initialShot: () => TARGET })
  useLayoutEffect(() => {
    probe.camera = camera
    zooms.push(camera.zoom)
  })
  // The camera's pointer handler, attached natively (as React would for onPointerDown).
  const { onPointerDown } = camera.handlers
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const down = (e: PointerEvent) => onPointerDown(e as never)
    el.addEventListener('pointerdown', down)
    return () => el.removeEventListener('pointerdown', down)
  }, [onPointerDown])
  // `ref` here is React's ref prop, as JSX's ref={attach} would be: the callback runs at commit, not
  // during render (the rule can't see that through createElement; tests here are .ts, no JSX).
  // eslint-disable-next-line react-hooks/refs
  return createElement('div', { ref: attach }, createElement('div', { style: { width: WORLD.w * camera.zoom, height: WORLD.h * camera.zoom } }))
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'Date'] })
  // happy-dom has no layout: give every element the viewport's size.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(VIEW.w)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(VIEW.h)
  zooms.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(createElement(Farm)))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// Advances time one 16 ms frame at a time (one act per frame, so React renders every frame).
const frames = (ms: number) => {
  for (let t = 0; t < ms; t += 16)
    act(() => {
      vi.advanceTimersByTime(16)
    })
}

describe('useCamera initial flight', () => {
  it('starts on the overview, then flies to the target smoothly and lands on it', () => {
    const overview = fitZoom(VIEW, WORLD)
    expect(cam().zoom).toBe(overview)
    frames(FLIGHT_MS / 4)
    const partway = cam().zoom
    expect(partway).toBeGreaterThan(overview)
    expect(partway).toBeLessThan(TARGET.zoom)
    frames(FLIGHT_MS)
    expect(cam().zoom).toBeCloseTo(TARGET.zoom, 5)
    // From the overview on (the first render, before the viewport is measured, is at the default
    // zoom), every step went up: no overshoot, no jitter.
    const fromOverview = zooms.slice(zooms.indexOf(overview))
    const flight = fromOverview.filter((z, i) => i === 0 || z !== fromOverview[i - 1])
    for (let i = 1; i < flight.length; i++) expect(flight[i]).toBeGreaterThanOrEqual(flight[i - 1])
    // Several frames, not a jump.
    expect(flight.length).toBeGreaterThan(5)
  })

  it('a touch mid-flight stops it right there', () => {
    frames(FLIGHT_MS / 4)
    const el = host.firstElementChild as HTMLDivElement
    act(() => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 }))
    })
    const stopped = cam().zoom
    frames(FLIGHT_MS * 2)
    expect(cam().zoom).toBe(stopped)
    expect(cam().zoom).toBeLessThan(TARGET.zoom)
  })

  it('the zoom buttons take over too', () => {
    frames(FLIGHT_MS / 4)
    act(() => cam().zoomOut())
    const chosen = cam().zoom
    frames(FLIGHT_MS * 2)
    expect(cam().zoom).toBe(chosen)
  })

  it('jumps straight there when the player prefers reduced motion', () => {
    act(() => root.unmount())
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('reduce'), media: q }) as MediaQueryList)
    zooms.length = 0
    root = createRoot(host)
    act(() => root.render(createElement(Farm)))
    frames(20)
    expect(cam().zoom).toBeCloseTo(TARGET.zoom, 5)
  })
})
