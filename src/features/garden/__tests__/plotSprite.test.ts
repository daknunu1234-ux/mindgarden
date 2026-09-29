import { describe, expect, it } from 'vitest'
import { getTreeSizeTier, TREE_SIZE_TIERS } from '@/shared/lib/treeSkins'
import { layoutFarm, PLOT_HALF_H, PLOT_HALF_W } from '../lib/farmLayout'
import { bottomCenterScale, FARM_TREE_SIZE, plotSprite, TREE_BASE_RATIO, TREE_GROUND_Y, TREE_TRUNK_X } from '../lib/plotSprite'

// Apply an SVG `matrix(a b c d e f)` string to a point.
function applyMatrix(m: string, [x, y]: [number, number]): [number, number] {
  const [a, b, c, d, e, f] = m.replace(/^matrix\(|\)$/g, '').split(' ').map(Number)
  return [a * x + c * y + e, b * x + d * y + f]
}

describe('bottomCenterScale', () => {
  it('keeps the trunk base fixed for every tier', () => {
    for (const { scale } of TREE_SIZE_TIERS) {
      const [x, y] = applyMatrix(bottomCenterScale(scale), [TREE_TRUNK_X, TREE_GROUND_Y])
      expect(x).toBeCloseTo(TREE_TRUNK_X, 6)
      expect(y).toBeCloseTo(TREE_GROUND_Y, 6)
    }
  })

  it('grows the crown up and out (points above the base move further up)', () => {
    const [x, y] = applyMatrix(bottomCenterScale(1.35), [TREE_TRUNK_X - 40, TREE_GROUND_Y - 80])
    expect(y).toBeCloseTo(TREE_GROUND_Y - 108, 6)
    expect(x).toBeCloseTo(TREE_TRUNK_X - 54, 6)
  })
})

describe('plotSprite', () => {
  const X = 400
  const Y = 300

  it('plants the tree box so its base point sits on the plot centre, whatever the tier', () => {
    for (const { scale } of TREE_SIZE_TIERS) {
      const { tree } = plotSprite(X, Y, scale)
      expect(tree.left + tree.width * TREE_BASE_RATIO.x).toBeCloseTo(X, 6)
      expect(tree.top + tree.height * TREE_BASE_RATIO.y).toBeCloseTo(Y, 6)
      expect(tree.width).toBe(FARM_TREE_SIZE)
    }
  })

  it('uses the soil mound as the click target, independent of tree size', () => {
    const small = plotSprite(X, Y, 0.85).hitbox
    const colossal = plotSprite(X, Y, 1.35).hitbox
    expect(colossal).toEqual(small)
    expect(colossal.top).toBeLessThan(Y)
    expect(colossal.top + colossal.height).toBeGreaterThan(Y)
    expect(colossal.height).toBeLessThanOrEqual(PLOT_HALF_H * 2.2)
  })

  it('raises the crown top with the tier and floats the bubbles above it', () => {
    const sm = plotSprite(X, Y, getTreeSizeTier(10).scale)
    const xl = plotSprite(X, Y, getTreeSizeTier(500).scale)
    expect(xl.treeTop).toBeLessThan(sm.treeTop)
    expect(xl.thirsty.y).toBeLessThan(Y - 100)
    expect(Math.abs(xl.thirsty.y - xl.treeTop)).toBeLessThan(10)
  })

  it('keeps sign and badge on the mound, below the crown, for every tier', () => {
    for (const { scale } of TREE_SIZE_TIERS) {
      const { sign, badge, hitbox } = plotSprite(X, Y, scale)
      for (const p of [sign, badge]) {
        expect(p.x).toBeGreaterThanOrEqual(hitbox.left)
        expect(p.x).toBeLessThanOrEqual(hitbox.left + hitbox.width)
        expect(p.y).toBeGreaterThan(Y - PLOT_HALF_H)
      }
    }
  })

  it("never lets a neighbour's mound hitbox cover this plot's sign or badge", () => {
    const { plots } = layoutFarm(9)
    for (const p of plots) {
      const { sign, badge } = plotSprite(p.x, p.y, 1.35)
      for (const q of plots) {
        if (q === p) continue
        const box = plotSprite(q.x, q.y, 1.35).hitbox
        // Diamond test against the neighbour's mound (its clickable soil).
        for (const a of [sign, badge]) {
          const inside = Math.abs(a.x - q.x) / PLOT_HALF_W + Math.abs(a.y - q.y) / (box.height / 2) < 1
          expect(inside).toBe(false)
        }
      }
    }
  })
})
