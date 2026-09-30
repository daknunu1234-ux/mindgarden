import { describe, expect, it } from 'vitest'
import { calculateTreeBuff, calculateWoodshopRefund, treeBuff, WOODSHOP_REFUND_CAP } from '../lib/farmBuffs'
import type { Placement } from '../lib/farmGrid'

let n = 0
const place = (itemType: Placement['itemType'], x: number, y: number, size = 1): Placement => ({
  id: `p${n++}`,
  itemType,
  deckId: itemType === 'tree' ? `deck-${n}` : null,
  x,
  y,
  width: size,
  height: size,
  variant: null,
})

describe('calculateTreeBuff: Stream (adjacency)', () => {
  it('gives ×1.2 when a stream is on a side tile (x ± 1 or y ± 1)', () => {
    for (const [sx, sy] of [
      [6, 5],
      [4, 5],
      [5, 6],
      [5, 4],
    ]) {
      expect(calculateTreeBuff(5, 5, [place('stream', sx, sy)])).toBe(1.2)
    }
  })

  it('ignores diagonal and farther streams, and other items next to the tree', () => {
    expect(calculateTreeBuff(5, 5, [place('stream', 6, 6)])).toBe(1)
    expect(calculateTreeBuff(5, 5, [place('stream', 7, 5)])).toBe(1)
    expect(calculateTreeBuff(5, 5, [place('fence', 6, 5), place('rockery', 5, 6)])).toBe(1)
  })

  it('does not stack streams: two adjacent streams are still ×1.2', () => {
    expect(calculateTreeBuff(5, 5, [place('stream', 6, 5), place('stream', 4, 5)])).toBe(1.2)
  })
})

describe("calculateTreeBuff: Farmer's House (4 × 4 area)", () => {
  // A 2 × 2 house at (4, 4) covers tiles 4–5; its area is 3–6 on both axes.
  const house = place('farmer_house', 4, 4, 2)

  it('gives ×1.5 anywhere in the 4 × 4 square around the house', () => {
    for (const [x, y] of [
      [3, 3],
      [6, 6],
      [3, 6],
      [6, 3],
      [5, 3],
    ]) {
      expect(calculateTreeBuff(x, y, [house])).toBe(1.5)
    }
  })

  it('stops outside that square', () => {
    for (const [x, y] of [
      [2, 4],
      [7, 4],
      [4, 7],
      [4, 2],
      [7, 7],
    ]) {
      expect(calculateTreeBuff(x, y, [house])).toBe(1)
    }
  })

  it('stacks with a stream: ×1.8', () => {
    expect(treeBuff(3, 5, [house, place('stream', 2, 5)])).toEqual({ multiplier: 1.8, stream: true, house: true })
  })

  it('is ×1 on an empty farm', () => {
    expect(treeBuff(8, 8, [])).toEqual({ multiplier: 1, stream: false, house: false })
  })
})

describe('calculateWoodshopRefund', () => {
  const woodshop = place('woodshop', 0, 0, 2)

  it('refunds 25% of the statements, rounded down, with a Woodshop on the farm', () => {
    expect(calculateWoodshopRefund(40, [woodshop])).toBe(10)
    expect(calculateWoodshopRefund(7, [woodshop])).toBe(1)
    expect(calculateWoodshopRefund(3, [woodshop])).toBe(0)
  })

  it('refunds nothing without a Woodshop', () => {
    expect(calculateWoodshopRefund(40, [place('farmer_house', 0, 0, 2)])).toBe(0)
  })

  it('never pays more than the cap (chopping can never profit)', () => {
    expect(WOODSHOP_REFUND_CAP).toBe(50)
    expect(calculateWoodshopRefund(1000, [woodshop])).toBe(50)
    expect(calculateWoodshopRefund(200, [woodshop])).toBe(50)
    expect(calculateWoodshopRefund(-5, [woodshop])).toBe(0)
  })
})
