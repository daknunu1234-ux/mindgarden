import type { RootNodeView } from '../types'

// Card size and spacing (px). y = 0 is the ground line: the tree trunk enters the soil at
// (trunk.x, 0), a single conduit runs down to the root crown, and branches fan out from there.
export const NODE_W = 184
export const NODE_H = 116
const GAP_X = 20
const GAP_Y = 52
// Depth of the root crown below the ground, and where the first row of cards starts.
export const CROWN_Y = 40
const TRUNK_H = 84
const PAD = 8

export type LaidOutNode = {
  node: RootNodeView
  parentId: string | null
  depth: number
  // Top-left corner of the card.
  x: number
  y: number
}

// from = null means the edge starts at the root crown. (x1, y1) → (x2, y2) are its ends,
// e.g. for a gradient stroke along the line.
export type RootEdge = { from: string | null; to: string; path: string; x1: number; y1: number; x2: number; y2: number }

export type RootLayout = {
  nodes: LaidOutNode[]
  edges: RootEdge[]
  // trunk: where the tree meets the ground (y = 0). crown: end of the main conduit.
  trunk: { x: number; y: number }
  crown: { x: number; y: number }
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

  const crown = { x: trunk.x, y: CROWN_Y }

  const byId = new Map(nodes.map((n) => [n.node.id, n]))
  const edges: RootEdge[] = nodes.map((n) => {
    const x2 = n.x + NODE_W / 2
    const y2 = n.y
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    const x1 = parent ? parent.x + NODE_W / 2 : crown.x
    const y1 = parent ? parent.y + NODE_H : crown.y
    return { from: parent?.node.id ?? null, to: n.node.id, path: curve(x1, y1, x2, y2), x1, y1, x2, y2 }
  })

  return {
    nodes,
    edges,
    trunk,
    crown,
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
