import type { DeckTreeItem, DeckTreeNode } from '../types'

export type FlatNode = {
  id: string
  parentId: string | null
  title: string
  sortOrder: number
  items: DeckTreeItem[]
}

const bySortOrder = (a: DeckTreeNode, b: DeckTreeNode) =>
  a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)

// Turns the adjacency list into nested roots, siblings ordered by sort_order.
// Nodes unreachable from a root (only possible with an A → B → A cycle) are dropped.
export function buildDeckTree(flat: FlatNode[]): DeckTreeNode[] {
  const childrenOf = new Map<string | null, FlatNode[]>()
  for (const node of flat) {
    const siblings = childrenOf.get(node.parentId) ?? []
    siblings.push(node)
    childrenOf.set(node.parentId, siblings)
  }

  const visit = (parentId: string | null): DeckTreeNode[] =>
    (childrenOf.get(parentId) ?? [])
      .map((n) => ({
        id: n.id,
        title: n.title,
        sortOrder: n.sortOrder,
        items: n.items,
        children: visit(n.id),
      }))
      .sort(bySortOrder)

  return visit(null)
}

// Totals for a deck header; walks the whole tree.
export function countDeckTree(tree: DeckTreeNode[]): { nodeCount: number; itemCount: number } {
  let nodeCount = 0
  let itemCount = 0
  const walk = (nodes: DeckTreeNode[]) => {
    for (const node of nodes) {
      nodeCount += 1
      itemCount += node.items.length
      walk(node.children)
    }
  }
  walk(tree)
  return { nodeCount, itemCount }
}
