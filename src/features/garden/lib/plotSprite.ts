import { PLOT_HALF_H, PLOT_HALF_W } from './farmLayout'

// Pure geometry for one planted plot on the farm (unit-tested): where the tree is drawn, which
// region is the plot's click target, and where its labels float, for a given size-tier scale.

// TreeStageSvg's drawing space: the trunk meets the ground at (TRUNK_X, GROUND_Y), and the view box is
// a VIEW×VIEW square from (VIEW_X, VIEW_Y). It reaches past the trunk's original 120 × 120 box on the
// sides and above, so the lush crowns are never clipped, and is placed so the trunk base stays at
// half the width and nine tenths of the height (TREE_BASE_RATIO), as every scene expects.
export const TREE_VIEW = 150
export const TREE_TRUNK_X = 60
export const TREE_GROUND_Y = 108
export const TREE_VIEW_X = TREE_TRUNK_X - TREE_VIEW / 2
export const TREE_VIEW_Y = TREE_GROUND_Y - TREE_VIEW * 0.9
export const TREE_BASE_RATIO = { x: (TREE_TRUNK_X - TREE_VIEW_X) / TREE_VIEW, y: (TREE_GROUND_Y - TREE_VIEW_Y) / TREE_VIEW } as const
// Topmost painted point of the tallest crowns (stage 5), in view units: the default when the tree's
// own crown top (lib/crownTop.ts crownTopY) isn't given.
export const TREE_TOP_Y = -20
// World pixels from the crown top to the bottom of the action icons: negative, so they just kiss the
// tip of the canopy (2 px over it) instead of floating above it.
export const ACTION_GAP = -2

// Scale about the trunk base (bottom-centre anchor) as one SVG matrix:
// x' = s·x + (1 − s)·ax, y' = s·y + (1 − s)·ay, so (ax, ay) maps onto itself.
export function bottomCenterScale(s: number, ax = TREE_TRUNK_X, ay = TREE_GROUND_Y): string {
  const e = +((1 - s) * ax).toFixed(3)
  const f = +((1 - s) * ay).toFixed(3)
  return `matrix(${s} 0 0 ${s} ${e} ${f})`
}

// Rendered box size of a farm tree at scale 1; tiers scale the drawing inside it (overflow visible).
// 1.1 world pixels per view unit, as before the view box grew.
export const FARM_TREE_SIZE = 165

type Box = { left: number; top: number; width: number; height: number }
type Anchor = { x: number; y: number }

export type PlotSprite = {
  // Click target of the plot: the soil mound only. The canopy is clickable through its painted
  // shapes, so a big tree's empty corners never cover a neighbour.
  hitbox: Box
  // Tree box (unscaled); the trunk base sits exactly on (x, y) whatever the scale.
  tree: Box
  // World y of the (scaled) crown top: this tree's own (`crownTop`), else the tallest crown's.
  treeTop: number
  sign: Anchor
  badge: Anchor
  label: Anchor
  // The tree's action icons (💧 water, 🍎 harvest): their cluster is centred on the trunk and its
  // bottom edge sits here, just above the crown.
  actions: Anchor
}

// World coordinates for the plot centred at (x, y) with a size-tier multiplier `scale` (× the
// species' presence: treeScale) and the crown's top in view units (lib/crownTop.ts crownTopY for its
// species and stage).
export function plotSprite(x: number, y: number, scale = 1, crownTop = TREE_TOP_Y): PlotSprite {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const size = FARM_TREE_SIZE
  const baseY = size * TREE_BASE_RATIO.y
  const unit = size / TREE_VIEW
  const top = Number.isFinite(crownTop) ? crownTop : TREE_TOP_Y
  const treeTop = y - (TREE_GROUND_Y - top) * unit * s
  return {
    hitbox: { left: x - PLOT_HALF_W, top: y - PLOT_HALF_H * 1.05, width: PLOT_HALF_W * 2, height: PLOT_HALF_H * 2.1 },
    tree: { left: x - size * TREE_BASE_RATIO.x, top: y - baseY, width: size, height: size },
    treeTop,
    // Post sign in front of the mound's left half; wooden badge off the right corner. Both hug the
    // mound (not the crown), so they stay put for every tier.
    sign: { x: x - PLOT_HALF_W * 0.7, y: y + PLOT_HALF_H * 0.34 },
    badge: { x: x + PLOT_HALF_W * 0.5, y: y - 6 },
    // The name + progress capsule: centred on the trunk, at the front edge of the tile, just under
    // the tree's base. Below the crown and its bubbles for every tier.
    label: { x, y: y + PLOT_HALF_H * 0.5 },
    // Resting on the tip of the crown (which rises with the stage, the species and the tier).
    actions: { x, y: treeTop - ACTION_GAP },
  }
}
