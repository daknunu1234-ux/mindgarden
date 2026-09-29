import { MAX_MASTERY } from '@/shared/lib/mastery'
import type { ItemLevels, RootNodeView } from '../types'

const average = (ids: string[], levels: ItemLevels) =>
  ids.reduce((sum, id) => sum + (levels[id] ?? 0), 0) / ids.length

// Average mastery (0–5) of a node's own items; null when the node has no items.
export function nodeMastery(node: Pick<RootNodeView, 'items'>, levels: ItemLevels): number | null {
  if (node.items.length === 0) return null
  return average(
    node.items.map((i) => i.id),
    levels,
  )
}

// Every item id in the node and its sub-roots (what "Drill branch" practices).
export function branchItemIds(node: RootNodeView): string[] {
  return [...node.items.map((i) => i.id), ...node.children.flatMap(branchItemIds)]
}

// What a root displays: its own items' mastery (frontend/ARCHITECTURE.md §5), or, for a
// grouping root without items of its own, the average over its branch. Null if the branch is empty.
export function displayMastery(node: RootNodeView, levels: ItemLevels): number | null {
  const own = nodeMastery(node, levels)
  if (own !== null) return own
  const ids = branchItemIds(node)
  return ids.length === 0 ? null : average(ids, levels)
}

// A root is a "Mighty Root" when everything it displays is fully mastered.
export const isMightyRoot = (mastery: number | null) => mastery !== null && mastery >= MAX_MASTERY

// frontend/ARCHITECTURE.md §5: 0.35 + 0.65 × (mastery / 5). Nodes without items stay at the floor.
export function rootOpacity(mastery: number | null): number {
  const m = Math.min(MAX_MASTERY, Math.max(0, mastery ?? 0))
  return 0.35 + 0.65 * (m / MAX_MASTERY)
}
