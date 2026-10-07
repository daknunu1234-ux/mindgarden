'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCoins } from '@/shared/stores/CoinsProvider'
import { useToast } from '@/shared/stores/ToastProvider'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { createContentNode, indentContentNode, toggleNodeType } from '../actions/contentNodes'
import { createKnowledgeItems, type BulkImportResult } from '../actions/createKnowledgeItems'
import { deleteKnowledgeItem } from '../actions/deleteKnowledgeItem'
import { moveKnowledgeItem } from '../actions/moveKnowledgeItem'
import { renameDeck } from '../actions/renameDeck'
import { updateDeck } from '../actions/updateDeck'
import { updateKnowledgeItem } from '../actions/updateKnowledgeItem'
import { updateMindmapNode } from '../actions/updateMindmapNode'
import {
  applyDeckOps,
  confirmAdd,
  confirmMany,
  dropOp,
  isPendingItemId,
  PENDING_ITEM_PREFIX,
  rebaseOps,
  settleOp,
  type DeckDraftView,
  type DeckOp,
} from '../lib/draft'
import type { DeckDetail, DeckEditor, NodeType } from '../types'

type AddResult = { success: true; drillable: boolean } | { success: false; message: string }
type BulkResult = { success: true; data: BulkImportResult } | { success: false; message: string }
// A new statement's place: under statement `parentId` (else right under the root), right after
// sibling `afterId` (else last). Either may be a node still saving (its temporary id).
export type StatementPlace = { parentId?: string | null; afterId?: string | null }
export type NewNode = { parentId: string | null; afterId?: string | null; type: NodeType; content: string }

export type DeckDraftActions = {
  // Show the new species at once; updateDeck in the background, rolled back with a toast on error
  // (a pricier species charges the difference: a short purse is such an error).
  changeSpecies: (treeType: string) => void
  // The tree's new name (already cleaned and checked: shared/lib/treeName), shown at once in the
  // header and the Workshop; renameDeck in the background, rolled back with a toast on error.
  renameTree: (title: string) => void
  // One new root or statement, shown at once; returns its temporary id (so the next line can go
  // right below it or under it) and the server's verdict. Its parent may be a node still saving.
  addNode: (node: NewNode) => { id: string; done: Promise<AddResult> }
  // A statement under root `nodeId` (or statement place.parentId): addNode for the dialogs.
  addStatement: (nodeId: string, statement: string, place?: StatementPlace) => Promise<AddResult>
  // Statements appended under one node at once (the bulk importer); resolves with what the server
  // created and skipped.
  addStatements: (deckId: string, nodeId: string, statements: string[]) => Promise<BulkResult>
  // A node's text (a root's title or a statement), at once; saved in the background.
  editNode: (id: string, content: string) => void
  // A node and its whole branch, at once; put back with a toast on error.
  removeNode: (node: { id: string; text: string }) => void
  // A node and its branch under another root (last), at once.
  moveNode: (node: { id: string; text: string }, toParentId: string) => void
  // Tab ('in') / Shift+Tab ('out') in place: the outline order never changes, only levels do.
  indentNode: (id: string, dir: 'in' | 'out') => void
  // Alt: root ↔ statement in place.
  toggleType: (id: string) => void
  // A node still waiting for its server id (no edit / delete / drill until it has one).
  isPending: (id: string) => boolean
  // A node typed on this visit: its real id once saved (any other id as is).
  resolveId: (id: string) => string
  // Names the older parts of the page still use.
  removeStatement: (node: { id: string; text: string }) => void
  moveStatement: (node: { id: string; text: string }, toParentId: string) => void
}

const DeckDraftContext = createContext<DeckDraftActions | null>(null)

export const DeckDraftProvider = DeckDraftContext.Provider

// The Tree Workshop, the bulk importer, the mindmap's dialogs and drawer call these. They live on the
// deck page (DeckScene provides them).
export function useDeckDraftActions(): DeckDraftActions {
  const actions = useContext(DeckDraftContext)
  if (!actions) throw new Error('useDeckDraftActions: render inside <DeckDraftProvider> (the deck page provides it)')
  return actions
}

// Owner edits on the deck page, optimistic (lib/draft.ts over the outline rows): every change shows
// at 0 ms across the whole page (tree sprite, species ribbon, counts, size tier, mindmap, Workshop)
// and syncs in the background with no page refresh; a refusal rolls back with a toast. Writes go to
// the server one at a time, in the order they were made, so a node typed under (or below) one that
// is still saving is sent once that one has its real id.
export function useDeckDraft(detail: DeckDetail, editor: DeckEditor | null): { view: DeckDraftView; actions: DeckDraftActions } {
  const { toast } = useToast()
  const { setCoins } = useCoins()
  const [ops, setOps] = useState<{ base: DeckDetail; list: DeckOp[] }>({ base: detail, list: [] })
  // New server data (a refresh after another edit): ops still in flight carry over onto it.
  const list = useMemo(() => (ops.base === detail ? ops.list : rebaseOps(ops.list)), [ops, detail])
  const view = useMemo(() => applyDeckOps(detail, editor, list), [detail, editor, list])
  const base = useRef(detail)
  const nextKey = useRef(0)
  // Temp id → real id, once saved.
  const savedIds = useRef(new Map<string, string>())
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  // The latest view for the (stable) actions: the species change, node lookups and pending checks.
  const current = useRef(view)
  useLayoutEffect(() => {
    current.current = view
    base.current = detail
  })

  const edit = useCallback(
    (change: (list: DeckOp[]) => DeckOp[]) =>
      setOps((o) => ({ base: base.current, list: change(o.base === base.current ? o.list : rebaseOps(o.list)) })),
    [],
  )

  const actions = useMemo<DeckDraftActions>(() => {
    const failed = (message: string) => toast({ message: `${message}. Changes undone.`, icon: '⚠️', tone: 'farewell' })
    // One write at a time, in order (a failed write never blocks the next).
    const serial = <T,>(job: () => Promise<T>): Promise<T> => {
      const run = queue.current.then(job, job)
      queue.current = run.catch(() => undefined)
      return run
    }
    // A temp id that has been saved → its real id (so writes never send an id that is gone).
    const resolve = (id: string): string => savedIds.current.get(id) ?? id
    // By a write's turn, every node typed before it has its real id; one still temp was refused.
    const real = (id: string | null | undefined): string | null | undefined => (id ? resolve(id) : id)
    const nextOpKey = () => `d${nextKey.current++}`
    const deckId = detail.deck.id
    const rowOf = (id: string) => current.current.editor?.rows.find((r) => r.id === resolve(id))

    // A plain change with nothing to learn from the server's answer: shown at once, settled or rolled back.
    const change = (make: (key: string) => DeckOp, send: () => Promise<{ success: boolean; error?: { message: string } } | null>, what: string) => {
      const key = nextOpKey()
      edit((l) => [...l, make(key)])
      void serial(send).then((res) => {
        if (res?.success) return edit((l) => settleOp(l, key))
        edit((l) => dropOp(l, key))
        failed(`Could not ${what}: ${res?.error?.message ?? 'it was not saved'}`)
      })
    }

    const addNode: DeckDraftActions['addNode'] = ({ parentId: rawParent, afterId: rawAfter = null, type, content }) => {
      const parentId = rawParent === null ? null : resolve(rawParent)
      const afterId = rawAfter ? resolve(rawAfter) : null
      const key = nextOpKey()
      const tempId = `${PENDING_ITEM_PREFIX}${key}`
      const clean = content.trim()
      edit((l) => [...l, { key, kind: 'add', tempId, parentId, afterId, type, content: clean }])
      const done = serial(async () => {
        const parent = real(parentId) ?? null
        if (parent && isPendingItemId(parent)) return 'Its parent was not saved'
        const after = real(afterId)
        return createContentNode({ deckId, parentId: parent, type, content: clean, afterId: after && !isPendingItemId(after) ? after : null })
      }).then((res): AddResult => {
        if (typeof res === 'string' || !res.success) {
          edit((l) => dropOp(l, key))
          return { success: false, message: typeof res === 'string' ? res : res.error.message }
        }
        savedIds.current.set(tempId, res.data.id)
        edit((l) => confirmAdd(l, key, res.data.id))
        return { success: true, drillable: res.data.drillable }
      })
      return { id: tempId, done }
    }

    const removeNode: DeckDraftActions['removeNode'] = ({ id, text }) => {
      const key = nextOpKey()
      const target = resolve(id)
      edit((l) => [...l, { key, kind: 'remove', id: target }])
      void serial(() => deleteKnowledgeItem({ deckId, itemId: resolve(target) })).then((res) => {
        if (res.success) return edit((l) => settleOp(l, key))
        edit((l) => dropOp(l, key))
        toast({ message: `Could not delete “${text}”: ${res.error.message}. It's back in the list.`, icon: '⚠️', tone: 'farewell' })
      })
    }

    const moveNode: DeckDraftActions['moveNode'] = ({ id, text }, rawTo) => {
      const target = resolve(id)
      const to = resolve(rawTo)
      change((key) => ({ key, kind: 'move', id: target, toParentId: to }), () => moveKnowledgeItem({ deckId, itemId: resolve(target), toNodeId: resolve(to) }), `move “${text}”`)
    }

    return {
      changeSpecies: (treeType) => {
        if (treeType === current.current.treeType) return
        const key = nextOpKey()
        edit((l) => [...l, { key, kind: 'species', treeType }])
        void updateDeck({ deckId, treeType }).then((res) => {
          if (res.success) {
            // A pricier species was paid for: show the new purse in the header at once.
            if (res.data.remainingCoins !== null) setCoins(res.data.remainingCoins)
            return edit((l) => settleOp(l, key))
          }
          edit((l) => dropOp(l, key))
          failed(`Could not change the species to ${getTreeSpecies(treeType).label}: ${res.error.message}`)
        })
      },
      renameTree: (title) => {
        if (title === current.current.detail.deck.title) return
        change((key) => ({ key, kind: 'title', title }), () => renameDeck({ deckId, title }), `rename the tree to “${title}”`)
      },
      addNode,
      addStatement: (nodeId, statement, place = {}) =>
        addNode({ parentId: place.parentId ?? nodeId, afterId: place.afterId ?? null, type: 'statement', content: statement }).done,
      addStatements: async (_deckId, rawNodeId, statements) => {
        const parentId = resolve(rawNodeId)
        const key = nextOpKey()
        edit((l) => [...l, { key, kind: 'addMany', parentId, items: statements.map((content, i) => ({ tempId: `${PENDING_ITEM_PREFIX}${key}-${i}`, content })) }])
        const res = await serial(async () => {
          const parent = resolve(parentId)
          return isPendingItemId(parent) ? null : createKnowledgeItems({ deckId, rootId: parent, statements })
        })
        if (!res || !res.success) {
          edit((l) => dropOp(l, key))
          return { success: false, message: res ? res.error.message : 'Its root was not saved' }
        }
        edit((l) => confirmMany(l, key, res.data.created))
        return { success: true, data: res.data }
      },
      editNode: (rawId, content) => {
        const id = resolve(rawId)
        const clean = content.trim()
        const isRoot = rowOf(id)?.type === 'root'
        change(
          (key) => ({ key, kind: 'edit', id, content: clean }),
          () => {
            const target = resolve(id)
            if (isPendingItemId(target)) return Promise.resolve(null)
            return isRoot ? updateMindmapNode({ nodeId: target, title: clean }) : updateKnowledgeItem({ deckId, itemId: target, text: clean })
          },
          `save “${clean}”`,
        )
      },
      removeNode,
      moveNode,
      indentNode: (rawId, dir) => {
        const id = resolve(rawId)
        change((key) => ({ key, kind: 'indent', id, dir }), () => indentContentNode({ deckId, nodeId: resolve(id), direction: dir }), 'move it')
      },
      toggleType: (rawId) => {
        const id = resolve(rawId)
        const row = rowOf(id)
        const becomes = row?.type === 'root' ? 'statement' : 'root'
        // A statement the engine can't ask shows 💧 in the outline; nothing else to warn about.
        change((key) => ({ key, kind: 'toggle', id }), () => toggleNodeType({ deckId, nodeId: resolve(id) }), `turn it into a ${becomes}`)
        if (row) toast({ message: becomes === 'root' ? 'Converted to Root' : 'Converted to Statement', icon: becomes === 'root' ? '🌿' : '📜' })
      },
      isPending: (id) => current.current.pendingIds.has(resolve(id)),
      resolveId: resolve,
      removeStatement: removeNode,
      moveStatement: moveNode,
    }
  }, [detail.deck.id, edit, toast, setCoins])

  return { view, actions }
}
