// Optimistic deck edits for the deck page (pure, unit-tested): a new species, new roots, renamed roots
// or new statements show the moment the owner makes them, laid as ops over the data the server last
// sent (the deck, its tree for the mindmap and the owner's editor list); the server action runs in the
// background. A confirmed add learns its real ids and drillable flags; a refusal drops the op, which
// rolls the page back. When fresh server data arrives, settled ops are dropped (they are in it by
// then) and ops still waiting for the server carry over onto it (`rebaseOps`).
import type { DeckDetail, DeckEditor, DeckTreeNode, EditorItem, EditorNode } from '../types'

export type DraftItem = { tempId: string; statement: string }
export type ConfirmedItem = { id: string; statement: string; drillable: boolean }

export type DeckOp =
  | { key: string; kind: 'species'; treeType: string; settled?: boolean }
  // New statements under one root. `confirmed` is set once the server answers: the real ids and
  // drillable flags (statements it skipped as duplicates simply aren't in it). `nodeId` may be a
  // pending root's temp id; `confirmNode` rewrites it to the real id.
  | { key: string; kind: 'addItems'; nodeId: string; items: DraftItem[]; confirmed?: ConfirmedItem[] }
  // A statement deleted: gone from the mindmap tree, the editor list and the counts.
  | { key: string; kind: 'removeItem'; itemId: string; settled?: boolean }
  // A new root (parentId null) or sub-root, appended after its siblings. `confirmedId` = the server's id.
  | { key: string; kind: 'addNode'; tempId: string; parentId: string | null; title: string; confirmedId?: string }
  // A root renamed in place.
  | { key: string; kind: 'renameNode'; nodeId: string; title: string; settled?: boolean }

// Ids the server hasn't confirmed yet (they can't be edited, deleted or drilled until then).
export const PENDING_ITEM_PREFIX = 'pending-item-'
export const PENDING_NODE_PREFIX = 'pending-node-'
export const isPendingItemId = (id: string): boolean => id.startsWith(PENDING_ITEM_PREFIX)
export const isPendingNodeId = (id: string): boolean => id.startsWith(PENDING_NODE_PREFIX)

// The items an add op shows right now: its confirmed rows, else the pending ones (drillable unknown).
function opItems(op: Extract<DeckOp, { kind: 'addItems' }>): (EditorItem & { pending: boolean })[] {
  if (op.confirmed) return op.confirmed.map((c) => ({ ...c, pending: false }))
  return op.items.map((i) => ({ id: i.tempId, statement: i.statement, drillable: false, pending: true }))
}

function removeFromTree(nodes: DeckTreeNode[], itemId: string): DeckTreeNode[] {
  return nodes.map((n) => ({ ...n, items: n.items.filter((i) => i.id !== itemId), children: removeFromTree(n.children, itemId) }))
}

function addToTree(nodes: DeckTreeNode[], nodeId: string, items: { id: string }[]): DeckTreeNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? // The server gives new items the root's title as their prompt; do the same.
        { ...n, items: [...n.items, ...items.filter((i) => !n.items.some((e) => e.id === i.id)).map((i) => ({ id: i.id, prompt: n.title }))] }
      : { ...n, children: addToTree(n.children, nodeId, items) },
  )
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

function renameInTree(nodes: DeckTreeNode[], nodeId: string, title: string): DeckTreeNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, title } : { ...n, children: renameInTree(n.children, nodeId, title) }))
}

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
      case 'removeItem':
        tree = removeFromTree(tree, op.itemId)
        nodes = nodes?.map((n) => ({ ...n, items: n.items.filter((i) => i.id !== op.itemId) })) ?? null
        break
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
        tree = renameInTree(tree, op.nodeId, op.title)
        nodes = nodes?.map((n) => (n.id === op.nodeId ? { ...n, title: op.title } : n)) ?? null
        break
      case 'addItems': {
        const items = opItems(op)
        for (const item of items) if (item.pending) pendingIds.add(item.id)
        tree = addToTree(tree, op.nodeId, items)
        nodes =
          nodes?.map((n) =>
            n.id === op.nodeId
              ? { ...n, items: [...n.items, ...items.filter((i) => !n.items.some((e) => e.id === i.id)).map(({ id, statement, drillable }) => ({ id, statement, drillable }))] }
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
// created ones are the confirmed set (the rest drop out).
export const confirmItems = (ops: readonly DeckOp[], key: string, created: readonly ConfirmedItem[]): DeckOp[] =>
  ops.map((op) => (op.key === key && op.kind === 'addItems' ? { ...op, confirmed: [...created] } : op))

// Server created a node: it takes its real id, and every later op that pointed at the temp id (a
// statement typed under it, a sub-root, a rename) now points at the real one.
export function confirmNode(ops: readonly DeckOp[], key: string, id: string): DeckOp[] {
  const added = ops.find((op): op is Extract<DeckOp, { kind: 'addNode' }> => op.key === key && op.kind === 'addNode')
  if (!added) return [...ops]
  const temp = added.tempId
  return ops.map((op) => {
    if (op === added) return { ...op, confirmedId: id }
    if (op.kind === 'addItems' && op.nodeId === temp) return { ...op, nodeId: id }
    if (op.kind === 'addNode' && op.parentId === temp) return { ...op, parentId: id }
    if (op.kind === 'renameNode' && op.nodeId === temp) return { ...op, nodeId: id }
    return op
  })
}

// Server accepted a change that has nothing to learn from its answer (species, rename, delete).
export const settleOp = (ops: readonly DeckOp[], key: string): DeckOp[] =>
  ops.map((op) => (op.key === key && (op.kind === 'species' || op.kind === 'renameNode' || op.kind === 'removeItem') ? { ...op, settled: true } : op))

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
