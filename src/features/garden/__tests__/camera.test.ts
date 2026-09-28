import { describe, expect, it } from 'vitest'
import { centreOffset, centreOn, clampZoom, contentSize, fitZoom, MAX_ZOOM, MIN_ZOOM, worldAt, zoomAt } from '../lib/camera'

const WORLD = { w: 1600, h: 1100 }
const VIEW = { w: 800, h: 600 }

describe('zoom limits and fit', () => {
  it('clamps zoom to the allowed range', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM)
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(1)).toBe(1)
  })

  it('fits the whole world (never enlarging) and survives an unmeasured viewport', () => {
    const z = fitZoom(VIEW, WORLD)
    expect(WORLD.w * z).toBeLessThanOrEqual(VIEW.w)
    expect(WORLD.h * z).toBeLessThanOrEqual(VIEW.h)
    expect(fitZoom({ w: 4000, h: 4000 }, WORLD)).toBe(1)
    expect(fitZoom({ w: 0, h: 0 }, WORLD)).toBe(1)
    expect(fitZoom({ w: 100, h: 100 }, WORLD)).toBe(MIN_ZOOM) // tiny phone: floor, then pan
  })

  it('centres a world smaller than the viewport', () => {
    expect(centreOffset(800, 400, 1)).toBe(200)
    expect(centreOffset(800, 1600, 1)).toBe(0)
    expect(contentSize(VIEW, WORLD, 0.25)).toEqual(VIEW)
  })
})

describe('zoomAt keeps the point under the cursor fixed', () => {
  const cases = [
    { scroll: { left: 300, top: 200 }, anchor: { x: 400, y: 300 }, from: 1, to: 1.25 },
    { scroll: { left: 300, top: 200 }, anchor: { x: 120, y: 80 }, from: 1, to: 0.8 },
    { scroll: { left: 0, top: 0 }, anchor: { x: 650, y: 500 }, from: 0.6, to: 1.4 },
    { scroll: { left: 900, top: 500 }, anchor: { x: 700, y: 550 }, from: 1.5, to: 1.8 },
  ]

  it.each(cases)('from $from to $to at ($anchor.x, $anchor.y)', ({ scroll, anchor, from, to }) => {
    const before = worldAt(scroll, anchor, VIEW, WORLD, from)
    const next = zoomAt(scroll, anchor, VIEW, WORLD, from, to)
    const after = worldAt(next, anchor, VIEW, WORLD, to)
    // Exact unless the scroll had to be clamped at an edge.
    const content = contentSize(VIEW, WORLD, to)
    const clamped = next.left <= 0 || next.top <= 0 || next.left >= content.w - VIEW.w || next.top >= content.h - VIEW.h
    if (!clamped) {
      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.y).toBeCloseTo(before.y, 6)
    }
    expect(next.left).toBeGreaterThanOrEqual(0)
    expect(next.top).toBeGreaterThanOrEqual(0)
  })

  it('never scrolls past the content', () => {
    const next = zoomAt({ left: 5000, top: 5000 }, { x: 0, y: 0 }, VIEW, WORLD, 1, 1)
    expect(next).toEqual({ left: WORLD.w - VIEW.w, top: WORLD.h - VIEW.h })
  })
})

describe('centreOn', () => {
  it('puts a world point in the middle of the viewport', () => {
    const s = centreOn({ x: 800, y: 550 }, VIEW, WORLD, 1)
    expect(s).toEqual({ left: 400, top: 250 })
    const p = worldAt(s, { x: VIEW.w / 2, y: VIEW.h / 2 }, VIEW, WORLD, 1)
    expect([p.x, p.y]).toEqual([800, 550])
  })

  it('clamps at the edges and handles a world smaller than the viewport', () => {
    expect(centreOn({ x: 0, y: 0 }, VIEW, WORLD, 1)).toEqual({ left: 0, top: 0 })
    expect(centreOn({ x: 800, y: 550 }, VIEW, WORLD, 0.3)).toEqual({ left: 0, top: 0 })
  })
})
