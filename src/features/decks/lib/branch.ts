// Root branches (pure, unit-tested): a root plus everything under it.

// Ids of a root and all its sub-roots, from an adjacency list. Safe against A → B → A cycles.
export function branchNodeIds(nodes: readonly { id: string; parentId: string | null }[], rootId: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const n of nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id])
  const branch = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (branch.has(id)) continue
    branch.add(id)
    stack.push(...(children.get(id) ?? []))
  }
  return branch
}

// What deleting a root takes with it: its statements and sub-roots, all the way down. Works on a
// nested tree (roots with `children` and `items`), as the deck page has it. null if not found.
export function branchImpact(
  tree: readonly { id: string; items: readonly unknown[]; children: readonly unknown[] }[],
  rootId: string,
): { statements: number; subRoots: number } | null {
  type Node = { id: string; items: readonly unknown[]; children: readonly unknown[] }
  const count = (node: Node): { statements: number; subRoots: number } =>
    (node.children as Node[]).reduce(
      (sum, child) => {
        const inner = count(child)
        return { statements: sum.statements + inner.statements, subRoots: sum.subRoots + 1 + inner.subRoots }
      },
      { statements: node.items.length, subRoots: 0 },
    )
  const find = (list: readonly Node[]): Node | null => {
    for (const n of list) {
      if (n.id === rootId) return n
      const hit = find(n.children as Node[])
      if (hit) return hit
    }
    return null
  }
  const root = find(tree)
  return root ? count(root) : null
}

// The same impact from the Tree Workshop's flattened list (tree order, with depth): a root's branch
// is the root plus the following nodes that sit deeper than it. null if the root isn't listed.
export function flatBranchImpact(
  nodes: readonly { id: string; depth: number; items: readonly unknown[] }[],
  rootId: string,
): { statements: number; subRoots: number } | null {
  const start = nodes.findIndex((n) => n.id === rootId)
  if (start < 0) return null
  let statements = nodes[start].items.length
  let subRoots = 0
  for (let i = start + 1; i < nodes.length && nodes[i].depth > nodes[start].depth; i++) {
    statements += nodes[i].items.length
    subRoots += 1
  }
  return { statements, subRoots }
}
