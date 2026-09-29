import { describe, expect, it } from 'vitest'
import { layoutFarm, pointInPolygon } from '../lib/farmLayout'
import { frontEdge, grassPatches } from '../lib/islandTerrain'

describe('grassPatches', () => {
  const { island } = layoutFarm(6)

  it('is deterministic for the same island and seed', () => {
    expect(grassPatches(island.points, 'a')).toEqual(grassPatches(island.points, 'a'))
    expect(grassPatches(island.points, 'a')).not.toEqual(grassPatches(island.points, 'b'))
  })

  it('keeps every patch centre on the island, flattened for the isometric view', () => {
    const patches = grassPatches(island.points, 'x', 24)
    expect(patches.length).toBeGreaterThan(10)
    for (const p of patches) {
      expect(pointInPolygon([p.x, p.y], island.points)).toBe(true)
      expect(p.ry).toBeLessThan(p.rx)
    }
  })

  it('mixes sunlit and shaded tones', () => {
    const tones = new Set(grassPatches(island.points, 'x').map((p) => p.tone))
    expect(tones.has('lime')).toBe(true)
    expect(tones.has('deep')).toBe(true)
  })

  it('handles degenerate outlines', () => {
    expect(grassPatches([], 'x')).toEqual([])
    expect(grassPatches(island.points, 'x', 0)).toEqual([])
  })
})

describe('frontEdge', () => {
  it('returns only the lower half of the outline (the visible cliff)', () => {
    const { island } = layoutFarm(4)
    const front = frontEdge(island.points)
    const cy = island.points.reduce((s, p) => s + p[1], 0) / island.points.length
    expect(front.length).toBeGreaterThan(0)
    expect(front.every((p) => p[1] > cy)).toBe(true)
  })
})
