import { fitBox, type Box, type CameraShot, type Size } from '@/shared/lib/camera'
import { FARM_WORLD } from './diorama'
import { footprintCenter, type Placement } from './farmGrid'
import { FARM_TREE_SIZE, TREE_BASE_RATIO } from './plotSprite'

// Where the farm's camera settles on arrival (pure, tested): on the player's trees, from their tiles
// alone (no DOM measuring). No tree: null (the camera keeps its overview of the whole island). One or
// more: the box around them, padded for their crowns, framed with a 17.5% margin and never closer
// than FOCUS_MAX_ZOOM, so a lone tree is shown close up but not filling the screen.

export const FOCUS_MARGIN = 0.175
export const FOCUS_MAX_ZOOM = 1.3

// How far a tree reaches from its ground point at scale 1, in world pixels: its crown above (the
// sprite box above the trunk base) and to the sides, its name capsule below.
const ABOVE = FARM_TREE_SIZE * TREE_BASE_RATIO.y
const SIDE = FARM_TREE_SIZE * 0.4
const BELOW = 30

// The world point a tree stands on (the centre of its tile), as the grid draws it.
export function treeGround(p: Pick<Placement, 'x' | 'y' | 'width' | 'height'>): { x: number; y: number } {
  const c = footprintCenter(p)
  return { x: c.x + FARM_WORLD.origin.x, y: c.y + FARM_WORLD.origin.y }
}

// The box (world pixels) around trees standing on these ground points, each drawn at its own scale
// (size tier × species presence; 1 when unknown). Null for no trees.
export function treesBox(trees: readonly { x: number; y: number; scale?: number }[]): Box | null {
  if (trees.length === 0) return null
  const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const t of trees) {
    const s = t.scale && t.scale > 0 ? t.scale : 1
    box.left = Math.min(box.left, t.x - SIDE * s)
    box.right = Math.max(box.right, t.x + SIDE * s)
    box.top = Math.min(box.top, t.y - ABOVE * s)
    box.bottom = Math.max(box.bottom, t.y + BELOW)
  }
  return box
}

// The camera shot that frames the farm's trees in `view`, or null when there are none.
// `scaleOf(deckId)`: how big that tree is drawn (treeScale); 1 when not given.
export function farmFocus(placements: readonly Placement[], view: Size, scaleOf?: (deckId: string) => number | undefined): CameraShot | null {
  const trees = placements
    .filter((p) => p.itemType === 'tree')
    .map((p) => ({ ...treeGround(p), scale: (p.deckId && scaleOf?.(p.deckId)) || 1 }))
  const box = treesBox(trees)
  return box ? fitBox(box, view, FOCUS_MARGIN, FOCUS_MAX_ZOOM) : null
}
