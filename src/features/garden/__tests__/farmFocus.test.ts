import { describe, expect, it } from 'vitest'
import { centreOffset, easeOutCubic, fitBox, MIN_ZOOM, shotBetween, type Size } from '@/shared/lib/camera'
import { FARM_WORLD } from '../lib/diorama'
import { farmFocus, FOCUS_MARGIN, FOCUS_MAX_ZOOM, treeGround, treesBox } from '../lib/farmFocus'
import type { Placement } from '../lib/farmGrid'

const DESKTOP: Size = { w: 1440, h: 800 }
const PHONE: Size = { w: 390, h: 700 }
const tree = (id: string, x: number, y: number): Placement => ({ id, itemType: 'tree', deckId: `d-${id}`, x, y, width: 1, height: 1, variant: null })
const house: Placement = { id: 'h', itemType: 'farmer_house', deckId: null, x: 2, y: 2, width: 2, height: 2, variant: null }

// What part of the world a shot shows (world pixels), given the viewport.
function visible(shot: { center: { x: number; y: number }; zoom: number }, view: Size) {
  const w = view.w / shot.zoom
  const h = view.h / shot.zoom
  return { left: shot.center.x - w / 2, right: shot.center.x + w / 2, top: shot.center.y - h / 2, bottom: shot.center.y + h / 2, w, h }
}

describe('camera flight maths', () => {
  it('fitBox frames a box with the margin free on every side, capped at a max zoom', () => {
    const box = { left: 100, top: 200, right: 500, bottom: 400 }
    const shot = fitBox(box, { w: 1000, h: 1000 }, 0.2, 5)
    expect(shot.center).toEqual({ x: 300, y: 300 })
    // 400 wide must fit in 60% of 1000 px: zoom 1.5 (the height allows more).
    expect(shot.zoom).toBeCloseTo(1.5)
    expect(fitBox(box, { w: 1000, h: 1000 }, 0.2, 1.2).zoom).toBe(1.2)
    expect(fitBox({ left: 0, top: 0, right: 50_000, bottom: 10 }, { w: 1000, h: 1000 }).zoom).toBe(MIN_ZOOM)
  })

  it('eases out: fast to start, gentle to land, clamped to 0..1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeOutCubic(2)).toBe(1)
    expect(easeOutCubic(-1)).toBe(0)
  })

  it('moves the centre in a straight line and the zoom geometrically', () => {
    const a = { center: { x: 0, y: 0 }, zoom: 0.5 }
    const b = { center: { x: 100, y: 50 }, zoom: 2 }
    expect(shotBetween(a, b, 0)).toEqual(a)
    expect(shotBetween(a, b, 1)).toEqual(b)
    const mid = shotBetween(a, b, 0.5)
    expect(mid.center).toEqual({ x: 50, y: 25 })
    expect(mid.zoom).toBeCloseTo(1)
  })
})

describe('farmFocus: where the farm camera settles on arrival', () => {
  it('no trees: no target (the overview of the whole island stays), buildings alone included', () => {
    expect(farmFocus([], DESKTOP)).toBeNull()
    expect(farmFocus([house], DESKTOP)).toBeNull()
  })

  it('one tree: close up (1.3×), centred on the tree itself (crown and trunk, not just its tile)', () => {
    for (const view of [DESKTOP, PHONE]) {
      const shot = farmFocus([tree('a', 9, 4), house], view)!
      expect(shot.zoom).toBe(FOCUS_MAX_ZOOM)
      expect(shot.zoom).toBeGreaterThanOrEqual(1.2)
      expect(shot.zoom).toBeLessThanOrEqual(1.4)
      const ground = treeGround({ x: 9, y: 4, width: 1, height: 1 })
      expect(shot.center.x).toBeCloseTo(ground.x)
      // Above the tile: the middle of the drawn tree.
      expect(shot.center.y).toBeLessThan(ground.y)
      const seen = visible(shot, view)
      expect(seen.left).toBeLessThan(ground.x)
      expect(seen.right).toBeGreaterThan(ground.x)
    }
  })

  it('several trees: every tree inside the view with the margin free around them, desktop and phone', () => {
    const trees = [tree('a', 3, 3), tree('b', 12, 5), tree('c', 6, 11), tree('d', 10, 10)]
    for (const view of [DESKTOP, PHONE]) {
      const shot = farmFocus([...trees, house], view)!
      const box = treesBox(trees.map(treeGround))!
      const seen = visible(shot, view)
      if (shot.zoom > MIN_ZOOM) {
        // The padded box sits inside the view with at least the margin free on its tighter axis.
        expect(box.left - seen.left).toBeGreaterThanOrEqual(seen.w * FOCUS_MARGIN - 1)
        expect(seen.right - box.right).toBeGreaterThanOrEqual(seen.w * FOCUS_MARGIN - 1)
        expect(box.top - seen.top).toBeGreaterThanOrEqual(seen.h * FOCUS_MARGIN - 1)
        expect(seen.bottom - box.bottom).toBeGreaterThanOrEqual(seen.h * FOCUS_MARGIN - 1)
      }
      for (const t of trees) {
        const g = treeGround(t)
        expect(g.x).toBeGreaterThan(seen.left)
        expect(g.x).toBeLessThan(seen.right)
      }
    }
  })

  it('frames a close pair closer than a spread-out farm, and bigger trees with more room', () => {
    const pair = farmFocus([tree('a', 7, 7), tree('b', 8, 7)], DESKTOP)!
    const spread = farmFocus([tree('a', 0, 0), tree('b', 15, 15)], DESKTOP)!
    expect(pair.zoom).toBeGreaterThan(spread.zoom)
    const small = farmFocus([tree('a', 4, 4), tree('b', 9, 9)], PHONE, () => 0.85)!
    const big = farmFocus([tree('a', 4, 4), tree('b', 9, 9)], PHONE, () => 1.6)!
    expect(big.zoom).toBeLessThanOrEqual(small.zoom)
  })

  it('stays inside the world', () => {
    const shot = farmFocus([tree('a', 0, 0), tree('b', 15, 15)], PHONE)!
    expect(shot.center.x).toBeGreaterThan(0)
    expect(shot.center.x).toBeLessThan(FARM_WORLD.w)
    expect(shot.center.y).toBeGreaterThan(0)
    expect(shot.center.y).toBeLessThan(FARM_WORLD.h)
    expect(centreOffset(PHONE.w, FARM_WORLD.w, shot.zoom)).toBeGreaterThanOrEqual(0)
  })
})
