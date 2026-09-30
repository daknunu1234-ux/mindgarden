// Optimistic deck edits for the deck page (pure, unit-tested): a new species or new statements show the
// moment the owner makes them, laid as ops over the data the server last sent (the deck, its tree for
// the mindmap and the owner's editor list); the server action runs in the background. A confirmed add
// learns its real ids and drillable flags; a refusal drops the op, which rolls the page back. Fresh
// server data replaces the ops (they are in it by then).
import type { DeckDetail, DeckEditor, DeckTreeNode, EditorItem } from '../types'

export type DraftItem = { tempId: string; statement: string }
export type ConfirmedItem = { id: string; statement: string; drillable: boolean }

export type DeckOp =
  | { key: string; kind: 'species'; treeType: string }
  // New statements under one root. `confirmed` is set once the server answers: the real ids and
  // drillable flags (statements it skipped as duplicates simply aren't in it).
  | { key: string; kind: 'addItems'; nodeId: string; items: DraftItem[]; confirmed?: ConfirmedItem[] }

// Statement ids the server hasn't confirmed yet (they can't be edited, deleted or drilled until then).
export const PENDING_ITEM_PREFIX = 'pending-item-'
export const isPendingItemId = (id: string): boolean => id.startsWith(PENDING_ITEM_PREFIX)

// The items an add op shows right now: its confirmed rows, else the pending ones (drillable unknown).
function opItems(op: Extract<DeckOp, { kind: 'addItems' }>): (EditorItem & { pending: boolean })[] {
  if (op.confirmed) return op.confirmed.map((c) => ({ ...c, pending: false }))
  return op.items.map((i) => ({ id: i.tempId, statement: i.statement, drillable: false, pending: true }))
}

function addToTree(nodes: DeckTreeNode[], nodeId: string, items: { id: string }[]): DeckTreeNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? // The server gives new items the root's title as their prompt; do the same.
        { ...n, items: [...n.items, ...items.filter((i) => !n.items.some((e) => e.id === i.id)).map((i) => ({ id: i.id, prompt: n.title }))] }
      : { ...n, children: addToTree(n.children, nodeId, items) },
  )
}

export type DeckDraftView = {
  detail: DeckDetail
  editor: DeckEditor | null
  treeType: string
  pendingIds: ReadonlySet<string>
}

// The page as the owner sees it: the server's data with every op applied, in order.
export function applyDeckOps(detail: DeckDetail, editor: DeckEditor | null, ops: readonly DeckOp[]): DeckDraftView {
  let tree = detail.tree
  let nodes = editor?.nodes ?? null
  let treeType = detail.deck.treeType
  const pendingIds = new Set<string>()
  for (const op of ops) {
    if (op.kind === 'species') {
      treeType = op.treeType
      continue
    }
    const items = opItems(op)
    for (const item of items) if (item.pending) pendingIds.add(item.id)
    tree = addToTree(tree, op.nodeId, items)
    nodes =
      nodes?.map((n) =>
        n.id === op.nodeId
          ? { ...n, items: [...n.items, ...items.filter((i) => !n.items.some((e) => e.id === i.id)).map(({ id, statement, drillable }) => ({ id, statement, drillable }))] }
          : n,
      ) ?? null
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

// Server refused: drop the op (and with it the change).
export const dropOp = (ops: readonly DeckOp[], key: string): DeckOp[] => ops.filter((op) => op.key !== key)
