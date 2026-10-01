import type { EditorNode } from '../types'

// The Tree Workshop's outline editor (pure, unit-tested): the owner's flat editor list (tree order,
// with depths) as a nested outline, the top-level roots for the root selector, and the fast-entry
// keyboard flow. The component commits what was typed first (a root, sub-root or statement), then
// asks where the inline input goes next:
//   Enter      → a sibling input of the same kind (Enter on an empty line closes it)
//   Tab        → a child: statements under the root just typed; from a statement line, a new
//                sub-root under the same root
//   Shift+Tab  → up one level: a new root / sub-root beside the current one's parent
//   Esc        → close (the component handles it)
// null = close the input.

export type OutlineSlot = { kind: 'root' } | { kind: 'branch'; parentId: string } | { kind: 'statement'; nodeId: string }

export type OutlineKey = 'enter' | 'tab' | 'shift-tab'

export type OutlineNode = EditorNode & { children: OutlineNode[] }

export type RootSummary = { id: string; title: string; statementCount: number; subRootCount: number }

export const OUTLINE_LIMITS = { node: 150, statement: 500 } as const

// The flat list (tree order, depth 0 = top level) as nested roots. A node deeper than the one
// before it by more than one level is attached to the nearest shallower node, so a malformed list
// never loses nodes.
export function nestEditorNodes(nodes: readonly EditorNode[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const node of nodes) {
    const entry: OutlineNode = { ...node, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(entry)
    else roots.push(entry)
    stack.push(entry)
  }
  return roots
}

// Node id → its parent id (null at the top level).
export function outlineParents(nodes: readonly EditorNode[]): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const walk = (list: readonly OutlineNode[], parent: string | null) =>
    list.forEach((n) => {
      out.set(n.id, parent)
      walk(n.children, n.id)
    })
  walk(nestEditorNodes(nodes), null)
  return out
}

const countBranch = (node: OutlineNode): { statements: number; subRoots: number } =>
  node.children.reduce(
    (sum, c) => {
      const sub = countBranch(c)
      return { statements: sum.statements + sub.statements, subRoots: sum.subRoots + 1 + sub.subRoots }
    },
    { statements: node.items.length, subRoots: 0 },
  )

// The root selector: every top-level root with the statements and sub-roots in its whole branch.
export function rootSummaries(nodes: readonly EditorNode[]): RootSummary[] {
  return nestEditorNodes(nodes).map((root) => {
    const { statements, subRoots } = countBranch(root)
    return { id: root.id, title: root.title, statementCount: statements, subRootCount: subRoots }
  })
}

// Which fast-entry key a keyboard event is (null for any other key, or while an IME is composing:
// Vietnamese Telex / VNI input confirms its letters with Enter-like keys).
export function outlineKey(e: { key: string; shiftKey: boolean; isComposing?: boolean }): OutlineKey | null {
  if (e.isComposing) return null
  if (e.key === 'Enter' && !e.shiftKey) return 'enter'
  if (e.key === 'Tab') return e.shiftKey ? 'shift-tab' : 'tab'
  return null
}

// A new node beside `nodeId` (its sibling): a root at the top level, else a sub-root.
function besideNode(nodeId: string, parents: ReadonlyMap<string, string | null>): OutlineSlot | null {
  const parent = parents.get(nodeId)
  if (parent === undefined) return null
  return parent === null ? { kind: 'root' } : { kind: 'branch', parentId: parent }
}

// Where the input goes after `key`. `typed` = there was text (it has just been committed);
// `createdId` = the node that text created (roots / sub-roots only).
export function nextOutlineSlot(
  slot: OutlineSlot,
  key: OutlineKey,
  typed: boolean,
  createdId: string | null,
  parents: ReadonlyMap<string, string | null>,
): OutlineSlot | null {
  switch (key) {
    case 'enter':
      return typed ? slot : null
    case 'tab':
      if (slot.kind === 'statement') return { kind: 'branch', parentId: slot.nodeId }
      // Nest under the node just typed; with nothing typed there is nothing to nest under yet.
      return createdId ? { kind: 'statement', nodeId: createdId } : slot
    case 'shift-tab':
      if (slot.kind === 'root') return slot
      return besideNode(slot.kind === 'statement' ? slot.nodeId : slot.parentId, parents)
  }
}

// The slot with its node's id mapped through `resolve` (a root's temp id → its real id once saved),
// so an open input stays where it is when the save confirms. Unchanged slots keep their identity.
export function resolveOutlineSlot(slot: OutlineSlot, resolve: (id: string) => string): OutlineSlot {
  if (slot.kind === 'root') return slot
  if (slot.kind === 'branch') {
    const parentId = resolve(slot.parentId)
    return parentId === slot.parentId ? slot : { kind: 'branch', parentId }
  }
  const nodeId = resolve(slot.nodeId)
  return nodeId === slot.nodeId ? slot : { kind: 'statement', nodeId }
}

// The top-level root a node belongs to (for keeping the selector on the root being typed into).
export function topRootOf(nodeId: string, parents: ReadonlyMap<string, string | null>): string | null {
  if (!parents.has(nodeId)) return null
  let at = nodeId
  for (let parent = parents.get(at); parent; parent = parents.get(at)) at = parent
  return at
}

// Collapse / expand (the Workshop outline keeps the collapsed node ids in local state; nothing is saved).

// What a collapsed node hides: every statement and sub-root below it, at any depth.
export function hiddenCount(node: OutlineNode): { statements: number; subRoots: number; total: number } {
  const { statements, subRoots } = countBranch(node)
  return { statements, subRoots, total: statements + subRoots }
}

// `nodeId` itself or anything below `ancestorId`.
export function isWithin(nodeId: string, ancestorId: string, parents: ReadonlyMap<string, string | null>): boolean {
  for (let at: string | null | undefined = nodeId; at; at = parents.get(at)) if (at === ancestorId) return true
  return false
}

// The collapsed set with `nodeId` and every node above it expanded (so a new input under it shows).
// Returns the same set when nothing on the path was collapsed.
export function expandPath(collapsed: ReadonlySet<string>, nodeId: string, parents: ReadonlyMap<string, string | null>): ReadonlySet<string> {
  const path: string[] = []
  for (let at: string | null | undefined = nodeId; at; at = parents.get(at)) path.push(at)
  if (!path.some((id) => collapsed.has(id))) return collapsed
  const next = new Set(collapsed)
  for (const id of path) next.delete(id)
  return next
}

// The node a slot types under (null for a new top-level root).
export const slotTarget = (slot: OutlineSlot): string | null => (slot.kind === 'root' ? null : slot.kind === 'branch' ? slot.parentId : slot.nodeId)
