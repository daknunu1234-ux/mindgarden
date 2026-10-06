import type { DeckTreeNode } from '../types'

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
