// The farm's 16 × 16 isometric grid (pure, unit-tested). A placement's (x, y) is its top tile;
// width × height tiles from there. The database enforces the same bounds and overlap rules.
import type { FarmItemType } from './farmCatalog'

export const GRID_SIZE = 16
export const TILE_W = 112
export const TILE_H = 56

export type Placement = {
  id: string
  itemType: FarmItemType
  deckId: string | null
  x: number
  y: number
  width: number
  height: number
  variant: string | null
}

export type Footprint = { x: number; y: number; width: number; height: number }

// Top corner of tile (x, y), relative to the grid origin (the top corner of tile (0, 0)):
// screenX = (x − y) · TILE_W / 2, screenY = (x + y) · TILE_H / 2.
export const tileToScreen = (x: number, y: number): { x: number; y: number } => ({ x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 })

// Centre of a footprint's diamond on screen (where a sprite stands).
export function footprintCenter({ x, y, width, height }: Footprint): { x: number; y: number } {
  const top = tileToScreen(x, y)
  return { x: top.x + ((width - height) * TILE_W) / 4, y: top.y + ((width + height) * TILE_H) / 4 }
}

// The tile under a screen point (inverse of tileToScreen; may be outside the grid).
export function screenToTile(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2)
  const b = sy / (TILE_H / 2)
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) }
}

export const insideGrid = ({ x, y, width, height }: Footprint): boolean => x >= 0 && y >= 0 && x + width <= GRID_SIZE && y + height <= GRID_SIZE

export const overlaps = (a: Footprint, b: Footprint): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

export type PlacementCheck = 'ok' | 'out-of-bounds' | 'occupied'

// Whether a footprint can go down: inside the grid and on no other placement.
export function checkPlacement(placements: readonly Placement[], spot: Footprint): PlacementCheck {
  if (!insideGrid(spot)) return 'out-of-bounds'
  return placements.some((p) => overlaps(p, spot)) ? 'occupied' : 'ok'
}

// Painter's order: things further back (smaller bottom-tile x + y) are drawn first.
export const depthOf = ({ x, y, width, height }: Footprint): number => x + width - 1 + (y + height - 1)

// Which of a tile's four side neighbours hold the same kind of thing (auto-tiling for fences,
// streams and tree plots). north = y − 1, east = x + 1, south = y + 1, west = x − 1.
export type Links = { north: boolean; east: boolean; south: boolean; west: boolean }

export function neighbourLinks(placements: readonly Placement[], itemType: FarmItemType, tile: { x: number; y: number }): Links {
  const has = (x: number, y: number) => placements.some((p) => p.itemType === itemType && p.x === x && p.y === y)
  return {
    north: has(tile.x, tile.y - 1),
    east: has(tile.x + 1, tile.y),
    south: has(tile.x, tile.y + 1),
    west: has(tile.x - 1, tile.y),
  }
}

// A fence's rails join the fences beside it.
export const fenceLinks = (placements: readonly Placement[], fence: { x: number; y: number }): Links => neighbourLinks(placements, 'fence', fence)

// A stream's channels join the streams beside it, so a run of them is one waterway.
export const streamLinks = (placements: readonly Placement[], stream: { x: number; y: number }): Links => neighbourLinks(placements, 'stream', stream)

type Shape = 'straight' | 'corner' | 'tee' | 'cross'

// Tile shape from its links: nothing joined, a straight run, a corner, a T or a cross. A single
// link counts as straight (a channel ending in the tile).
function linkShape(links: Links): 'none' | Shape {
  const count = [links.north, links.east, links.south, links.west].filter(Boolean).length
  if (count === 0) return 'none'
  if (count === 4) return 'cross'
  if (count === 3) return 'tee'
  if (count === 1 || (links.north && links.south) || (links.east && links.west)) return 'straight'
  return 'corner'
}

// Fence tile shape for drawing: a lone post, a straight run, a corner, a T or a cross.
export function fenceVariant(links: Links): 'post' | Shape {
  const shape = linkShape(links)
  return shape === 'none' ? 'post' : shape
}

// Stream tile shape: a lone pond, a straight canal (N–S or E–W, or a channel's end), a bend, a
// T-junction or a 4-way cross.
export function streamVariant(links: Links): 'pond' | Shape {
  const shape = linkShape(links)
  return shape === 'none' ? 'pond' : shape
}

// First free tile for a 1 × 1 item, scanning from the middle outwards (the ghost's starting spot).
export function firstFreeTile(placements: readonly Placement[], width = 1, height = 1): { x: number; y: number } | null {
  const mid = (GRID_SIZE - 1) / 2
  const tiles: { x: number; y: number }[] = []
  for (let x = 0; x <= GRID_SIZE - width; x++) for (let y = 0; y <= GRID_SIZE - height; y++) tiles.push({ x, y })
  tiles.sort((a, b) => Math.abs(a.x - mid) + Math.abs(a.y - mid) - (Math.abs(b.x - mid) + Math.abs(b.y - mid)) || a.x - b.x || a.y - b.y)
  return tiles.find((t) => checkPlacement(placements, { ...t, width, height }) === 'ok') ?? null
}
