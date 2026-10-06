// Optimistic outline edits for the deck page (pure, unit-tested). The owner's outline (the editor's
// content rows) is the source: every edit is an op laid over the rows the server last sent, applied
// with lib/contentTree.ts (the same in-place rules the database follows), and the canvas tree and the
// root lists are derived from the result. The server action runs in the background; a confirmed add
// learns its real id, a refusal drops the op, which rolls the page back. When fresh server data
// arrives, settled ops are dropped (they are in it by then) and ops still waiting carry over
// (`rebaseOps`).
import { editRow, indentRow, insertRow, moveRow, removeRow, toDeckTree, toEditorNodes, toggleRow } from './contentTree'
import type { ContentRow, DeckDetail, DeckEditor, NodeType } from '../types'

export type DeckOp =
  | { key: string; kind: 'species'; treeType: string; settled?: boolean }
  // One new node: under `parentId` (null = a top-level root), right after sibling `afterId` (else
  // last). `confirmedId` = the server's id. parentId / afterId may be temp ids (confirmAdd retargets).
  | { key: string; kind: 'add'; tempId: string; parentId: string | null; afterId: string | null; type: NodeType; content: string; confirmedId?: string }
  // Several statements appended under one node (the bulk importer). `confirmed` = what the server
  // created (statements it skipped as duplicates simply aren't in it).
  | { key: string; kind: 'addMany'; parentId: string; items: { tempId: string; content: string }[]; confirmed?: { id: string; statement: string }[] }
  | { key: string; kind: 'edit'; id: string; content: string; settled?: boolean }
  // A node and its whole branch.
  | { key: string; kind: 'remove'; id: string; settled?: boolean }
  // A node and its branch under another root, last.
  | { key: string; kind: 'move'; id: string; toParentId: string; settled?: boolean }
  // Tab ('in') / Shift+Tab ('out'), in place.
  | { key: string; kind: 'indent'; id: string; dir: 'in' | 'out'; settled?: boolean }
  // Alt: root ↔ statement, in place.
  | { key: string; kind: 'toggle'; id: string; settled?: boolean }

// Ids the server hasn't confirmed yet (they can't be edited, deleted or drilled until then).
export const PENDING_ITEM_PREFIX = 'pending-item-'
export const PENDING_NODE_PREFIX = 'pending-node-'
export const isPendingItemId = (id: string): boolean => id.startsWith('pending-')
export const isPendingNodeId = (id: string): boolean => id.startsWith('pending-')

export type DeckDraftView = {
  detail: DeckDetail
  editor: DeckEditor | null
  treeType: string
  // Nodes still waiting for their server ids.
  pendingIds: ReadonlySet<string>
}

// An edit that can't apply (any more: the server refuses it too) leaves the rows as they are.
const keep = (rows: ContentRow[], next: ContentRow[] | string): ContentRow[] => (typeof next === 'string' ? rows : next)

// The page as the owner sees it: the server's data with every op applied, in order.
export function applyDeckOps(detail: DeckDetail, editor: DeckEditor | null, ops: readonly DeckOp[]): DeckDraftView {
  let treeType = detail.deck.treeType
  for (const op of ops) if (op.kind === 'species') treeType = op.treeType
  const pendingIds = new Set<string>()
  if (!editor) return { detail: { ...detail, deck: { ...detail.deck, treeType } }, editor, treeType, pendingIds }

  let rows = editor.rows
  for (const op of ops) {
    switch (op.kind) {
      case 'species':
        break
      case 'add': {
        const id = op.confirmedId ?? op.tempId
        if (!op.confirmedId) pendingIds.add(id)
        rows = keep(rows, insertRow(rows, { id, parentId: op.parentId, type: op.type, content: op.content }, op.afterId))
        break
      }
      case 'addMany': {
        const added = op.confirmed ? op.confirmed.map((c) => ({ id: c.id, content: c.statement })) : op.items.map((i) => ({ id: i.tempId, content: i.content }))
        for (const a of added) {
          if (!op.confirmed) pendingIds.add(a.id)
          rows = keep(rows, insertRow(rows, { id: a.id, parentId: op.parentId, type: 'statement', content: a.content }, null))
        }
        break
      }
      case 'edit':
        rows = editRow(rows, op.id, op.content)
        break
      case 'remove':
        rows = removeRow(rows, op.id)
        break
      case 'move':
        rows = keep(rows, moveRow(rows, op.id, op.toParentId))
        break
      case 'indent':
        rows = keep(rows, indentRow(rows, op.id, op.dir))
        break
      case 'toggle':
        rows = keep(rows, toggleRow(rows, op.id))
        break
    }
  }
  return {
    detail: { deck: { ...detail.deck, treeType }, tree: toDeckTree(rows) },
    editor: { ...editor, treeType, rows, nodes: toEditorNodes(rows) },
    treeType,
    pendingIds,
  }
}

// Every later op that pointed at temp id `temp` now points at `id`.
function retarget(ops: readonly DeckOp[], temp: string, id: string): DeckOp[] {
  const swap = (v: string | null) => (v === temp ? id : v)
  return ops.map((op) => {
    switch (op.kind) {
      case 'add':
        return op.parentId === temp || op.afterId === temp ? { ...op, parentId: swap(op.parentId), afterId: swap(op.afterId) } : op
      case 'addMany':
        return op.parentId === temp ? { ...op, parentId: id } : op
      case 'move':
        return op.id === temp || op.toParentId === temp ? { ...op, id: swap(op.id)!, toParentId: swap(op.toParentId)! } : op
      case 'edit':
      case 'remove':
      case 'indent':
      case 'toggle':
        return op.id === temp ? { ...op, id } : op
      default:
        return op
    }
  })
}

// Server created a node: it takes its real id, and every later op that pointed at the temp id follows.
export function confirmAdd(ops: readonly DeckOp[], key: string, id: string): DeckOp[] {
  const added = ops.find((op): op is Extract<DeckOp, { kind: 'add' }> => op.key === key && op.kind === 'add')
  if (!added) return [...ops]
  return retarget(ops, added.tempId, id).map((op) => (op.key === key && op.kind === 'add' ? { ...op, confirmedId: id } : op))
}

// Server created a bulk import's statements. When every one was created (none skipped), later ops
// that point at their temp ids follow too.
export function confirmMany(ops: readonly DeckOp[], key: string, created: readonly { id: string; statement: string }[]): DeckOp[] {
  const added = ops.find((op): op is Extract<DeckOp, { kind: 'addMany' }> => op.key === key && op.kind === 'addMany')
  if (!added) return [...ops]
  let next: DeckOp[] = [...ops]
  if (added.items.length === created.length) added.items.forEach((item, i) => (next = retarget(next, item.tempId, created[i].id)))
  return next.map((op) => (op.key === key && op.kind === 'addMany' ? { ...op, confirmed: [...created] } : op))
}

// Server accepted a change that has nothing to learn from its answer.
export const settleOp = (ops: readonly DeckOp[], key: string): DeckOp[] =>
  ops.map((op) => (op.key === key && op.kind !== 'add' && op.kind !== 'addMany' ? { ...op, settled: true } : op))

// Server refused: drop the op (and with it the change).
export const dropOp = (ops: readonly DeckOp[], key: string): DeckOp[] => ops.filter((op) => op.key !== key)

export function isSettled(op: DeckOp): boolean {
  switch (op.kind) {
    case 'add':
      return op.confirmedId !== undefined
    case 'addMany':
      return op.confirmed !== undefined
    default:
      return op.settled === true
  }
}

// Fresh server data arrived: what the server already confirmed is in it, so only the ops still in
// flight carry over (a node typed a moment ago doesn't blink out when another edit refreshes the page).
export const rebaseOps = (ops: readonly DeckOp[]): DeckOp[] => ops.filter((op) => !isSettled(op))
