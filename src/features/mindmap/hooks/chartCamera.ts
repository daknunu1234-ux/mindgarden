// Camera maths for the "Tree & roots" chart (pure, unit-tested). The chart is one element moved with
// a single CSS transform, `translate3d(x, y, 0) scale(k)` from its top-left corner, so a world point
// (wx, wy) lands on the screen at (wx · k + x, wy · k + y). Nothing here touches the DOM.

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 1.8
// One press of + / −.
export const ZOOM_STEP = 1.25
// A pointer must travel this far before a press becomes a drag (so taps on cards still click).
export const DRAG_THRESHOLD = 6
// At least this much of the chart stays on screen however far it is dragged (screen px).
const KEEP_VISIBLE = 96
// Breathing room round the chart when it is fitted to the frame.
const FIT_MARGIN = 24

export type Camera = { x: number; y: number; k: number }
export type Size = { w: number; h: number }
export type Point = { x: number; y: number }

export const clampZoom = (k: number): number => (Number.isFinite(k) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k)) : 1)

// The transform that draws the camera. translate3d keeps the chart on its own compositor layer.
export const cameraTransform = ({ x, y, k }: Camera): string => `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${k.toFixed(4)})`

// Where a world y (the chart's ground line) is on screen.
export const groundScreenY = (camera: Camera, worldY: number): number => worldY * camera.k + camera.y

// The zoom as the badge shows it ("100%").
export const zoomPercent = (k: number): number => Math.round(k * 100)

// Keeps the chart from being dragged out of sight: some of it always stays inside the frame.
export function clampPan(camera: Camera, view: Size, world: Size): Camera {
  if (view.w <= 0 || view.h <= 0) return camera
  const keepX = Math.min(KEEP_VISIBLE, view.w / 2)
  const keepY = Math.min(KEEP_VISIBLE, view.h / 2)
  return {
    k: camera.k,
    x: Math.min(view.w - keepX, Math.max(keepX - world.w * camera.k, camera.x)),
    y: Math.min(view.h - keepY, Math.max(keepY - world.h * camera.k, camera.y)),
  }
}

// Zooms to `next` (clamped) keeping the world point under `anchor` (screen px in the frame) still.
export function zoomAround(camera: Camera, anchor: Point, next: number, view: Size, world: Size): Camera {
  const k = clampZoom(next)
  if (k === camera.k) return camera
  const wx = (anchor.x - camera.x) / camera.k
  const wy = (anchor.y - camera.y) / camera.k
  return clampPan({ k, x: anchor.x - wx * k, y: anchor.y - wy * k }, view, world)
}

// Moves the chart by a screen-space delta.
export const panBy = (camera: Camera, dx: number, dy: number, view: Size, world: Size): Camera => clampPan({ k: camera.k, x: camera.x + dx, y: camera.y + dy }, view, world)

// Fit to screen: the largest zoom (never above 100%) that shows the whole chart, centred sideways.
// A chart shorter than the frame is centred vertically too; a taller one starts at its top (the tree).
export function fitCamera(view: Size, world: Size): Camera {
  if (view.w <= 0 || view.h <= 0 || world.w <= 0 || world.h <= 0) return { x: 0, y: 0, k: 1 }
  const k = clampZoom(Math.min(1, (view.w - FIT_MARGIN * 2) / world.w, (view.h - FIT_MARGIN * 2) / world.h))
  const freeY = view.h - world.h * k
  return { k, x: (view.w - world.w * k) / 2, y: freeY >= 0 ? freeY / 2 : FIT_MARGIN }
}

// The zoom a wheel notch asks for: smooth, proportional to how far the wheel turned.
export const wheelZoom = (k: number, deltaY: number): number => clampZoom(k * Math.exp(-deltaY * 0.0022))
