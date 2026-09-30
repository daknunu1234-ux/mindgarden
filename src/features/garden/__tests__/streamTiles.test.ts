import { describe, expect, it } from 'vitest'
import { treeBuff } from '../lib/farmBuffs'
import { streamLinks, streamVariant, tileToScreen, type Links, type Placement } from '../lib/farmGrid'
import { CHANNEL_HALF, STREAM_LAYERS, streamShapes } from '../lib/streamTiles'

const at = (itemType: Placement['itemType'], x: number, y: number): Placement => ({
  id: `${itemType}-${x}-${y}`,
  itemType,
  deckId: itemType === 'tree' ? `deck-${x}-${y}` : null,
  x,
  y,
  width: 1,
  height: 1,
  variant: null,
})

const none: Links = { north: false, east: false, south: false, west: false }

describe('stream auto-tiling', () => {
  it('links only to streams on the four sides', () => {
    const farm = [at('stream', 5, 5), at('stream', 5, 4), at('stream', 6, 5), at('fence', 4, 5), at('stream', 6, 6)]
    expect(streamLinks(farm, { x: 5, y: 5 })).toEqual({ north: true, east: true, south: false, west: false })
  })

  it('picks pond, straight, corner, T and cross', () => {
    expect(streamVariant(none)).toBe('pond')
    expect(streamVariant({ ...none, north: true, south: true })).toBe('straight')
    expect(streamVariant({ ...none, east: true, west: true })).toBe('straight')
    expect(streamVariant({ ...none, east: true })).toBe('straight')
    for (const bend of [
      { north: true, east: true },
      { north: true, west: true },
      { south: true, east: true },
      { south: true, west: true },
    ]) {
      expect(streamVariant({ ...none, ...bend })).toBe('corner')
    }
    expect(streamVariant({ north: true, east: true, south: true, west: false })).toBe('tee')
    expect(streamVariant({ north: true, east: true, south: true, west: true })).toBe('cross')
  })

  it('draws a pool plus one arm per link', () => {
    expect(streamShapes({ x: 2, y: 2 }, none, 'water')).toHaveLength(1)
    expect(streamShapes({ x: 2, y: 2 }, { north: true, east: true, south: true, west: true }, 'water')).toHaveLength(5)
  })

  it('meets its neighbour exactly at the shared edge, in every layer', () => {
    const edgePoints = (shape: { x: number; y: number }[], edge: { x: number; y: number }[]) =>
      shape.filter((p) => edge.some((e) => Math.abs(e.x - p.x) < 1e-9 && Math.abs(e.y - p.y) < 1e-9))
    for (const layer of STREAM_LAYERS) {
      // (3, 4) → east arm; (4, 4) → west arm: both end on the edge x = 4.
      const eastArm = streamShapes({ x: 3, y: 4 }, { ...none, east: true }, layer)[1]
      const westArm = streamShapes({ x: 4, y: 4 }, { ...none, west: true }, layer)[1]
      expect(edgePoints(westArm, eastArm)).toHaveLength(2)
      // The two edge points sit symmetrically about the edge's midpoint, CHANNEL_HALF apart.
      const mid = tileToScreen(4, 4.5)
      const [a, b] = edgePoints(westArm, eastArm)
      expect((a.x + b.x) / 2).toBeCloseTo(mid.x)
      expect((a.y + b.y) / 2).toBeCloseTo(mid.y)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(tileToScreen(0, 2 * CHANNEL_HALF[layer]).x, tileToScreen(0, 2 * CHANNEL_HALF[layer]).y))
    }
  })

  it('stays inside its own tile', () => {
    const links = { north: true, east: true, south: true, west: true }
    for (const layer of STREAM_LAYERS) {
      for (const shape of streamShapes({ x: 7, y: 9 }, links, layer)) {
        for (const p of shape) {
          // In tile units: u = (sx/(W/2) + sy/(H/2)) / 2, v = (sy/(H/2) − sx/(W/2)) / 2.
          const u = (p.x / 56 + p.y / 28) / 2 - 7
          const v = (p.y / 28 - p.x / 56) / 2 - 9
          expect(u).toBeGreaterThanOrEqual(-1e-9)
          expect(u).toBeLessThanOrEqual(1 + 1e-9)
          expect(v).toBeGreaterThanOrEqual(-1e-9)
          expect(v).toBeLessThanOrEqual(1 + 1e-9)
        }
      }
    }
  })
})

describe('joined streams keep the tree buff', () => {
  it('still gives ×1.2 to a tree beside a river, and nothing to one diagonal to it', () => {
    const river = [at('stream', 4, 3), at('stream', 4, 4), at('stream', 4, 5), at('stream', 5, 5)]
    expect(treeBuff(3, 4, river)).toEqual({ multiplier: 1.2, stream: true, house: false })
    expect(treeBuff(5, 4, river)).toEqual({ multiplier: 1.2, stream: true, house: false })
    expect(treeBuff(6, 6, river).stream).toBe(false)
    // A river through a Farmer's House aura stacks to ×1.8, same as a single stream.
    expect(treeBuff(3, 4, [...river, { ...at('farmer_house', 2, 2), width: 2, height: 2 }]).multiplier).toBe(1.8)
  })
})
