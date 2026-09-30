'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/shared/stores/ToastProvider'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { createKnowledgeItem } from '../actions/createKnowledgeItem'
import { createKnowledgeItems, type BulkImportResult } from '../actions/createKnowledgeItems'
import { createMindmapNode } from '../actions/createMindmapNode'
import { deleteKnowledgeItem } from '../actions/deleteKnowledgeItem'
import { updateDeck } from '../actions/updateDeck'
import { updateKnowledgeItem } from '../actions/updateKnowledgeItem'
import { updateMindmapNode } from '../actions/updateMindmapNode'
import {
  applyDeckOps,
  confirmEdit,
  confirmItems,
  confirmNode,
  dropOp,
  isPendingNodeId,
  PENDING_ITEM_PREFIX,
  PENDING_NODE_PREFIX,
  rebaseOps,
  settleOp,
  type DeckDraftView,
  type DeckOp,
} from '../lib/draft'
import type { DeckDetail, DeckEditor } from '../types'

type AddResult = { success: true; drillable: boolean } | { success: false; message: string }
type BulkResult = { success: true; data: BulkImportResult } | { success: false; message: string }

export type DeckDraftActions = {
  // Show the new species at once; updateDeck in the background, rolled back with a toast on error.
  changeSpecies: (treeType: string) => void
  // Show the statement at once; resolves with the server's verdict (drillable, or why it failed).
  // nodeId may be a root that is still saving: the statement waits for its real id.
  addStatement: (nodeId: string, statement: string) => Promise<AddResult>
  // Show every statement at once; resolves with what the server created and skipped.
  addStatements: (deckId: string, nodeId: string, statements: string[]) => Promise<BulkResult>
  // Remove the statement at once; deleteKnowledgeItem in the background, put back with a toast on error.
  removeStatement: (statement: { id: string; text: string }) => void
  // Show a new root (parentId null) or sub-root at once and return its temporary id, so statements and
  // sub-roots can be typed under it straight away; createMindmapNode in the background, rolled back
  // with a toast on error (with anything typed under it).
  addNode: (parentId: string | null, title: string) => string
  // Show a statement's new text at once; updateKnowledgeItem in the background (it brings back the
  // cleaned text and the drillable flag), rolled back with a toast on error.
  editStatement: (itemId: string, text: string) => void
  // Rename a root at once; updateMindmapNode in the background, rolled back with a toast on error.
  renameNode: (nodeId: string, title: string) => void
  // A statement or root still waiting for its server id (no edit / delete / drill until it has one).
  isPending: (id: string) => boolean
  // A root typed on this visit: its real id once saved (any other id as is). Temp ids stop resolving
  // on the page the moment the save confirms, so anything holding one (an open inline input, a selected root) maps it here.
  resolveId: (id: string) => string
}

const DeckDraftContext = createContext<DeckDraftActions | null>(null)

export const DeckDraftProvider = DeckDraftContext.Provider

// The Tree Workshop (species, its outline editor, bulk import) and the mindmap's Manage dialog call
// these. They live on the deck page (DeckScene provides them).
export function useDeckDraftActions(): DeckDraftActions {
  const actions = useContext(DeckDraftContext)
  if (!actions) throw new Error('useDeckDraftActions: render inside <DeckDraftProvider> (the deck page provides it)')
  return actions
}

// Owner edits on the deck page, optimistic (lib/draft.ts): a species change, new roots and statements,
// an edited statement, a renamed root or a deleted statement show at 0 ms across the whole page (tree sprite, species
// ribbon, counts, size tier, mindmap, Workshop list) and sync in the background, with no page
// refresh; a refusal rolls back with a toast. Writes go to the server one at a time, in the order
// they were made, so siblings keep their order and a statement typed under a root that is still
// saving is sent once that root has its real id.
export function useDeckDraft(detail: DeckDetail, editor: DeckEditor | null): { view: DeckDraftView; actions: DeckDraftActions } {
  const { toast } = useToast()
  const [ops, setOps] = useState<{ base: DeckDetail; list: DeckOp[] }>({ base: detail, list: [] })
  // New server data (a refresh after another edit): ops still in flight carry over onto it.
  const list = useMemo(() => (ops.base === detail ? ops.list : rebaseOps(ops.list)), [ops, detail])
  const view = useMemo(() => applyDeckOps(detail, editor, list), [detail, editor, list])
  const base = useRef(detail)
  const nextKey = useRef(0)
  // Temp root id → its real id once saved (null if refused).
  const nodeIds = useRef(new Map<string, Promise<string | null>>())
  // Temp root id → real id, once saved.
  const savedIds = useRef(new Map<string, string>())
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  // The latest view for the (stable) actions: the species change and pending checks need it.
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
    // A temp root id that has been saved → its real id (so ops never point at a temp id that is gone).
    const resolve = (id: string): string => savedIds.current.get(id) ?? id
    // A saved root's id as is; a pending root's real id once the server has it (null: it was refused).
    const realNodeId = (id: string): Promise<string | null> =>
      isPendingNodeId(id) ? (nodeIds.current.get(id) ?? Promise.resolve(null)) : Promise.resolve(id)
    const nextOpKey = () => `d${nextKey.current++}`

    return {
      changeSpecies: (treeType) => {
        if (treeType === current.current.treeType) return
        const key = nextOpKey()
        edit((l) => [...l, { key, kind: 'species', treeType }])
        void updateDeck({ deckId: detail.deck.id, treeType }).then((res) => {
          if (res.success) return edit((l) => settleOp(l, key))
          edit((l) => dropOp(l, key))
          failed(`Could not change the species to ${getTreeSpecies(treeType).label}: ${res.error.message}`)
        })
      },
      addStatement: async (rawNodeId, statement) => {
        const nodeId = resolve(rawNodeId)
        const key = nextOpKey()
        const tempId = `${PENDING_ITEM_PREFIX}${key}`
        edit((l) => [...l, { key, kind: 'addItems', nodeId, items: [{ tempId, statement }] }])
        const res = await serial(async () => {
          const node = await realNodeId(nodeId)
          return node ? createKnowledgeItem({ nodeId: node, statement }) : null
        })
        if (!res || !res.success) {
          edit((l) => dropOp(l, key))
          return { success: false, message: res ? res.error.message : 'Its root was not saved' }
        }
        edit((l) => confirmItems(l, key, [{ id: res.data.id, statement: statement.trim(), drillable: res.data.drillable }]))
        return { success: true, drillable: res.data.drillable }
      },
      addStatements: async (deckId, rawNodeId, statements) => {
        const nodeId = resolve(rawNodeId)
        const key = nextOpKey()
        edit((l) => [...l, { key, kind: 'addItems', nodeId, items: statements.map((statement, i) => ({ tempId: `${PENDING_ITEM_PREFIX}${key}-${i}`, statement })) }])
        const res = await serial(async () => {
          const node = await realNodeId(nodeId)
          return node ? createKnowledgeItems({ deckId, rootId: node, statements }) : null
        })
        if (!res || !res.success) {
          edit((l) => dropOp(l, key))
          return { success: false, message: res ? res.error.message : 'Its root was not saved' }
        }
        edit((l) => confirmItems(l, key, res.data.created))
        return { success: true, data: res.data }
      },
      removeStatement: ({ id, text }) => {
        const key = nextOpKey()
        edit((l) => [...l, { key, kind: 'removeItem', itemId: id }])
        void deleteKnowledgeItem({ deckId: detail.deck.id, itemId: id }).then((res) => {
          if (res.success) return edit((l) => settleOp(l, key))
          edit((l) => dropOp(l, key))
          toast({ message: `Could not delete “${text}”: ${res.error.message}. It's back in the list.`, icon: '⚠️', tone: 'farewell' })
        })
      },
      addNode: (rawParentId, title) => {
        const parentId = rawParentId === null ? null : resolve(rawParentId)
        const key = nextOpKey()
        const tempId = `${PENDING_NODE_PREFIX}${key}`
        const clean = title.trim()
        edit((l) => [...l, { key, kind: 'addNode', tempId, parentId, title: clean }])
        const saved = serial(async () => {
          const parent = parentId === null ? null : await realNodeId(parentId)
          if (parentId !== null && !parent) return { ok: false as const, message: 'Its parent root was not saved' }
          const res = await createMindmapNode({ deckId: detail.deck.id, title: clean, parentId: parent })
          return res.success ? { ok: true as const, id: res.data.id } : { ok: false as const, message: res.error.message }
        }).then((res) => {
          if (res.ok) {
            savedIds.current.set(tempId, res.id)
            edit((l) => confirmNode(l, key, res.id))
            return res.id
          }
          edit((l) => dropOp(l, key))
          failed(`Could not add the root “${clean}”: ${res.message}`)
          return null
        })
        nodeIds.current.set(tempId, saved)
        return tempId
      },
      renameNode: (rawNodeId, title) => {
        const nodeId = resolve(rawNodeId)
        const clean = title.trim()
        const key = nextOpKey()
        edit((l) => [...l, { key, kind: 'renameNode', nodeId, title: clean }])
        void serial(async () => {
          const node = await realNodeId(nodeId)
          return node ? updateMindmapNode({ nodeId: node, title: clean }) : null
        }).then((res) => {
          if (res?.success) return edit((l) => settleOp(l, key))
          edit((l) => dropOp(l, key))
          if (res) failed(`Could not rename the root to “${clean}”: ${res.error.message}`)
        })
      },
      editStatement: (itemId, text) => {
        const clean = text.trim()
        const key = nextOpKey()
        edit((l) => [...l, { key, kind: 'editItem', itemId, statement: clean }])
        void serial(() => updateKnowledgeItem({ deckId: detail.deck.id, itemId, text: clean })).then((res) => {
          if (res.success) return edit((l) => confirmEdit(l, key, { statement: res.data.statement, drillable: res.data.drillable }))
          edit((l) => dropOp(l, key))
          failed(`Could not save “${clean}”: ${res.error.message}`)
        })
      },
      isPending: (id) => current.current.pendingIds.has(resolve(id)),
      resolveId: resolve,
    }
  }, [detail.deck.id, edit, toast])

  return { view, actions }
}
