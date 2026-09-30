// Island diorama geometry (pure, unit-tested): the sandy beach ring around the 16 × 16 grass grid,
// the layered cliff under the island's two front faces, its tapered rocky underside, and the
// deterministic scatter of grass tufts, flowers, palms, distant islets and clouds. All points are
// relative to the grid origin (the top corner of tile (0, 0)), like lib/farmGrid.ts.
import { seededRandom } from '@/shared/utils/seededRandom'
import { GRID_SIZE, TILE_H, TILE_W, tileToScreen } from './farmGrid'

export type Pt = { x: number; y: number }

// Sand ring width around the grass, in tiles.
export const BEACH_TILES = 0.75

// Cliff strata under the front edges, top to bottom (px thick): grass lip, terracotta topsoil,
// deep soil, stone. Then the rocky underside tapers to a point this far below.
export const CLIFF_BANDS = [
  { id: 'lip', thickness: 9 },
  { id: 'topsoil', thickness: 24 },
  { id: 'soil', thickness: 20 },
  { id: 'stone', thickness: 22 },
] as const
export type CliffBandId = (typeof CLIFF_BANDS)[number]['id']
export const CLIFF_DEPTH = CLIFF_BANDS.reduce((sum, b) => sum + b.thickness, 0)
export const UNDERSIDE_DEPTH = 96

// The four corners of the grid diamond grown by `k` tiles on every side.
export function islandCorners(k = 0): { top: Pt; right: Pt; bottom: Pt; left: Pt } {
  const n = 0 - k // not -k: keeps k = 0 at +0
  return {
    top: tileToScreen(n, n),
    right: tileToScreen(GRID_SIZE + k, n),
    bottom: tileToScreen(GRID_SIZE + k, GRID_SIZE + k),
    left: tileToScreen(n, GRID_SIZE + k),
  }
}

// How far below the beach's outer rim the island reaches (cliff + underside).
export const ISLAND_DEPTH = CLIFF_DEPTH + UNDERSIDE_DEPTH

export type CliffFace = { band: CliffBandId; side: 'left' | 'right'; points: Pt[] }

// One quad per band per front face (left face: left → bottom corner, right face: bottom → right).
export function cliffFaces(k = BEACH_TILES): CliffFace[] {
  const { left, bottom, right } = islandCorners(k)
  const faces: CliffFace[] = []
  let depth = 0
  for (const band of CLIFF_BANDS) {
    const d0 = depth
    const d1 = depth + band.thickness
    const down = (p: Pt, d: number): Pt => ({ x: p.x, y: p.y + d })
    faces.push({ band: band.id, side: 'left', points: [down(left, d0), down(bottom, d0), down(bottom, d1), down(left, d1)] })
    faces.push({ band: band.id, side: 'right', points: [down(bottom, d0), down(right, d0), down(right, d1), down(bottom, d1)] })
    depth = d1
  }
  return faces
}

// The rocky underside: from the cliff's bottom edge down to a keel point under the island centre.
export function undersidePoints(k = BEACH_TILES): { left: Pt[]; right: Pt[] } {
  const { left, bottom, right } = islandCorners(k)
  const at = (p: Pt): Pt => ({ x: p.x, y: p.y + CLIFF_DEPTH })
  const keel: Pt = { x: bottom.x, y: bottom.y + CLIFF_DEPTH + UNDERSIDE_DEPTH }
  // Two lobes so the underside reads as a chunky rock rather than a spike.
  const lobeL: Pt = { x: left.x + (bottom.x - left.x) * 0.55, y: at(left).y + (at(bottom).y - at(left).y) * 0.55 + UNDERSIDE_DEPTH * 0.32 }
  const lobeR: Pt = { x: right.x + (bottom.x - right.x) * 0.55, y: at(right).y + (at(bottom).y - at(right).y) * 0.55 + UNDERSIDE_DEPTH * 0.32 }
  return { left: [at(left), at(bottom), keel, lobeL], right: [at(bottom), at(right), lobeR, keel] }
}

export type GrassDetail = { x: number; y: number; kind: 'tuft' | 'flower'; color: string; scale: number }

const FLOWERS = ['#ff6b6b', '#ffd23f', '#ffffff', '#ff8fb1', '#ffa94d'] as const

// Tufts and tiny flowers scattered over the grass (same farm = same scatter). Points stay inside
// their tile's diamond (never on the beach).
export function grassDetails(seed: string, count = 72): GrassDetail[] {
  const random = seededRandom(`grass:${seed}`)
  const out: GrassDetail[] = []
  for (let i = 0; i < count; i++) {
    const tx = Math.floor(random() * GRID_SIZE)
    const ty = Math.floor(random() * GRID_SIZE)
    // A point inside the tile's diamond: offsets u, v in (0.2, 0.8) of the tile.
    const u = 0.2 + random() * 0.6
    const v = 0.2 + random() * 0.6
    const p = tileToScreen(tx + u, ty + v)
    const flower = random() < 0.35
    out.push({
      x: p.x,
      y: p.y,
      kind: flower ? 'flower' : 'tuft',
      color: flower ? FLOWERS[Math.floor(random() * FLOWERS.length)] : '#2f9e44',
      scale: 0.8 + random() * 0.5,
    })
  }
  return out
}

// Palms on the beach: the three visible corners plus a few along the front shores (on the sand,
// halfway between the grass edge and the waterline).
export function beachPalms(): { x: number; y: number; scale: number; flip: boolean }[] {
  const mid = BEACH_TILES / 2
  const spots: [number, number, number, boolean][] = [
    [-mid, -mid, 1.1, false],
    [GRID_SIZE + mid, -mid, 0.95, true],
    [-mid, GRID_SIZE + mid, 1.05, false],
    [GRID_SIZE + mid, 5.5, 0.85, true],
    [4.5, GRID_SIZE + mid, 0.9, false],
    [GRID_SIZE + mid, GRID_SIZE + mid, 1.15, true],
  ]
  return spots.map(([tx, ty, scale, flip]) => ({ ...tileToScreen(tx, ty), scale, flip }))
}

// Where the diorama sits in its world box (see FarmIsometricGrid FARM_WORLD): distant islets
// hover in the four ocean corners, far enough from the island not to crowd it.
export function distantIslets(world: { w: number; h: number }): { x: number; y: number; scale: number; delay: number }[] {
  return [
    { x: world.w * 0.1, y: world.h * 0.2, scale: 0.55, delay: 0 },
    { x: world.w * 0.9, y: world.h * 0.16, scale: 0.45, delay: -3 },
    { x: world.w * 0.08, y: world.h * 0.84, scale: 0.7, delay: -1.5 },
    { x: world.w * 0.92, y: world.h * 0.8, scale: 0.6, delay: -4.5 },
  ]
}

// World box of the farm canvas: the island plus ocean all round, sky above for tall trees at the
// back, and room below for the cliff and the floating island's underside.
const SIDE = 150
const HEADROOM = 250
const BOTTOM = 290
export const FARM_WORLD = {
  w: GRID_SIZE * TILE_W + SIDE * 2,
  h: GRID_SIZE * TILE_H + HEADROOM + BOTTOM,
  // Top corner of tile (0, 0).
  origin: { x: SIDE + (GRID_SIZE * TILE_W) / 2, y: HEADROOM },
} as const
