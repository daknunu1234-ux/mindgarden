'use client'

import { useCallback, useRef, type PointerEvent, type RefObject } from 'react'

type Drag = { x: number; y: number; left: number; top: number; pointerId: number }

// Clicks on these keep working; drags that start on them don't pan.
const INTERACTIVE = 'a, button, input, select, textarea, article, [role="button"], [data-no-pan]'

// Mouse drag on empty canvas scrolls the container (touch already scrolls natively).
// Spread the returned handlers on the scroll container.
export function useDragPan(ref: RefObject<HTMLElement | null>) {
  const drag = useRef<Drag | null>(null)

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const el = ref.current
      if (!el || e.pointerType !== 'mouse' || e.button !== 0) return
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return
      drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, pointerId: e.pointerId }
      el.setPointerCapture(e.pointerId)
    },
    [ref],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const el = ref.current
      const d = drag.current
      if (!el || !d || d.pointerId !== e.pointerId) return
      el.scrollLeft = d.left - (e.clientX - d.x)
      el.scrollTop = d.top - (e.clientY - d.y)
    },
    [ref],
  )

  const end = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (drag.current?.pointerId === e.pointerId) {
        ref.current?.releasePointerCapture(e.pointerId)
        drag.current = null
      }
    },
    [ref],
  )

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
}
