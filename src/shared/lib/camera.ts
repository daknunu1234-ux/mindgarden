// Farm camera math (pure, unit-tested). The world is drawn at `zoom` inside a scroll container;
// when the zoomed world is smaller than the viewport it is centred, so that offset is part of the math.

export const MIN_ZOOM = 0.35
export const MAX_ZOOM = 1.8
export const ZOOM_STEP = 1.25

export type Size = { w: number; h: number }
export type Scroll = { left: number; top: number }

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

// Largest zoom (≤ 1) that shows the whole world, never below MIN_ZOOM.
export function fitZoom(view: Size, world: Size): number {
  if (view.w <= 0 || view.h <= 0) return 1
  return clampZoom(Math.min(1, (view.w * 0.96) / world.w, (view.h * 0.96) / world.h))
}

// Offset of the world inside the scroll area when it is narrower/shorter than the viewport.
export const centreOffset = (view: number, world: number, zoom: number) => Math.max(0, (view - world * zoom) / 2)

// Size of the scrollable area at a zoom (always at least the viewport).
export const contentSize = (view: Size, world: Size, zoom: number): Size => ({
  w: Math.max(view.w, world.w * zoom),
  h: Math.max(view.h, world.h * zoom),
})

function clampScroll(s: Scroll, view: Size, world: Size, zoom: number): Scroll {
  const content = contentSize(view, world, zoom)
  return {
    left: Math.min(Math.max(0, s.left), content.w - view.w),
    top: Math.min(Math.max(0, s.top), content.h - view.h),
  }
}

// World coordinates under a viewport point.
export function worldAt(scroll: Scroll, anchor: { x: number; y: number }, view: Size, world: Size, zoom: number) {
  return {
    x: (scroll.left + anchor.x - centreOffset(view.w, world.w, zoom)) / zoom,
    y: (scroll.top + anchor.y - centreOffset(view.h, world.h, zoom)) / zoom,
  }
}

// New scroll so the world point under `anchor` stays under it after zooming from → to.
export function zoomAt(
  scroll: Scroll,
  anchor: { x: number; y: number },
  view: Size,
  world: Size,
  from: number,
  to: number,
): Scroll {
  const p = worldAt(scroll, anchor, view, world, from)
  return clampScroll(
    {
      left: p.x * to + centreOffset(view.w, world.w, to) - anchor.x,
      top: p.y * to + centreOffset(view.h, world.h, to) - anchor.y,
    },
    view,
    world,
    to,
  )
}

// Scroll that centres a world point in the viewport (clamped to the scrollable area).
export function centreOn(point: { x: number; y: number }, view: Size, world: Size, zoom: number): Scroll {
  return clampScroll(
    {
      left: point.x * zoom + centreOffset(view.w, world.w, zoom) - view.w / 2,
      top: point.y * zoom + centreOffset(view.h, world.h, zoom) - view.h / 2,
    },
    view,
    world,
    zoom,
  )
}
