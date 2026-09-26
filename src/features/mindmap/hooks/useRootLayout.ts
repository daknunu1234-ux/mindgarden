import type { RootNodeView } from '../types'

// Card size and spacing (px). Roots grow downward from a trunk point at the top center.
export const NODE_W = 184
export const NODE_H = 116
const GAP_X = 20
const GAP_Y = 52
const TRUNK_H = 44
const PAD = 8

export type LaidOutNode = {
  node: RootNodeView
  parentId: string | null
  depth: number
  // Top-left corner of the card.
  x: number
  y: number
}

// from = null means the edge starts at the trunk.
export type RootEdge = { from: string | null; to: string; path: string }

export type RootLayout = {
  nodes: LaidOutNode[]
  edges: RootEdge[]
  trunk: { x: number; y: number }
  width: number
  height: number
}

// Smooth S-curve from a parent's bottom center to a child's top center.
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

// Tidy top-down layout: leaves take evenly spaced slots left to right, each parent is
// centered over its first and last child, rows are spaced by depth. Pure, so it is unit-tested.
export function layoutRoots(roots: RootNodeView[]): RootLayout {
  const nodes: LaidOutNode[] = []
  let nextSlot = 0
  let maxDepth = 0

  // Returns the node's center x.
  const place = (node: RootNodeView, parentId: string | null, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth)
    const entry: LaidOutNode = { node, parentId, depth, x: 0, y: TRUNK_H + depth * (NODE_H + GAP_Y) }
    nodes.push(entry)

    let cx: number
    if (node.children.length === 0) {
      cx = PAD + nextSlot * (NODE_W + GAP_X) + NODE_W / 2
      nextSlot += 1
    } else {
      const centers = node.children.map((child) => place(child, node.id, depth + 1))
      cx = (centers[0] + centers[centers.length - 1]) / 2
    }
    entry.x = cx - NODE_W / 2
    return cx
  }

  const topCenters = roots.map((root) => place(root, null, 0))
  const trunk = {
    x: topCenters.length > 0 ? (topCenters[0] + topCenters[topCenters.length - 1]) / 2 : PAD + NODE_W / 2,
    y: 0,
  }

  const byId = new Map(nodes.map((n) => [n.node.id, n]))
  const edges: RootEdge[] = nodes.map((n) => {
    const toX = n.x + NODE_W / 2
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    return parent
      ? { from: parent.node.id, to: n.node.id, path: curve(parent.x + NODE_W / 2, parent.y + NODE_H, toX, n.y) }
      : { from: null, to: n.node.id, path: curve(trunk.x, trunk.y, toX, n.y) }
  })

  return {
    nodes,
    edges,
    trunk,
    width: Math.max(nextSlot, 1) * (NODE_W + GAP_X) - GAP_X + PAD * 2,
    height: roots.length === 0 ? 0 : TRUNK_H + (maxDepth + 1) * (NODE_H + GAP_Y) - GAP_Y + PAD,
  }
}

// Ids on the path from the trunk to `id` (inclusive), used to highlight a hovered branch.
export function ancestorPath(layout: RootLayout, id: string | null): Set<string> {
  const parentOf = new Map(layout.nodes.map((n) => [n.node.id, n.parentId]))
  const path = new Set<string>()
  let current = id
  while (current && !path.has(current)) {
    path.add(current)
    current = parentOf.get(current) ?? null
  }
  return path
}
