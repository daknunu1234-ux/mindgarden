// Stream auto-tiling geometry (pure, unit-tested). A stream tile is drawn as a rounded centre pool
// plus one straight arm towards every linked neighbour (lib/farmGrid.ts `streamLinks`). Each arm runs
// to the middle of the tile's shared edge with the same width on both sides, so two neighbours'
// arms meet exactly and a run of streams reads as one continuous waterway. Shapes are built in tile
// space (u, v ∈ [0, 1]) and mapped to screen space relative to the grid origin.
import { tileToScreen, type Links } from './farmGrid'

export type Pt = { x: number; y: number }

// Layers from the outside in: sandy bank, white foam, turquoise water, a bright centre shine.
export type StreamLayer = 'bank' | 'foam' | 'water' | 'shine'
export const STREAM_LAYERS: readonly StreamLayer[] = ['bank', 'foam', 'water', 'shine']

// Half-widths in tiles. Channels (linked tiles) are narrower than a lone pond.
export const CHANNEL_HALF: Record<StreamLayer, number> = { bank: 0.4, foam: 0.33, water: 0.26, shine: 0.1 }
export const POND_HALF: Record<StreamLayer, number> = { bank: 0.44, foam: 0.38, water: 0.31, shine: 0.14 }

// Rounded (chamfered) square pool of half-size s around the tile centre.
function pool(s: number): [number, number][] {
  const c = s * 0.45
  const lo = 0.5 - s
  const hi = 0.5 + s
  return [
    [lo + c, lo],
    [hi - c, lo],
    [hi, lo + c],
    [hi, hi - c],
    [hi - c, hi],
    [lo + c, hi],
    [lo, hi - c],
    [lo, lo + c],
  ]
}

// Arm from the centre to the middle of one side, h wide on each side of the tile's axis.
function arm(side: keyof Links, h: number): [number, number][] {
  switch (side) {
    case 'north':
      return [
        [0.5 - h, 0],
        [0.5 + h, 0],
        [0.5 + h, 0.5],
        [0.5 - h, 0.5],
      ]
    case 'south':
      return [
        [0.5 - h, 0.5],
        [0.5 + h, 0.5],
        [0.5 + h, 1],
        [0.5 - h, 1],
      ]
    case 'west':
      return [
        [0, 0.5 - h],
        [0.5, 0.5 - h],
        [0.5, 0.5 + h],
        [0, 0.5 + h],
      ]
    case 'east':
      return [
        [0.5, 0.5 - h],
        [1, 0.5 - h],
        [1, 0.5 + h],
        [0.5, 0.5 + h],
      ]
  }
}

const SIDES: readonly (keyof Links)[] = ['north', 'east', 'south', 'west']

// The polygons of one layer of the stream at tile (x, y): its pool, then one arm per link.
export function streamShapes(tile: { x: number; y: number }, links: Links, layer: StreamLayer): Pt[][] {
  const linked = SIDES.filter((s) => links[s])
  const half = (linked.length === 0 ? POND_HALF : CHANNEL_HALF)[layer]
  const toScreen = ([u, v]: [number, number]): Pt => tileToScreen(tile.x + u, tile.y + v)
  return [pool(half), ...linked.map((side) => arm(side, half))].map((shape) => shape.map(toScreen))
}
