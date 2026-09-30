'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/shared/stores/ToastProvider'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { createKnowledgeItem } from '../actions/createKnowledgeItem'
import { createKnowledgeItems, type BulkImportResult } from '../actions/createKnowledgeItems'
import { deleteKnowledgeItem } from '../actions/deleteKnowledgeItem'
import { updateDeck } from '../actions/updateDeck'
import { applyDeckOps, confirmItems, dropOp, PENDING_ITEM_PREFIX, type DeckDraftView, type DeckOp } from '../lib/draft'
import type { DeckDetail, DeckEditor } from '../types'

type AddResult = { success: true; drillable: boolean } | { success: false; message: string }
type BulkResult = { success: true; data: BulkImportResult } | { success: false; message: string }

export type DeckDraftActions = {
  // Show the new species at once; updateDeck in the background, rolled back with a toast on error.
  changeSpecies: (treeType: string) => void
  // Show the statement at once; resolves with the server's verdict (drillable, or why it failed).
  addStatement: (nodeId: string, statement: string) => Promise<AddResult>
  // Show every statement at once; resolves with what the server created and skipped.
  addStatements: (deckId: string, nodeId: string, statements: string[]) => Promise<BulkResult>
  // Remove the statement at once; deleteKnowledgeItem in the background, put back with a toast on error.
  removeStatement: (statement: { id: string; text: string }) => void
  // A statement still waiting for its server id (no edit / delete until it has one).
  isPending: (itemId: string) => boolean
}

const DeckDraftContext = createContext<DeckDraftActions | null>(null)

export const DeckDraftProvider = DeckDraftContext.Provider

// The Tree Workshop's forms (species, statements, bulk import, the mindmap's Manage dialog) call
// these. They live on the deck page (DeckScene provides them).
export function useDeckDraftActions(): DeckDraftActions {
  const actions = useContext(DeckDraftContext)
  if (!actions) throw new Error('useDeckDraftActions: render inside <DeckDraftProvider> (the deck page provides it)')
  return actions
}

// Owner edits on the deck page, optimistic (lib/draft.ts): a species change, new statements or a deleted
// statement show at
// 0 ms across the whole page (tree sprite, species ribbon, counts, size tier, mindmap, Workshop list)
// and sync in the background, with no page refresh; a refusal rolls back with a toast.
export function useDeckDraft(detail: DeckDetail, editor: DeckEditor | null): { view: DeckDraftView; actions: DeckDraftActions } {
  const { toast } = useToast()
  const [ops, setOps] = useState<{ base: DeckDetail; list: DeckOp[] }>({ base: detail, list: [] })
  const list = useMemo(() => (ops.base === detail ? ops.list : []), [ops, detail])
  const view = useMemo(() => applyDeckOps(detail, editor, list), [detail, editor, list])
  const edit = useCallback((change: (list: DeckOp[]) => DeckOp[]) => setOps((o) => ({ base: detail, list: change(o.base === detail ? o.list : []) })), [detail])
  const nextKey = useRef(0)
  // The latest view for the (stable) actions: the species change and pending checks need it.
  const current = useRef(view)
  useLayoutEffect(() => {
    current.current = view
  })

  const actions = useMemo<DeckDraftActions>(() => {
    const failed = (message: string) => toast({ message: `${message}. Changes undone.`, icon: '⚠️', tone: 'farewell' })
    return {
      changeSpecies: (treeType) => {
        if (treeType === current.current.treeType) return
        const key = `d${nextKey.current++}`
        edit((l) => [...l, { key, kind: 'species', treeType }])
        void updateDeck({ deckId: detail.deck.id, treeType }).then((res) => {
          if (res.success) return
          edit((l) => dropOp(l, key))
          failed(`Could not change the species to ${getTreeSpecies(treeType).label}: ${res.error.message}`)
        })
      },
      addStatement: async (nodeId, statement) => {
        const key = `d${nextKey.current++}`
        const tempId = `${PENDING_ITEM_PREFIX}${key}`
        edit((l) => [...l, { key, kind: 'addItems', nodeId, items: [{ tempId, statement }] }])
        const res = await createKnowledgeItem({ nodeId, statement })
        if (!res.success) {
          edit((l) => dropOp(l, key))
          return { success: false, message: res.error.message }
        }
        edit((l) => confirmItems(l, key, [{ id: res.data.id, statement: statement.trim(), drillable: res.data.drillable }]))
        return { success: true, drillable: res.data.drillable }
      },
      addStatements: async (deckId, nodeId, statements) => {
        const key = `d${nextKey.current++}`
        edit((l) => [...l, { key, kind: 'addItems', nodeId, items: statements.map((statement, i) => ({ tempId: `${PENDING_ITEM_PREFIX}${key}-${i}`, statement })) }])
        const res = await createKnowledgeItems({ deckId, rootId: nodeId, statements })
        if (!res.success) {
          edit((l) => dropOp(l, key))
          return { success: false, message: res.error.message }
        }
        edit((l) => confirmItems(l, key, res.data.created))
        return { success: true, data: res.data }
      },
      removeStatement: ({ id, text }) => {
        const key = `d${nextKey.current++}`
        edit((l) => [...l, { key, kind: 'removeItem', itemId: id }])
        void deleteKnowledgeItem({ deckId: detail.deck.id, itemId: id }).then((res) => {
          if (res.success) return
          edit((l) => dropOp(l, key))
          toast({ message: `Could not delete “${text}”: ${res.error.message}. It's back in the list.`, icon: '⚠️', tone: 'farewell' })
        })
      },
      isPending: (itemId) => current.current.pendingIds.has(itemId),
    }
  }, [detail.deck.id, edit, toast])

  return { view, actions }
}
