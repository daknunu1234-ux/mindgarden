import { MAX_MASTERY } from '@/shared/lib/mastery'
import type { RootNodeView } from '../types'

// "Tree & roots" as a living diorama (pure, unit-tested): the tree stands free at the top, on the
// ground line; a taproot drops from the foot of its trunk into the soil and branches into tendrils
// that reach the top-level roots, and every sub-root hangs under its parent, tier by tier.
// Roots only: statements are never part of the chart (they open in the drawer). A tidy tree: each
// root is centred over its own sub-roots and subtrees never share x-ranges, so cards cannot overlap
// however the tree is shaped.

export const CHART = {
  // The tree's drawing: a square box whose trunk meets the ground at (baseX, baseY) of the box
  // (the garden sprite's base point: half-way across, nine tenths down).
  tree: { size: 220, baseX: 0.5, baseY: 0.9 },
  // The floating label beside the trunk (title, stage, mastery): its size and its gap from the trunk.
  label: { w: 232, h: 54, dx: 46 },
  // How far the taproot runs straight down from the trunk before it branches.
  taproot: 34,
  // A root card (every tier uses the same card): wide enough for a 17 px title beside the ring, with
  // room under two title lines for the row of controls that appears on hover.
  card: { w: 208, h: 104 },
  // Space between neighbouring subtrees, between tiers (room for the curves), and round the chart.
  gapX: 16,
  gapY: 46,
  pad: 32,
} as const

export type ChartBox = { x: number; y: number; w: number; h: number }
export type ChartPoint = { x: number; y: number }

export type ChartCard = ChartBox & {
  nodeId: string
  // null: a top-level root, fed by the taproot.
  parentId: string | null
  // 0 for top-level roots, 1 for their sub-roots, …
  depth: number
}

// A tendril from a parent's foot, or the end of the taproot, (x1, y1) to a child's head (x2, y2).
export type ChartEdge = { from: string | null; to: string; depth: number; x1: number; y1: number; x2: number; y2: number; path: string }

export type RootTreeLayout = {
  // The tree's drawing box; everything inside it is above the ground except the foot of the trunk.
  tree: ChartBox
  // Where the trunk meets the ground: the ground line runs through `base.y`.
  base: ChartPoint
  // The taproot: straight down from the base to where the tendrils branch off.
  taproot: { x: number; y1: number; y2: number; path: string }
  // The floating label, beside the trunk and above the ground.
  label: ChartBox
  cards: ChartCard[]
  edges: ChartEdge[]
  // How many tiers of roots there are (0 for an empty tree).
  tiers: number
  width: number
  height: number
}

const n = (value: number) => +value.toFixed(2)

// A root tendril: leaves the parent straight down, sweeps across, and enters the child from above.
export function tendrilPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${n(x1)} ${n(y1)} C ${n(x1)} ${n(y1 + (y2 - y1) * 0.55)}, ${n(x2)} ${n(y1 + (y2 - y1) * 0.45)}, ${n(x2)} ${n(y2)}`
}

// The taproot as a filled shape: as wide as the trunk's foot at the ground, tapering as it dives.
export function taprootPath(x: number, y1: number, y2: number, top = 11, bottom = 4.5): string {
  const mid = y1 + (y2 - y1) * 0.55
  return [
    `M ${n(x - top)} ${n(y1 - 3)}`,
    `C ${n(x - top)} ${n(mid)}, ${n(x - bottom)} ${n(mid)}, ${n(x - bottom)} ${n(y2)}`,
    `L ${n(x + bottom)} ${n(y2)}`,
    `C ${n(x + bottom)} ${n(mid)}, ${n(x + top)} ${n(mid)}, ${n(x + top)} ${n(y1 - 3)}`,
    'Z',
  ].join(' ')
}

export function layoutRootTree(roots: readonly RootNodeView[]): RootTreeLayout {
  const { tree, label, taproot, card, gapX, gapY, pad } = CHART
  // Width a root's whole subtree needs: its own card, or its sub-roots side by side.
  const spans = new Map<string, number>()
  const span = (node: RootNodeView): number => {
    const below = node.children.reduce((sum, child) => sum + span(child), 0) + Math.max(0, node.children.length - 1) * gapX
    const w = Math.max(card.w, below)
    spans.set(node.id, w)
    return w
  }
  const row = roots.reduce((sum, root) => sum + span(root), 0) + Math.max(0, roots.length - 1) * gapX
  // The tree stands in the middle; the label floats to the right of its trunk, so the chart is at
  // least wide enough for the label on either side of the centre line.
  const above = Math.max(tree.size, (label.dx + label.w) * 2)
  const width = Math.max(row, above) + pad * 2
  const centre = width / 2
  const treeBox: ChartBox = { x: centre - tree.size * tree.baseX, y: pad, w: tree.size, h: tree.size }
  const base: ChartPoint = { x: centre, y: pad + tree.size * tree.baseY }
  const tapEnd = base.y + taproot
  const labelBox: ChartBox = { x: centre + label.dx, y: base.y - label.h - 10, w: label.w, h: label.h }
  const tierY = (depth: number) => tapEnd + gapY + depth * (card.h + gapY)

  const cards: ChartCard[] = []
  const edges: ChartEdge[] = []
  // Lays a subtree out inside [left, left + its span]; the root sits centred over its sub-roots.
  const place = (node: RootNodeView, parent: ChartCard | null, depth: number, left: number) => {
    const w = spans.get(node.id) ?? card.w
    const box: ChartCard = { nodeId: node.id, parentId: parent?.nodeId ?? null, depth, x: left + w / 2 - card.w / 2, y: tierY(depth), w: card.w, h: card.h }
    cards.push(box)
    const from = parent ? { x: parent.x + parent.w / 2, y: parent.y + parent.h } : { x: base.x, y: tapEnd }
    const to = { x: box.x + box.w / 2, y: box.y }
    edges.push({ from: parent?.nodeId ?? null, to: node.id, depth, x1: from.x, y1: from.y, x2: to.x, y2: to.y, path: tendrilPath(from.x, from.y, to.x, to.y) })
    const below = node.children.reduce((sum, child) => sum + (spans.get(child.id) ?? card.w), 0) + Math.max(0, node.children.length - 1) * gapX
    let x = left + (w - below) / 2
    for (const child of node.children) {
      place(child, box, depth + 1, x)
      x += (spans.get(child.id) ?? card.w) + gapX
    }
  }
  let x = (width - row) / 2
  for (const root of roots) {
    place(root, null, 0, x)
    x += (spans.get(root.id) ?? card.w) + gapX
  }

  const tiers = cards.reduce((max, c) => Math.max(max, c.depth + 1), 0)
  // An empty tree still shows a little soil under its foot.
  const bottom = tiers === 0 ? tapEnd + gapY : tierY(tiers - 1) + card.h
  return {
    tree: treeBox,
    base,
    taproot: { x: base.x, y1: base.y, y2: tapEnd, path: taprootPath(base.x, base.y, tapEnd) },
    label: labelBox,
    cards,
    edges,
    tiers,
    width,
    height: bottom + pad,
  }
}

// A root's status badge, from what it displays (hooks/nodeMastery `displayMastery`): nothing to
// master yet, not started, growing, nearly there (two thirds of the way), or fully mastered.
export type RootStatus = 'empty' | 'seed' | 'growing' | 'thriving' | 'mighty'

export function rootStatus(mastery: number | null): RootStatus {
  if (mastery === null) return 'empty'
  if (mastery >= MAX_MASTERY) return 'mighty'
  if (mastery >= (MAX_MASTERY * 2) / 3) return 'thriving'
  return mastery > 0 ? 'growing' : 'seed'
}

export const ROOT_STATUS_LABEL: Record<RootStatus, string> = {
  empty: 'No statements',
  seed: 'Seed',
  growing: 'Growing',
  thriving: 'Thriving',
  mighty: 'Mighty Root',
}

// How many roots sit below a root (its sub-roots, at any depth).
export function subRootCount(node: Pick<RootNodeView, 'children'>): number {
  return node.children.reduce((sum, child) => sum + 1 + subRootCount(child), 0)
}
