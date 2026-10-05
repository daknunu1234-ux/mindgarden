// Optimistic deck edits for the deck page (pure, unit-tested): a new species, new roots, renamed roots,
// new, edited or moved statements show the moment the owner makes them, laid as ops over the data the
// server last sent (the deck, its tree for the mindmap and the owner's editor list); the server action
// runs in the background. A confirmed add learns its real ids and drillable flags; a refusal drops the
// op, which rolls the page back. When fresh server data arrives, settled ops are dropped (they are in
// it by then) and ops still waiting for the server carry over onto it (`rebaseOps`).
import { withSubStatements } from './statements'
import type { DeckDetail, DeckEditor, DeckTreeItem, DeckTreeNode, EditorItem, EditorNode } from '../types'

export type DraftItem = { tempId: string; statement: string }
export type ConfirmedItem = { id: string; statement: string; drillable: boolean }

export type DeckOp =
  | { key: string; kind: 'species'; treeType: string; settled?: boolean }
  // New statements under one root. `confirmed` is set once the server answers: the real ids and
  // drillable flags (statements it skipped as duplicates simply aren't in it). `nodeId` may be a
  // pending root's temp id; `confirmNode` rewrites it to the real id. `parentId`: they are
  // sub-statements of that statement. `afterId`: they go right below that row (same level), else last.
  // Both may be a pending statement's temp id; `confirmItems` rewrites them.
  | { key: string; kind: 'addItems'; nodeId: string; items: DraftItem[]; confirmed?: ConfirmedItem[]; parentId?: string | null; afterId?: string | null }
  // A statement deleted, with its sub-statements: gone from the mindmap tree, the editor list and the counts.
  | { key: string; kind: 'removeItem'; itemId: string; settled?: boolean }
  // A statement moved, with its sub-statements, to the end of another root (a sub-statement becomes a statement there).
  | { key: string; kind: 'moveItem'; itemId: string; toNodeId: string; settled?: boolean }
  // A new root (parentId null) or sub-root, appended after its siblings. `confirmedId` = the server's id.
  | { key: string; kind: 'addNode'; tempId: string; parentId: string | null; title: string; confirmedId?: string }
  // A root renamed in place.
  | { key: string; kind: 'renameNode'; nodeId: string; title: string; settled?: boolean }
  // A statement's text edited in place; `drillable` comes back with the server's answer.
  | { key: string; kind: 'editItem'; itemId: string; statement: string; drillable?: boolean; settled?: boolean }

// Ids the server hasn't confirmed yet (they can't be edited, deleted or drilled until then).
export const PENDING_ITEM_PREFIX = 'pending-item-'
export const PENDING_NODE_PREFIX = 'pending-node-'
export const isPendingItemId = (id: string): boolean => id.startsWith(PENDING_ITEM_PREFIX)
export const isPendingNodeId = (id: string): boolean => id.startsWith(PENDING_NODE_PREFIX)

// The items an add op shows right now: its confirmed rows, else the pending ones (drillable unknown).
function opItems(op: Extract<DeckOp, { kind: 'addItems' }>): (EditorItem & { pending: boolean })[] {
  const parentId = op.parentId ?? null
  if (op.confirmed) return op.confirmed.map((c) => ({ ...c, parentId, pending: false }))
  return op.items.map((i) => ({ id: i.tempId, statement: i.statement, drillable: false, parentId, pending: true }))
}

// `added` placed right after `afterId` when it is in the list, else after `parentId`'s last
// sub-statement (new sub-statements), else at the end. Rows already in the list are not doubled.
export function placeItems<T extends { id: string; parentId?: string | null }>(
  list: readonly T[],
  added: readonly T[],
  afterId?: string | null,
  parentId?: string | null,
): T[] {
  const fresh = added.filter((a) => !list.some((e) => e.id === a.id))
  if (fresh.length === 0) return [...list]
  let at = afterId ? list.findIndex((e) => e.id === afterId) : -1
  // A statement below a statement goes after that statement's sub-statements.
  if (at >= 0 && !parentId) while (at + 1 < list.length && list[at + 1].parentId === afterId) at++
  if (at < 0 && parentId) {
    const rows = list.map((e, i) => (e.id === parentId || e.parentId === parentId ? i : -1)).filter((i) => i >= 0)
    at = rows.length > 0 ? rows[rows.length - 1] : -1
  }
  if (at < 0) return [...list, ...fresh]
  return [...list.slice(0, at + 1), ...fresh, ...list.slice(at + 1)]
}

function mapTree(nodes: DeckTreeNode[], change: (n: DeckTreeNode) => DeckTreeNode): DeckTreeNode[] {
  return nodes.map((n) => {
    const changed = change(n)
    return { ...changed, children: mapTree(changed.children, change) }
  })
}

const findTreeItems = (nodes: DeckTreeNode[], itemId: string): DeckTreeItem[] => {
  for (const n of nodes) {
    if (n.items.some((i) => i.id === itemId)) return withSubStatements(n.items, itemId)
    const below = findTreeItems(n.children, itemId)
    if (below.length > 0) return below
  }
  return []
}

const treeHas = (nodes: DeckTreeNode[], id: string): boolean => nodes.some((n) => n.id === id || treeHas(n.children, id))

// Append a node under parentId (null = a new top-level root). An unknown parent changes nothing.
function addNodeToTree(nodes: DeckTreeNode[], parentId: string | null, node: DeckTreeNode): DeckTreeNode[] {
  if (parentId === null) return [...nodes, { ...node, sortOrder: nodes.length }]
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, { ...node, sortOrder: n.children.length }] }
      : { ...n, children: addNodeToTree(n.children, parentId, node) },
  )
}

// The editor list is flattened in tree order: a new node goes after its parent's whole branch.
function addNodeToEditor(nodes: EditorNode[], parentId: string | null, node: Omit<EditorNode, 'depth'>): EditorNode[] {
  if (parentId === null) return [...nodes, { ...node, depth: 0 }]
  const at = nodes.findIndex((n) => n.id === parentId)
  if (at < 0) return nodes
  const depth = nodes[at].depth
  let end = at + 1
  while (end < nodes.length && nodes[end].depth > depth) end++
  return [...nodes.slice(0, end), { ...node, depth: depth + 1 }, ...nodes.slice(end)]
}

// The moved rows: the statement itself becomes a statement (parentId null); its sub-statements keep theirs.
const asMoved = <T extends { id: string; parentId?: string | null }>(rows: readonly T[], itemId: string): T[] =>
  rows.map((r) => (r.id === itemId ? { ...r, parentId: null } : r))

export type DeckDraftView = {
  detail: DeckDetail
  editor: DeckEditor | null
  treeType: string
  // Statements and roots still waiting for their server ids.
  pendingIds: ReadonlySet<string>
}

// The page as the owner sees it: the server's data with every op applied, in order.
export function applyDeckOps(detail: DeckDetail, editor: DeckEditor | null, ops: readonly DeckOp[]): DeckDraftView {
  let tree = detail.tree
  let nodes = editor?.nodes ?? null
  let treeType = detail.deck.treeType
  const pendingIds = new Set<string>()
  for (const op of ops) {
    switch (op.kind) {
      case 'species':
        treeType = op.treeType
        break
      case 'removeItem': {
        const gone = (i: { id: string; parentId?: string | null }) => i.id === op.itemId || i.parentId === op.itemId
        tree = mapTree(tree, (n) => ({ ...n, items: n.items.filter((i) => !gone(i)) }))
        nodes = nodes?.map((n) => ({ ...n, items: n.items.filter((i) => !gone(i)) })) ?? null
        break
      }
      case 'moveItem': {
        const target = nodes?.find((n) => n.id === op.toNodeId)
        // Unknown target or statement: nothing moves (the server would refuse it too).
        if (!treeHas(tree, op.toNodeId)) break
        const treeRows = findTreeItems(tree, op.itemId)
        if (treeRows.length > 0) {
          const ids = new Set(treeRows.map((r) => r.id))
          tree = mapTree(tree, (n) => {
            const kept = n.items.filter((i) => !ids.has(i.id))
            // The server gives moved statements the new root's title as their prompt; do the same.
            return n.id === op.toNodeId ? { ...n, items: [...kept, ...asMoved(treeRows, op.itemId).map((r) => ({ ...r, prompt: n.title }))] } : { ...n, items: kept }
          })
        }
        const source = nodes?.find((n) => n.items.some((i) => i.id === op.itemId))
        if (nodes && source && target) {
          const rows = withSubStatements(source.items, op.itemId)
          const ids = new Set(rows.map((r) => r.id))
          nodes = nodes.map((n) => {
            const kept = n.items.filter((i) => !ids.has(i.id))
            return n.id === op.toNodeId ? { ...n, items: [...kept, ...asMoved(rows, op.itemId)] } : { ...n, items: kept }
          })
        }
        break
      }
      case 'addNode': {
        const id = op.confirmedId ?? op.tempId
        if (!op.confirmedId) pendingIds.add(id)
        // Idempotent: fresh server data may already hold the confirmed node.
        if (treeHas(tree, id)) break
        tree = addNodeToTree(tree, op.parentId, { id, title: op.title, sortOrder: 0, items: [], children: [] })
        nodes = nodes && addNodeToEditor(nodes, op.parentId, { id, title: op.title, items: [] })
        break
      }
      case 'renameNode':
        tree = mapTree(tree, (n) => (n.id === op.nodeId ? { ...n, title: op.title } : n))
        nodes = nodes?.map((n) => (n.id === op.nodeId ? { ...n, title: op.title } : n)) ?? null
        break
      case 'editItem':
        nodes =
          nodes?.map((n) => ({
            ...n,
            items: n.items.map((i) => (i.id === op.itemId ? { ...i, statement: op.statement, drillable: op.drillable ?? i.drillable } : i)),
          })) ?? null
        break
      case 'addItems': {
        const items = opItems(op)
        for (const item of items) if (item.pending) pendingIds.add(item.id)
        tree = mapTree(tree, (n) =>
          n.id === op.nodeId
            ? // The server gives new items the root's title as their prompt; do the same.
              { ...n, items: placeItems(n.items, items.map((i) => ({ id: i.id, prompt: n.title, parentId: i.parentId })), op.afterId, op.parentId) }
            : n,
        )
        nodes =
          nodes?.map((n) =>
            n.id === op.nodeId
              ? { ...n, items: placeItems(n.items, items.map(({ id, statement, drillable, parentId }) => ({ id, statement, drillable, parentId })), op.afterId, op.parentId) }
              : n,
          ) ?? null
        break
      }
    }
  }
  return {
    detail: { deck: { ...detail.deck, treeType }, tree },
    editor: editor && nodes ? { ...editor, treeType, nodes } : editor,
    treeType,
    pendingIds,
  }
}

// Server confirmed an add with the statements it created. The server cleans the text, so rows are
// taken in order when every statement was created; when some were skipped as duplicates, the
// created ones are the confirmed set (the rest drop out). When every one was created, later ops that
// point at one of its temp ids (a sub-statement typed under it, a row typed below it) now point at
// the real id.
export function confirmItems(ops: readonly DeckOp[], key: string, created: readonly ConfirmedItem[]): DeckOp[] {
  const added = ops.find((op): op is Extract<DeckOp, { kind: 'addItems' }> => op.key === key && op.kind === 'addItems')
  if (!added) return [...ops]
  const real = new Map(added.items.length === created.length ? added.items.map((d, i) => [d.tempId, created[i].id] as const) : [])
  const swap = (id: string | null | undefined) => (id ? (real.get(id) ?? id) : id)
  return ops.map((op) => {
    if (op === added) return { ...op, confirmed: [...created] }
    if (op.kind === 'addItems' && (real.has(op.parentId ?? '') || real.has(op.afterId ?? ''))) return { ...op, parentId: swap(op.parentId), afterId: swap(op.afterId) }
    return op
  })
}

// Server created a node: it takes its real id, and every later op that pointed at the temp id (a
// statement typed under it, a sub-root, a rename, a statement moved into it) now points at the real one.
export function confirmNode(ops: readonly DeckOp[], key: string, id: string): DeckOp[] {
  const added = ops.find((op): op is Extract<DeckOp, { kind: 'addNode' }> => op.key === key && op.kind === 'addNode')
  if (!added) return [...ops]
  const temp = added.tempId
  return ops.map((op) => {
    if (op === added) return { ...op, confirmedId: id }
    if (op.kind === 'addItems' && op.nodeId === temp) return { ...op, nodeId: id }
    if (op.kind === 'addNode' && op.parentId === temp) return { ...op, parentId: id }
    if (op.kind === 'renameNode' && op.nodeId === temp) return { ...op, nodeId: id }
    if (op.kind === 'moveItem' && op.toNodeId === temp) return { ...op, toNodeId: id }
    return op
  })
}

// Server accepted a change that has nothing to learn from its answer (species, rename, delete, move).
export const settleOp = (ops: readonly DeckOp[], key: string): DeckOp[] =>
  ops.map((op) =>
    op.key === key && (op.kind === 'species' || op.kind === 'renameNode' || op.kind === 'removeItem' || op.kind === 'moveItem') ? { ...op, settled: true } : op,
  )

// Server saved an edited statement: its cleaned text and whether the trap engine can quiz it now.
export const confirmEdit = (ops: readonly DeckOp[], key: string, saved: { statement: string; drillable: boolean }): DeckOp[] =>
  ops.map((op) => (op.key === key && op.kind === 'editItem' ? { ...op, ...saved, settled: true } : op))

// Server refused: drop the op (and with it the change).
export const dropOp = (ops: readonly DeckOp[], key: string): DeckOp[] => ops.filter((op) => op.key !== key)

export function isSettled(op: DeckOp): boolean {
  switch (op.kind) {
    case 'addItems':
      return op.confirmed !== undefined
    case 'addNode':
      return op.confirmedId !== undefined
    default:
      return op.settled === true
  }
}

// Fresh server data arrived: what the server already confirmed is in it, so only the ops still in
// flight carry over (a root typed a moment ago doesn't blink out when another edit refreshes the page).
export const rebaseOps = (ops: readonly DeckOp[]): DeckOp[] => ops.filter((op) => !isSettled(op))
