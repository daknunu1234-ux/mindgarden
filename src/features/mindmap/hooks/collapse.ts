import type { RootNodeView } from '../types'

// Every root id in the tree, depth-first.
export function allNodeIds(nodes: RootNodeView[]): string[] {
  return nodes.flatMap((node) => [node.id, ...allNodeIds(node.children)])
}

// Roots that have something to hide (statements or sub-branches): the "Collapse all" set.
export function collapsibleNodeIds(nodes: RootNodeView[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.items.length + node.children.length > 0 ? [node.id] : []),
    ...collapsibleNodeIds(node.children),
  ])
}

// Full node by id (mastery and drills always use the full, uncollapsed tree).
export function indexNodes(nodes: RootNodeView[], into = new Map<string, RootNodeView>()): Map<string, RootNodeView> {
  for (const node of nodes) {
    into.set(node.id, node)
    indexNodes(node.children, into)
  }
  return into
}
