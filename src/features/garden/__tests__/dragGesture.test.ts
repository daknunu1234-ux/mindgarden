import { describe, expect, it } from 'vitest'
import { FARM_WORLD } from '../lib/diorama'
import { dropOutcome, HOLD_MS, holdMs, pressOutcome, slopPx, tileAtPoint } from '../lib/dragGesture'
import { footprintCenter, GRID_SIZE, type Placement } from '../lib/farmGrid'
import { applyOps, rollback, type FarmOp } from '../lib/optimistic'

const item = (id: string, itemType: Placement['itemType'], x: number, y: number, size = 1, variant: string | null = null): Placement => ({
  id,
  itemType,
  deckId: itemType === 'tree' ? `deck-${id}` : null,
  x,
  y,
  width: size,
  height: size,
  variant,
})

// A farm with a tree, a 2 × 2 Farmer's House, a Woodshop, a stream, a fence, a rockery and a cow.
const FARM: Placement[] = [
  item('tree', 'tree', 1, 1),
  item('house', 'farmer_house', 4, 4, 2),
  item('shop', 'woodshop', 10, 10, 2),
  item('stream', 'stream', 7, 2),
  item('fence', 'fence', 8, 2),
  item('rock', 'rockery', 12, 3),
  item('cow', 'animal', 3, 9, 1, 'cow'),
]

describe('hold to pick up, move first to pan', () => {
  it('a press that holds still for the hold time picks the thing up', () => {
    const press = { pointerType: 'mouse', x: 100, y: 100 }
    expect(pressOutcome(press, { x: 101, y: 100 }, HOLD_MS.mouse - 1)).toBe('pending')
    expect(pressOutcome(press, { x: 101, y: 101 }, HOLD_MS.mouse)).toBe('drag')
  })

  it('moving past the slop before the hold is a camera pan, never a drag', () => {
    const press = { pointerType: 'touch', x: 0, y: 0 }
    expect(pressOutcome(press, { x: 30, y: 0 }, 50)).toBe('pan')
    expect(pressOutcome(press, { x: 30, y: 0 }, 5000)).toBe('pan')
  })

  it('a finger holds longer and may wobble more than a mouse', () => {
    expect(holdMs('touch')).toBeGreaterThan(holdMs('mouse'))
    expect(slopPx('touch')).toBeGreaterThan(slopPx('mouse'))
    // An unknown pointer type is treated like a finger (the safe, longer hold).
    expect(holdMs('quantum')).toBe(holdMs('touch'))
  })
})

describe('screen point → tile (the camera scales the world)', () => {
  const box = (zoom: number, left = 40, top = 20) => ({ left, top, width: FARM_WORLD.w * zoom, height: FARM_WORLD.h * zoom })
  // The on-screen point at the centre of a tile, at a zoom.
  const pointOf = (x: number, y: number, zoom: number, b = box(zoom)) => {
    const c = footprintCenter({ x, y, width: 1, height: 1 })
    return { x: b.left + (c.x + FARM_WORLD.origin.x) * zoom, y: b.top + (c.y + FARM_WORLD.origin.y) * zoom }
  }

  it('finds the tile under the pointer at any zoom', () => {
    for (const zoom of [0.35, 0.8, 1, 1.8]) {
      for (const [x, y] of [
        [0, 0],
        [15, 15],
        [7, 3],
        [0, 15],
      ]) {
        expect(tileAtPoint(pointOf(x, y, zoom), box(zoom), FARM_WORLD), `${x},${y} @${zoom}`).toEqual({ x, y })
      }
    }
  })

  it('reports tiles off the 16 × 16 grid as such (the drop checks bounds) and refuses an unmeasured box', () => {
    const off = tileAtPoint(pointOf(GRID_SIZE + 2, 3, 1), box(1), FARM_WORLD)!
    expect(off.x).toBeGreaterThanOrEqual(GRID_SIZE)
    expect(tileAtPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, FARM_WORLD)).toBeNull()
  })
})

describe('where a dragged thing lands', () => {
  it('moves trees and every kind of item to a free tile', () => {
    for (const id of ['tree', 'stream', 'fence', 'rock', 'cow']) expect(dropOutcome(FARM, id, { x: 14, y: 14 }), id).toBe('move')
    expect(dropOutcome(FARM, 'house', { x: 13, y: 0 })).toBe('move')
  })

  it('keeps 2 × 2 buildings whole on the island: no hanging off the edge', () => {
    expect(dropOutcome(FARM, 'house', { x: 14, y: 14 })).toBe('move')
    expect(dropOutcome(FARM, 'house', { x: 15, y: 14 })).toBe('off-island')
    expect(dropOutcome(FARM, 'shop', { x: 0, y: 15 })).toBe('off-island')
  })

  it('refuses a tile taken by something else, but a building may shuffle over its own footprint', () => {
    expect(dropOutcome(FARM, 'stream', { x: 8, y: 2 })).toBe('blocked') // onto the fence
    expect(dropOutcome(FARM, 'rock', { x: 5, y: 5 })).toBe('blocked') // into the house's 2 × 2
    expect(dropOutcome(FARM, 'house', { x: 9, y: 9 })).toBe('blocked') // overlaps the Woodshop
    expect(dropOutcome(FARM, 'house', { x: 5, y: 4 })).toBe('move') // one tile over its old self
  })

  it('a release where it stood is a tap; off the island it goes back', () => {
    expect(dropOutcome(FARM, 'cow', { x: 3, y: 9 })).toBe('same')
    expect(dropOutcome(FARM, 'cow', null)).toBe('off-island')
    expect(dropOutcome(FARM, 'cow', { x: -1, y: 4 })).toBe('off-island')
    expect(dropOutcome(FARM, 'missing', { x: 1, y: 1 })).toBe('blocked')
  })
})

describe('the move is optimistic for every kind of item', () => {
  it('shows a building, a stream and an animal at the new tile at once, and a refusal puts them back', () => {
    const ops: FarmOp[] = [
      { key: 'm1', kind: 'move', id: 'house', to: { x: 12, y: 12 } },
      { key: 'm2', kind: 'move', id: 'stream', to: { x: 0, y: 5 } },
      { key: 'm3', kind: 'move', id: 'cow', to: { x: 6, y: 13 } },
    ]
    const moved = applyOps(FARM, ops)
    expect(moved.find((p) => p.id === 'house')).toMatchObject({ x: 12, y: 12, width: 2, height: 2 })
    expect(moved.find((p) => p.id === 'stream')).toMatchObject({ x: 0, y: 5 })
    expect(moved.find((p) => p.id === 'cow')).toMatchObject({ x: 6, y: 13, variant: 'cow' })
    // The server refused the stream's move: only it goes back.
    const back = applyOps(FARM, rollback(ops, 'm2'))
    expect(back.find((p) => p.id === 'stream')).toMatchObject({ x: 7, y: 2 })
    expect(back.find((p) => p.id === 'house')).toMatchObject({ x: 12, y: 12 })
    expect(FARM.find((p) => p.id === 'house')).toMatchObject({ x: 4, y: 4 })
  })
})
