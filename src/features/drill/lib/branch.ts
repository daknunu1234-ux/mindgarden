// Ids of a node and all its descendants. Safe against A → B → A cycles (visited set).
export function collectBranch(nodes: readonly { id: string; parentId: string | null }[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentId) childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n.id])
  }

  const branch = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (branch.has(id)) continue
    branch.add(id)
    stack.push(...(childrenOf.get(id) ?? []))
  }
  return branch
}
