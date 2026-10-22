// One tree's outline as content nodes (pure, unit-tested). Every node is a root or a statement, under
// any other node; a top-level node is always a root (public.content_nodes, migration 20261013000000).
//
// Rows are kept in OUTLINE ORDER: each node followed by its whole branch, with its depth. That is
// exactly the order the Tree Workshop draws, so an in-place edit is one that keeps the order:
//   indent    (Tab)        the row becomes the last child of the sibling above it
//   outdent   (Shift+Tab)  the row goes up one level, right below its old parent; the siblings that
//                          were below it become its children
//   toggle    (Alt)        root ↔ statement, the row stays where it is
// The database applies the same rules (indent_content_node, the content_nodes_shape trigger), and the
// deck draft applies these functions for the instant view. Edits return the new rows, or a short
// reason why they can't happen (a hint for the owner).
import { isDrillable } from './drillable'
import type { ContentRow, DeckTreeItem, DeckTreeNode, EditorItem, EditorNode, NodeType } from '../types'

// A node as stored (content_nodes columns, camelCase).
export type StoredNode = { id: string; parentId: string | null; type: NodeType; content: string; sortOrder: number; createdAt?: string }

const byStoredOrder = (a: StoredNode, b: StoredNode) =>
  a.sortOrder - b.sortOrder || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// Stored nodes → outline rows: children by sort_order (then insert time, then id), depth-first. A
// node whose parent is missing (impossible with the foreign key) is left out rather than misplaced.
export function outlineRows(nodes: readonly StoredNode[]): ContentRow[] {
  const children = new Map<string | null, StoredNode[]>()
  for (const n of nodes) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
  const rows: ContentRow[] = []
  const seen = new Set<string>()
  const visit = (parentId: string | null, depth: number) => {
    for (const n of [...(children.get(parentId) ?? [])].sort(byStoredOrder)) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      rows.push({ id: n.id, parentId: n.parentId, type: n.type, content: n.content, depth })
      visit(n.id, depth + 1)
    }
  }
  visit(null, 0)
  return rows
}

// Index just past row `at`'s branch.
export function branchEnd(rows: readonly ContentRow[], at: number): number {
  let end = at + 1
  while (end < rows.length && rows[end].depth > rows[at].depth) end++
  return end
}

// Depths from the parent chain (rows stay in order: a parent always comes before its children).
function withDepths(rows: readonly ContentRow[]): ContentRow[] {
  const depth = new Map<string, number>()
  return rows.map((r) => {
    const d = r.parentId === null ? 0 : (depth.get(r.parentId) ?? 0) + 1
    depth.set(r.id, d)
    return r.depth === d ? r : { ...r, depth: d }
  })
}

// The nearest root above each row (null for a top-level root), and the statements between them.
function ancestry(rows: readonly ContentRow[]) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const nearestRoot = (r: ContentRow): ContentRow | null => {
    for (let p = r.parentId ? byId.get(r.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) if (p.type === 'root') return p
    return null
  }
  // How many statements sit between a statement and its nearest root.
  const statementDepth = (r: ContentRow): number => {
    let n = 0
    for (let p = r.parentId ? byId.get(r.parentId) : undefined; p && p.type === 'statement'; p = p.parentId ? byId.get(p.parentId) : undefined) n++
    return n
  }
  return { byId, nearestRoot, statementDepth }
}

// The outline as roots with their statements (the lists, dialogs and counts): roots in outline order
// with depth = how many roots are above them; each root's items = the statements whose nearest root
// it is, in outline order.
export function toEditorNodes(rows: readonly ContentRow[]): EditorNode[] {
  const { byId, nearestRoot, statementDepth } = ancestry(rows)
  const rootDepth = new Map<string, number>()
  const nodes: EditorNode[] = []
  const at = new Map<string, EditorNode>()
  for (const r of rows) {
    if (r.type === 'root') {
      const above = nearestRoot(r)
      const depth = above ? (rootDepth.get(above.id) ?? 0) + 1 : 0
      rootDepth.set(r.id, depth)
      const node: EditorNode = { id: r.id, title: r.content, depth, items: [] }
      nodes.push(node)
      at.set(r.id, node)
      continue
    }
    const root = nearestRoot(r)
    const parent = r.parentId ? byId.get(r.parentId) : undefined
    const item: EditorItem = {
      id: r.id,
      statement: r.content,
      drillable: isDrillable(r.content),
      parentId: parent && parent.type === 'statement' ? parent.id : null,
      depth: statementDepth(r),
    }
    if (root) at.get(root.id)?.items.push(item)
  }
  return nodes
}

// The same as a nested tree of roots (the mindmap canvas and its drawer).
export function toDeckTree(rows: readonly ContentRow[]): DeckTreeNode[] {
  const { nearestRoot } = ancestry(rows)
  const editorNodes = toEditorNodes(rows)
  const tree: DeckTreeNode[] = []
  const at = new Map<string, DeckTreeNode>()
  for (const n of editorNodes) {
    const items: DeckTreeItem[] = n.items.map((i) => ({ id: i.id, prompt: n.title, parentId: i.parentId, depth: i.depth }))
    const node: DeckTreeNode = { id: n.id, title: n.title, sortOrder: 0, items, children: [] }
    at.set(n.id, node)
    const row = rows.find((r) => r.id === n.id)!
    const above = nearestRoot(row)
    const siblings = above ? at.get(above.id)!.children : tree
    node.sortOrder = siblings.length
    siblings.push(node)
  }
  return tree
}

// What a delete takes with it: the statements and roots in the row's branch (itself excluded).
export function branchCounts(rows: readonly ContentRow[], id: string): { statements: number; roots: number } {
  const at = rows.findIndex((r) => r.id === id)
  if (at < 0) return { statements: 0, roots: 0 }
  const below = rows.slice(at + 1, branchEnd(rows, at))
  return { statements: below.filter((r) => r.type === 'statement').length, roots: below.filter((r) => r.type === 'root').length }
}

// ─── Edits ──────────────────────────────────────────────────────────────────────────────────────

// Where a new child of `parentId` goes: right after sibling `afterId`'s branch, else first among
// the children when `first` (an undone delete of a first child), else at the end of the parent's
// branch (the end of the outline for a new top-level root).
export function insertIndex(rows: readonly ContentRow[], parentId: string | null, afterId?: string | null, first = false): number {
  const after = afterId ? rows.findIndex((r) => r.id === afterId && r.parentId === parentId) : -1
  if (after >= 0) return branchEnd(rows, after)
  if (parentId === null) return first ? 0 : rows.length
  const parent = rows.findIndex((r) => r.id === parentId)
  if (parent < 0) return -1
  return first ? parent + 1 : branchEnd(rows, parent)
}

export function insertRow(
  rows: readonly ContentRow[],
  node: { id: string; parentId: string | null; type: NodeType; content: string },
  afterId?: string | null,
  first = false,
): ContentRow[] | string {
  if (rows.some((r) => r.id === node.id)) return [...rows]
  if (node.parentId === null && node.type !== 'root') return 'A top-level node is a root'
  const at = insertIndex(rows, node.parentId, afterId, first)
  if (at < 0) return 'Its parent is gone'
  const parent = node.parentId === null ? null : rows.find((r) => r.id === node.parentId)
  const row: ContentRow = { ...node, depth: parent ? parent.depth + 1 : 0 }
  return [...rows.slice(0, at), row, ...rows.slice(at)]
}

// Removes the row and its whole branch (the database cascades the same).
export function removeRow(rows: readonly ContentRow[], id: string): ContentRow[] {
  const at = rows.findIndex((r) => r.id === id)
  return at < 0 ? [...rows] : [...rows.slice(0, at), ...rows.slice(branchEnd(rows, at))]
}

export function editRow(rows: readonly ContentRow[], id: string, content: string): ContentRow[] {
  return rows.map((r) => (r.id === id ? { ...r, content } : r))
}

// Moves the row and its branch under `toParentId`, as its last child (📂 Move).
export function moveRow(rows: readonly ContentRow[], id: string, toParentId: string): ContentRow[] | string {
  const at = rows.findIndex((r) => r.id === id)
  if (at < 0) return 'Not found'
  const end = branchEnd(rows, at)
  const branch = rows.slice(at, end)
  if (branch.some((r) => r.id === toParentId)) return 'A node cannot go under its own branch'
  const rest = [...rows.slice(0, at), ...rows.slice(end)]
  const parent = rest.findIndex((r) => r.id === toParentId)
  if (parent < 0) return 'Not found'
  const into = branchEnd(rest, parent)
  const moved = branch.map((r, k) => (k === 0 ? { ...r, parentId: toParentId } : r))
  return withDepths([...rest.slice(0, into), ...moved, ...rest.slice(into)])
}

// Tab ('in') / Shift+Tab ('out'), in place: the outline order never changes, only parents (and so
// depths) do.
export function indentRow(rows: readonly ContentRow[], id: string, dir: 'in' | 'out'): ContentRow[] | string {
  const at = rows.findIndex((r) => r.id === id)
  if (at < 0) return 'Not found'
  const row = rows[at]
  const end = branchEnd(rows, at)
  if (dir === 'in') {
    let k = at - 1
    while (k >= 0 && rows[k].depth > row.depth) k--
    if (k < 0 || rows[k].depth !== row.depth) return 'Nothing above to nest under'
    const above = rows[k].id
    return withDepths(rows.map((r, i) => (i === at ? { ...r, parentId: above } : r)))
  }
  if (row.parentId === null) return 'Already a top-level root'
  const parent = rows.find((r) => r.id === row.parentId)!
  if (parent.parentId === null && row.type !== 'root') return 'A top-level node is a root: press Alt to make it one first'
  // The siblings below it (same parent) become its children; it takes its parent's parent.
  let followers = end
  while (followers < rows.length && rows[followers].depth >= row.depth) followers++
  return withDepths(
    rows.map((r, i) => {
      if (i === at) return { ...r, parentId: parent.parentId }
      if (i >= end && i < followers && r.parentId === row.parentId) return { ...r, parentId: row.id }
      return r
    }),
  )
}

// Alt: root ↔ statement, in place.
export function toggleRow(rows: readonly ContentRow[], id: string): ContentRow[] | string {
  const row = rows.find((r) => r.id === id)
  if (!row) return 'Not found'
  if (row.parentId === null) return 'A top-level root stays a root'
  return rows.map((r) => (r.id === id ? { ...r, type: r.type === 'root' ? 'statement' : 'root' } : r))
}

// ─── New lines (the Workshop's input, nothing saved yet) ────────────────────────────────────────

// A new line: a child of `parentId` of `type`, right after sibling `afterId`'s branch (else last).
export type ContentSlot = { parentId: string | null; afterId: string | null; type: NodeType }

// The line's level changed in place (null = it can't without jumping, so it stays).
export function indentSlot(rows: readonly ContentRow[], slot: ContentSlot, dir: 'in' | 'out'): ContentSlot | null {
  const siblings = rows.filter((r) => r.parentId === slot.parentId)
  if (dir === 'in') {
    // The sibling right above the line: the one it follows, else the parent's last child.
    const above = slot.afterId ?? siblings.at(-1)?.id
    return above ? { parentId: above, afterId: null, type: slot.type } : null
  }
  if (slot.parentId === null) return null
  // Out only from the end of the parent's children (else the ones below would jump above it).
  if (slot.afterId && siblings.at(-1)?.id !== slot.afterId) return null
  const parent = rows.find((r) => r.id === slot.parentId)
  if (!parent) return null
  if (parent.parentId === null && slot.type !== 'root') return null
  return { parentId: parent.parentId, afterId: parent.id, type: slot.type }
}

// Alt on a new line: the line's type flips (a top-level line stays a root).
export function toggleSlot(slot: ContentSlot): ContentSlot | null {
  if (slot.parentId === null) return null
  return { ...slot, type: slot.type === 'root' ? 'statement' : 'root' }
}
