import { PLOT_HALF_H, PLOT_HALF_W } from './farmLayout'

// Pure geometry for one planted plot on the farm (unit-tested): where the tree is drawn, which
// region is the plot's click target, and where its labels float, for a given size-tier scale.

// TreeStageSvg's drawing space: a VIEW×VIEW box whose trunk meets the ground at (TRUNK_X, GROUND_Y).
export const TREE_VIEW = 120
export const TREE_TRUNK_X = 60
export const TREE_GROUND_Y = 108
export const TREE_BASE_RATIO = { x: TREE_TRUNK_X / TREE_VIEW, y: TREE_GROUND_Y / TREE_VIEW } as const
// Topmost painted point of the tallest drawing (stage 5 aura/sparkles), in view units.
const TREE_TOP_Y = 2

// Scale about the trunk base (bottom-centre anchor) as one SVG matrix:
// x' = s·x + (1 − s)·ax, y' = s·y + (1 − s)·ay, so (ax, ay) maps onto itself.
export function bottomCenterScale(s: number, ax = TREE_TRUNK_X, ay = TREE_GROUND_Y): string {
  const e = +((1 - s) * ax).toFixed(3)
  const f = +((1 - s) * ay).toFixed(3)
  return `matrix(${s} 0 0 ${s} ${e} ${f})`
}

// Rendered box size of a farm tree at scale 1; tiers scale the drawing inside it (overflow visible).
export const FARM_TREE_SIZE = 132

type Box = { left: number; top: number; width: number; height: number }
type Anchor = { x: number; y: number }

export type PlotSprite = {
  // Click target of the plot: the soil mound only. The canopy is clickable through its painted
  // shapes, so a big tree's empty corners never cover a neighbour.
  hitbox: Box
  // Tree box (unscaled); the trunk base sits exactly on (x, y) whatever the scale.
  tree: Box
  // World y of the (scaled) crown top.
  treeTop: number
  sign: Anchor
  badge: Anchor
  thirsty: Anchor
  mighty: Anchor
}

// World coordinates for the plot centred at (x, y) with a size-tier multiplier `scale`.
export function plotSprite(x: number, y: number, scale = 1): PlotSprite {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const size = FARM_TREE_SIZE
  const baseY = size * TREE_BASE_RATIO.y
  const unit = size / TREE_VIEW
  const treeTop = y - (TREE_GROUND_Y - TREE_TOP_Y) * unit * s
  return {
    hitbox: { left: x - PLOT_HALF_W, top: y - PLOT_HALF_H * 1.05, width: PLOT_HALF_W * 2, height: PLOT_HALF_H * 2.1 },
    tree: { left: x - size * TREE_BASE_RATIO.x, top: y - baseY, width: size, height: size },
    treeTop,
    // Post sign in front of the mound's left half; wooden badge off the right corner. Both hug the
    // mound (not the crown), so they stay put for every tier.
    sign: { x: x - PLOT_HALF_W * 0.7, y: y + PLOT_HALF_H * 0.34 },
    badge: { x: x + PLOT_HALF_W * 0.5, y: y - 6 },
    // Bubbles ride just above the crown, spreading with it.
    thirsty: { x: x + 30 * s, y: treeTop + 2 },
    mighty: { x: x - 46 * s, y: treeTop + 4 },
  }
}
