'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { cameraTransform, DRAG_THRESHOLD, fitCamera, groundScreenY, panBy, wheelZoom, ZOOM_STEP, zoomAround, zoomPercent, type Camera, type Point, type Size } from './chartCamera'

// Zoom and pan for the "Tree & roots" chart. The camera lives in a ref and is written straight to the
// chart element's `transform` (translate3d + scale) once per animation frame, so dragging and
// zooming never re-render React: only the zoom badge's number is state. Maths in chartCamera.ts.
//
// - Drag the background (mouse or one finger) to pan in any direction. A press only becomes a drag
//   after 6 px, and the click that ends a drag is swallowed, so cards and buttons still click.
// - Wheel or trackpad pinch zooms at the cursor; two fingers pinch-zoom at their midpoint. At the
//   zoom limit the wheel is left alone, so the page can scroll on.
// - zoomIn / zoomOut step about the middle of the frame; fit shows the whole chart.
// The frame needs `touch-action: none`.
// `ground` is the chart's ground line (world y): its place on screen is published on the frame as
// `--mg-ground` (px), so the frame can paint sky above it and soil below it however the chart is moved.
export function useChartCamera(frameRef: RefObject<HTMLDivElement | null>, worldRef: RefObject<HTMLDivElement | null>, world: Size, ground = 0) {
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 })
  const view = useRef<Size>({ w: 0, h: 0 })
  const worldSize = useRef(world)
  const groundY = useRef(ground)
  const frame = useRef(0)
  const fitted = useRef(false)
  const [percent, setPercent] = useState(100)

  const pointers = useRef(new Map<number, Point>())
  const drag = useRef<{ id: number; last: Point; start: Point; dragging: boolean } | null>(null)
  const pinch = useRef<{ dist: number; k: number } | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    worldSize.current = world
    groundY.current = ground
  })

  // Writes the camera to the DOM: the chart's transform, and where the ground line now is.
  const draw = useCallback(() => {
    if (worldRef.current) worldRef.current.style.transform = cameraTransform(camera.current)
    frameRef.current?.style.setProperty('--mg-ground', `${groundScreenY(camera.current, groundY.current).toFixed(1)}px`)
  }, [frameRef, worldRef])

  // Paint the camera on the next frame (at most once per frame, however many events arrive).
  const paint = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      draw()
      setPercent(zoomPercent(camera.current.k))
    })
  }, [draw])

  const move = useCallback(
    (next: Camera) => {
      camera.current = next
      paint()
    },
    [paint],
  )

  const fit = useCallback(() => {
    if (view.current.w === 0) return
    move(fitCamera(view.current, worldSize.current))
  }, [move])

  // Measure the frame; fit the chart the first time it has a size.
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      view.current = { w: el.clientWidth, h: el.clientHeight }
      if (!fitted.current && view.current.w > 0) {
        fitted.current = true
        camera.current = fitCamera(view.current, worldSize.current)
        // Before the first paint, so the chart never shows unfitted.
        draw()
        paint()
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [frameRef, draw, paint])

  const zoomTo = useCallback(
    (k: number, anchor?: Point) => {
      const v = view.current
      if (v.w === 0) return
      move(zoomAround(camera.current, anchor ?? { x: v.w / 2, y: v.h / 2 }, k, v, worldSize.current))
    },
    [move],
  )

  // Wheel / trackpad pinch: zoom at the cursor. Native listener: React's wheel events are passive.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const next = wheelZoom(camera.current.k, e.deltaY)
      // Already at the limit in that direction: let the page scroll.
      if (next === camera.current.k) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomTo(next, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [frameRef, zoomTo])

  const local = (e: PointerEvent<HTMLElement>): Point => {
    const rect = frameRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!frameRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const at = local(e)
    pointers.current.set(e.pointerId, at)
    if (pointers.current.size === 1) {
      // A fresh press: a pinch that ended without a click must not swallow this tap.
      suppressClick.current = false
      drag.current = { id: e.pointerId, start: at, last: at, dragging: false }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: camera.current.k }
      drag.current = null
      suppressClick.current = true
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = frameRef.current
    if (!el || !pointers.current.has(e.pointerId)) return
    const at = local(e)
    pointers.current.set(e.pointerId, at)

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      zoomTo(pinch.current.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      return
    }

    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.dragging && Math.hypot(at.x - d.start.x, at.y - d.start.y) > DRAG_THRESHOLD) {
      d.dragging = true
      suppressClick.current = true
      el.setPointerCapture(e.pointerId)
    }
    if (d.dragging) move(panBy(camera.current, at.x - d.last.x, at.y - d.last.y, view.current, worldSize.current))
    d.last = at
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (frameRef.current?.hasPointerCapture(e.pointerId)) frameRef.current.releasePointerCapture(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  // Swallow the click that ends a drag or pinch (capture phase, before a card or button sees it).
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressClick.current = false
    }
  }

  return {
    percent,
    zoomIn: () => zoomTo(camera.current.k * ZOOM_STEP),
    zoomOut: () => zoomTo(camera.current.k / ZOOM_STEP),
    fit,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  }
}
