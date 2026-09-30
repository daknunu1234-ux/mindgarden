import { describe, expect, it } from 'vitest'
import {
  BEACH_TILES,
  beachPalms,
  CLIFF_BANDS,
  CLIFF_DEPTH,
  cliffFaces,
  distantIslets,
  FARM_WORLD,
  grassDetails,
  islandCorners,
  ISLAND_DEPTH,
  undersidePoints,
} from '../lib/diorama'
import { GRID_SIZE, screenToTile, TILE_H, TILE_W } from '../lib/farmGrid'

describe('island corners', () => {
  it('matches the grid diamond at k = 0 and grows evenly with the beach', () => {
    expect(islandCorners(0)).toEqual({
      top: { x: 0, y: 0 },
      right: { x: (GRID_SIZE * TILE_W) / 2, y: (GRID_SIZE * TILE_H) / 2 },
      bottom: { x: 0, y: GRID_SIZE * TILE_H },
      left: { x: (-GRID_SIZE * TILE_W) / 2, y: (GRID_SIZE * TILE_H) / 2 },
    })
    const beach = islandCorners(BEACH_TILES)
    expect(beach.left.x).toBeCloseTo(-(GRID_SIZE / 2 + BEACH_TILES) * TILE_W)
    expect(beach.bottom.y).toBeCloseTo((GRID_SIZE + BEACH_TILES) * TILE_H)
  })
})

describe('cliff strata', () => {
  it('stacks every band on both front faces without gaps', () => {
    const faces = cliffFaces()
    expect(faces).toHaveLength(CLIFF_BANDS.length * 2)
    for (const side of ['left', 'right'] as const) {
      const bands = faces.filter((f) => f.side === side)
      for (let i = 1; i < bands.length; i++) expect(bands[i].points[0].y).toBeCloseTo(bands[i - 1].points[3].y)
      expect(bands.at(-1)!.points[3].y - bands[0].points[0].y).toBeCloseTo(CLIFF_DEPTH)
    }
  })

  it('tapers the underside to a keel under the front corner', () => {
    const { left, right } = undersidePoints()
    const keel = left[2]
    expect(right).toContainEqual(keel)
    expect(keel.x).toBeCloseTo(islandCorners(BEACH_TILES).bottom.x)
    expect(keel.y - islandCorners(BEACH_TILES).bottom.y).toBeCloseTo(ISLAND_DEPTH)
  })

  it('fits the island (beach, cliff and underside) inside the farm world', () => {
    const c = islandCorners(BEACH_TILES)
    const o = FARM_WORLD.origin
    expect(c.left.x + o.x).toBeGreaterThan(0)
    expect(c.right.x + o.x).toBeLessThan(FARM_WORLD.w)
    expect(c.top.y + o.y).toBeGreaterThan(0)
    expect(c.bottom.y + ISLAND_DEPTH + o.y).toBeLessThanOrEqual(FARM_WORLD.h)
  })
})

describe('scatter', () => {
  it('is deterministic per farm and different between farms', () => {
    expect(grassDetails('a')).toEqual(grassDetails('a'))
    expect(grassDetails('a')).not.toEqual(grassDetails('b'))
  })

  it('keeps grass details on the grass, never on the beach', () => {
    for (const d of grassDetails('farm', 200)) {
      const t = screenToTile(d.x, d.y)
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeGreaterThanOrEqual(0)
      expect(t.x).toBeLessThan(GRID_SIZE)
      expect(t.y).toBeLessThan(GRID_SIZE)
    }
  })

  it('puts palms on the sand ring (outside the grass, inside the waterline)', () => {
    for (const p of beachPalms()) {
      const t = screenToTile(p.x, p.y)
      const outside = t.x < 0 || t.y < 0 || t.x >= GRID_SIZE || t.y >= GRID_SIZE
      expect(outside).toBe(true)
      // Inside the beach's outer diamond: |sx|/(W/2) + |sy − centre|/(H/2) ≤ size.
      const cy = (GRID_SIZE * TILE_H) / 2
      expect(Math.abs(p.x) / (TILE_W / 2) + Math.abs(p.y - cy) / (TILE_H / 2)).toBeLessThanOrEqual(GRID_SIZE + 2 * BEACH_TILES + 1e-9)
    }
  })

  it('keeps the distant islets inside the world', () => {
    for (const i of distantIslets(FARM_WORLD)) {
      expect(i.x).toBeGreaterThan(0)
      expect(i.x).toBeLessThan(FARM_WORLD.w)
      expect(i.y).toBeGreaterThan(0)
      expect(i.y).toBeLessThan(FARM_WORLD.h)
    }
  })
})
