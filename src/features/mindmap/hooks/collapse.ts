import type { RootNodeView } from '../types'

// Number of roots below a node (children, grandchildren, …).
export function countDescendants(node: RootNodeView): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0)
}

// Copy of the tree with the children of collapsed roots removed, for layout only.
// Mastery and "Drill branch" keep using the full nodes, so collapsing never changes them.
export function pruneCollapsed(nodes: RootNodeView[], collapsed: ReadonlySet<string>): RootNodeView[] {
  return nodes.map((node) => ({
    ...node,
    children: collapsed.has(node.id) ? [] : pruneCollapsed(node.children, collapsed),
  }))
}

// Every root id in the tree, depth-first (used for "collapse all").
export function allNodeIds(nodes: RootNodeView[]): string[] {
  return nodes.flatMap((node) => [node.id, ...allNodeIds(node.children)])
}
