'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { centreOn, clampZoom, easeOutCubic, fitZoom, shotBetween, worldAt, ZOOM_STEP, zoomAt, type CameraShot, type Scroll, type Size } from '@/shared/lib/camera'

const DRAG_THRESHOLD = 6
// How long the camera takes to fly to a target (ease-out).
export const FLIGHT_MS = 520

export type CameraOptions = {
  // Where to look once the viewport is first measured. null = stay on the default fit-and-centre view.
  // Called once, with the measured viewport.
  initialShot?: (view: Size) => CameraShot | null
  // true (default): fit-and-centre first, then fly to the initial shot (FLIGHT_MS, ease-out).
  // false: jump straight to it, for heavy canvases that should not rescale every frame.
  animateInitialShot?: boolean
}

type Pointer = { x: number; y: number }

// Camera for zoomable canvases (Farm World, mindmap): pan by dragging (mouse or one finger),
// pinch with two fingers, Ctrl/⌘ + wheel (trackpad pinch) to zoom at the cursor, and buttons.
// The container needs `touch-action: none`; a drag longer than 6px swallows the click that ends
// it, so dragging across a card never opens it. Math lives in shared/lib/camera.ts.
// `fit` is the size to fit on arrival and on reset (default: the whole world), centred on `focus`.
// `flyTo` animates to a shot; any touch, drag, pinch, wheel zoom, zoom button or reset by the player
// cancels a flight at once (the player always wins), and reduced motion jumps straight there.
export function useCamera(
  scrollRef: RefObject<HTMLDivElement | null>,
  world: Size,
  focus: { x: number; y: number },
  fit: Size = world,
  options: CameraOptions = {},
) {
  const [view, setView] = useState<Size>({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const pendingScroll = useRef<Scroll | null>(null)
  const pointers = useRef(new Map<number, Pointer>())
  const pan = useRef<{ start: Pointer; scroll: Scroll; dragging: boolean; id: number } | null>(null)
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const suppressClick = useRef(false)
  const initialised = useRef(false)
  // The running flight's animation frame (0 = none).
  const flight = useRef(0)
  const initialShot = useRef(options.initialShot)
  const animateInitialShot = useRef(options.animateInitialShot !== false)
  // Latest values for native listeners (wheel) without re-subscribing.
  const live = useRef({ zoom, view, world })
  useEffect(() => {
    live.current = { zoom, view, world }
  })

  // Measure the viewport.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [scrollRef])

  // Apply a scroll computed for the new zoom once React has resized the canvas.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pendingScroll.current) {
      el.scrollTo(pendingScroll.current.left, pendingScroll.current.top)
      pendingScroll.current = null
    }
  })

  const cancelFlight = useCallback(() => {
    if (flight.current) cancelAnimationFrame(flight.current)
    flight.current = 0
  }, [])
  useEffect(() => cancelFlight, [cancelFlight])

  // Puts the camera on a shot right away (one frame of a flight, or a jump).
  const showShot = useCallback(
    (shot: CameraShot) => {
      const el = scrollRef.current
      const { zoom: from, view: v, world: w } = live.current
      if (!el || v.w === 0) return
      const to = clampZoom(shot.zoom)
      const scroll = centreOn(shot.center, v, w, to)
      live.current = { ...live.current, zoom: to }
      if (to === from) {
        el.scrollTo(scroll.left, scroll.top)
        return
      }
      // The canvas resizes on the next render; the scroll follows it (layout effect above).
      pendingScroll.current = scroll
      setZoom(to)
    },
    [scrollRef],
  )

  // Animates from wherever the camera is to `shot` (ease-out over `ms`). Starts on the next frame, so
  // a view set just before (the first fit) is in place to start from.
  const flyTo = useCallback(
    (shot: CameraShot, ms = FLIGHT_MS) => {
      cancelFlight()
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
      let from: CameraShot | null = null
      let started = 0
      const step = (now: number) => {
        const el = scrollRef.current
        const { zoom: z, view: v, world: w } = live.current
        if (!el || v.w === 0) {
          flight.current = 0
          return
        }
        if (!from) {
          from = { center: worldAt({ left: el.scrollLeft, top: el.scrollTop }, { x: v.w / 2, y: v.h / 2 }, v, w, z), zoom: z }
          started = now
        }
        const t = reduced || ms <= 0 ? 1 : (now - started) / ms
        showShot(shotBetween(from, shot, easeOutCubic(t)))
        flight.current = t < 1 ? requestAnimationFrame(step) : 0
      }
      flight.current = requestAnimationFrame(step)
    },
    [cancelFlight, scrollRef, showShot],
  )

  const zoomTo = useCallback(
    (next: number, anchor?: Pointer) => {
      cancelFlight()
      const el = scrollRef.current
      const { zoom: from, view: v, world: w } = live.current
      const to = clampZoom(next)
      if (!el || to === from || v.w === 0) return
      const a = anchor ?? { x: v.w / 2, y: v.h / 2 }
      pendingScroll.current = zoomAt({ left: el.scrollLeft, top: el.scrollTop }, a, v, w, from, to)
      live.current = { ...live.current, zoom: to }
      setZoom(to)
    },
    [cancelFlight, scrollRef],
  )

  const resetView = useCallback(() => {
    cancelFlight()
    const { view: v, world: w } = live.current
    if (v.w === 0) return
    const z = fitZoom(v, fit)
    pendingScroll.current = centreOn(focus, v, w, z)
    live.current = { ...live.current, zoom: z }
    setZoom(z)
    // Same zoom: no re-render, so scroll now.
    if (z === zoom) {
      scrollRef.current?.scrollTo(pendingScroll.current.left, pendingScroll.current.top)
      pendingScroll.current = null
    }
  }, [cancelFlight, fit, focus, scrollRef, zoom])

  // First measurement: jump directly to the initial shot when requested, otherwise fit
  // the world before the usual camera flight.
  useEffect(() => {
    if (!initialised.current && view.w > 0) {
      initialised.current = true
      const shot = initialShot.current?.(view)
      if (shot && !animateInitialShot.current) {
        showShot(shot)
      } else {
        resetView()
        if (shot) flyTo(shot)
      }
    }
  }, [view, resetView, flyTo, showShot])

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms at the cursor; a plain wheel keeps scrolling.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Any wheel (scrolling too) is the player taking over: stop a flight.
      cancelFlight()
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomTo(live.current.zoom * Math.exp(-e.deltaY * 0.0025), { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cancelFlight, scrollRef, zoomTo])

  const local = (e: PointerEvent<HTMLElement>): Pointer => {
    const rect = scrollRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    // A touch or click is the player taking over: stop a flight.
    cancelFlight()
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size === 1) {
      // A fresh press: a pinch that ended without a click must not swallow this tap.
      suppressClick.current = false
      pan.current = { start: local(e), scroll: { left: el.scrollLeft, top: el.scrollTop }, dragging: false, id: e.pointerId }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: live.current.zoom }
      pan.current = null
      suppressClick.current = true
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, local(e))

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomTo(pinch.current.zoom * (dist / pinch.current.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      return
    }

    const p = pan.current
    if (!p || p.id !== e.pointerId) return
    const at = local(e)
    const dx = at.x - p.start.x
    const dy = at.y - p.start.y
    if (!p.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      p.dragging = true
      suppressClick.current = true
      el.setPointerCapture(e.pointerId)
    }
    if (p.dragging) el.scrollTo(p.scroll.left - dx, p.scroll.top - dy)
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (scrollRef.current?.hasPointerCapture(e.pointerId)) scrollRef.current.releasePointerCapture(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pan.current?.id === e.pointerId) pan.current = null
  }

  // Swallow the click that ends a drag or pinch (capture phase, before the plot button sees it).
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressClick.current = false
    }
  }

  // Hand a pointer over to something else (the farm's drag-and-drop): the camera forgets it, so
  // moving it no longer pans, and the click that ends it is swallowed.
  const release = useCallback((pointerId: number) => {
    pointers.current.delete(pointerId)
    if (pan.current?.id === pointerId) pan.current = null
    pinch.current = null
    suppressClick.current = true
  }, [])

  return {
    zoom,
    view,
    release,
    flyTo,
    cancelFlight,
    zoomIn: () => zoomTo(live.current.zoom * ZOOM_STEP),
    zoomOut: () => zoomTo(live.current.zoom / ZOOM_STEP),
    resetView,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
    },
  }
}
