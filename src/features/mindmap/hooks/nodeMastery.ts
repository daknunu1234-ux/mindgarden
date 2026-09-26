import type { ItemLevels, RootNodeView } from '../types'

// Average mastery (0–3) of a node's own items; null when the node has no items.
export function nodeMastery(node: Pick<RootNodeView, 'items'>, levels: ItemLevels): number | null {
  if (node.items.length === 0) return null
  const total = node.items.reduce((sum, item) => sum + (levels[item.id] ?? 0), 0)
  return total / node.items.length
}

// frontend/ARCHITECTURE.md §5: 0.35 + 0.65 × (mastery / 3). Nodes without items stay at the floor.
export function rootOpacity(mastery: number | null): number {
  const m = Math.min(3, Math.max(0, mastery ?? 0))
  return 0.35 + 0.65 * (m / 3)
}
