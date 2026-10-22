'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { branchSnapshot, emptyHistory, outdentFollowers, pushEntry, restoreSteps, type HistoryEntry, type PresenceNode } from '../lib/history'
import { useUndoShortcuts } from './useUndoShortcuts'
import type { DeckDetail, DeckEditor, NodeType } from '../types'

type AddResult = { success: true; drillable: boolean } | { success: false; message: string }
type BulkResult = { success: true; data: BulkImportResult } | { success: false; message: string }
// A new statement's place: under statement `parentId` (else right under the root), right after
// sibling `afterId` (else last). Either may be a node still saving (its temporary id).
export type StatementPlace = { parentId?: string | null; afterId?: string | null }
// `first`: first among the parent's children when there is no `afterId` (an undone delete).
export type NewNode = { parentId: string | null; afterId?: string | null; first?: boolean; type: NodeType; content: string }

// How long a delete waits before it reaches the server (a little longer than its Undo toast): an
// undo in that time simply cancels it, so the nodes come back with their ids and progress intact.
export const DELETE_GRACE_MS = 5000

export type DeckDraftActions = {
  // The document import's staging editor (OutlineStagingEditor): edits stay in memory until "Done".
  staging?: boolean
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
  // A node and its whole branch, at once and without asking: a bottom toast offers Undo (and Ctrl+Z
  // works); the server delete waits DELETE_GRACE_MS, so an early undo loses nothing.
  removeNode: (node: { id: string; text: string }) => void
  // A node and its branch under another root (last), at once.
  moveNode: (node: { id: string; text: string }, toParentId: string) => void
  // Tab ('in') / Shift+Tab ('out') in place: the outline order never changes, only levels do.
  indentNode: (id: string, dir: 'in' | 'out') => void
  // Alt: root ↔ statement in place.
  toggleType: (id: string) => void
  // The last change (add, delete, text edit, Tab / Shift+Tab, Alt) undone / redone; at most
  // HISTORY_LIMIT are kept. Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y call these (useUndoShortcuts).
  undo: () => void
  redo: () => void
  // A node still waiting for its server id (no edit / delete / drill until it has one).
  isPending: (id: string) => boolean
  // A node typed on this visit (or put back by an undo): its current id (any other id as is).
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

// "Ctrl+Z" or "⌘Z", for the delete toast.
const undoKeyLabel = () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z')
const short = (text: string) => (text.length > 40 ? `${text.slice(0, 39)}…` : text)

// Owner edits on the deck page, optimistic (lib/draft.ts over the outline rows): every change shows
// at 0 ms across the whole page (tree sprite, species ribbon, counts, size tier, mindmap, Workshop)
// and syncs in the background with no page refresh; a refusal rolls back with a toast. Writes go to
// the server one at a time, in the order they were made, so a node typed under (or below) one that
// is still saving is sent once that one has its real id. Content changes are kept for undo / redo
// (lib/history.ts), with Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y on the page while the owner is editing.
export function useDeckDraft(detail: DeckDetail, editor: DeckEditor | null): { view: DeckDraftView; actions: DeckDraftActions } {
  const { toast, dismiss } = useToast()
  const { setCoins } = useCoins()
  const [ops, setOps] = useState<{ base: DeckDetail; list: DeckOp[] }>({ base: detail, list: [] })
  // New server data (a refresh after another edit): ops still in flight carry over onto it.
  const list = useMemo(() => (ops.base === detail ? ops.list : rebaseOps(ops.list)), [ops, detail])
  const view = useMemo(() => applyDeckOps(detail, editor, list), [detail, editor, list])
  const base = useRef(detail)
  const nextKey = useRef(0)
  // Temp id → real id, once saved; and a deleted node's id → the id of the node an undo put back.
  const savedIds = useRef(new Map<string, string>())
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  // The latest view for the (stable) actions: the species change, node lookups and pending checks.
  const current = useRef(view)
  // Undo / redo, and the deletes still waiting for the server (op key → its timer and its send).
  const history = useRef(emptyHistory())
  const replaying = useRef(false)
  const waiting = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => void }>())
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
    // A temp id that has been saved → its real id; a node an undo put back → its new id (a chain: an
    // old id → the new temp id → that one's real id).
    const resolve = (id: string): string => {
      let at = id
      for (let hops = 0; hops < 32; hops++) {
        const next = savedIds.current.get(at)
        if (!next || next === at) break
        at = next
      }
      return at
    }
    // By a write's turn, every node typed before it has its real id; one still temp was refused.
    const real = (id: string | null | undefined): string | null | undefined => (id ? resolve(id) : id)
    const nextOpKey = () => `d${nextKey.current++}`
    const deckId = detail.deck.id
    const rows = () => current.current.editor?.rows ?? []
    const rowOf = (id: string) => rows().find((r) => r.id === resolve(id))
    const record = (entry: HistoryEntry) => {
      if (!replaying.current) history.current = pushEntry(history.current, entry)
    }

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

    const addNodeNow = ({ parentId: rawParent, afterId: rawAfter = null, first = false, type, content }: NewNode) => {
      const parentId = rawParent === null ? null : resolve(rawParent)
      const afterId = rawAfter ? resolve(rawAfter) : null
      const key = nextOpKey()
      const tempId = `${PENDING_ITEM_PREFIX}${key}`
      const clean = content.trim()
      edit((l) => [...l, { key, kind: 'add', tempId, parentId, afterId, first, type, content: clean }])
      const done = serial(async () => {
        const parent = real(parentId) ?? null
        if (parent && isPendingItemId(parent)) return 'Its parent was not saved'
        const after = real(afterId)
        return createContentNode({ deckId, parentId: parent, type, content: clean, afterId: after && !isPendingItemId(after) ? after : null, first: first || undefined })
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

    // A delete: off the screen at once, sent once DELETE_GRACE_MS have passed (or the page goes).
    const scheduleRemove = (rawId: string, text: string): string => {
      const key = nextOpKey()
      const target = resolve(rawId)
      edit((l) => [...l, { key, kind: 'remove', id: target }])
      const send = () => {
        waiting.current.delete(key)
        void serial(() => deleteKnowledgeItem({ deckId, itemId: resolve(target) })).then((res) => {
          if (res.success) return edit((l) => settleOp(l, key))
          edit((l) => dropOp(l, key))
          toast({ message: `Could not delete “${text}”: ${res.error.message}. It's back in the list.`, icon: '⚠️', tone: 'farewell' })
        })
      }
      waiting.current.set(key, { timer: setTimeout(send, DELETE_GRACE_MS), send })
      return key
    }
    // A delete that hasn't reached the server is simply dropped (true); one that has can't be (false).
    const cancelRemove = (key: string | undefined): boolean => {
      const pending = key ? waiting.current.get(key) : undefined
      if (!key || !pending) return false
      clearTimeout(pending.timer)
      waiting.current.delete(key)
      edit((l) => dropOp(l, key))
      return true
    }

    // Nodes (with their branches) off the tree: each one's snapshot first, then the deletes.
    const makeAbsent = (nodes: PresenceNode[]) => {
      for (const n of nodes) n.snapshot = branchSnapshot(rows(), resolve(n.id)) ?? n.snapshot
      for (const n of nodes) n.removalKey = rowOf(n.id) ? scheduleRemove(n.id, n.text) : undefined
    }
    // Nodes back where they were: a delete still waiting is cancelled (nothing was lost); one that
    // already reached the server is re-created from its snapshot, node by node, as new nodes.
    const makePresent = (nodes: PresenceNode[]) => {
      const rebuilt: PresenceNode[] = []
      for (const n of nodes) {
        if (cancelRemove(n.removalKey)) continue
        n.removalKey = undefined
        if (!n.snapshot || rowOf(n.id)) continue
        for (const step of restoreSteps(n.snapshot)) {
          const { id } = addNodeNow({
            parentId: step.parentId && resolve(step.parentId),
            afterId: step.afterId && resolve(step.afterId),
            first: step.first,
            type: step.type,
            content: step.content,
          })
          savedIds.current.set(step.id, id)
        }
        rebuilt.push(n)
      }
      const statements = rebuilt.some((n) => n.snapshot!.rows.some((r) => r.type === 'statement'))
      if (statements) toast({ message: `Restored “${short(rebuilt[0].text)}”. Practice progress on its statements starts over.`, icon: '↩️', tone: 'amber' })
    }

    const editNow = (rawId: string, content: string) => {
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
    }
    const indentNow = (rawId: string, dir: 'in' | 'out') => {
      const id = resolve(rawId)
      change((key) => ({ key, kind: 'indent', id, dir }), () => indentContentNode({ deckId, nodeId: resolve(id), direction: dir }), 'move it')
    }
    const toggleNow = (rawId: string, announce: boolean) => {
      const id = resolve(rawId)
      const row = rowOf(id)
      const becomes = row?.type === 'root' ? 'statement' : 'root'
      // A statement the engine can't ask shows 💧 in the outline; nothing else to warn about.
      change((key) => ({ key, kind: 'toggle', id }), () => toggleNodeType({ deckId, nodeId: resolve(id) }), `turn it into a ${becomes}`)
      if (row && announce) toast({ message: becomes === 'root' ? 'Converted to Root' : 'Converted to Statement', icon: becomes === 'root' ? '🌿' : '📜' })
    }

    // Undo / redo one entry: its inverse, or the change again. Nothing done here is recorded.
    const replay = (entry: HistoryEntry, forward: boolean) => {
      replaying.current = true
      try {
        switch (entry.kind) {
          case 'presence':
            if (entry.present === forward) makePresent(entry.nodes)
            else makeAbsent(entry.nodes)
            if (entry.toastId !== undefined && !forward) dismiss(entry.toastId)
            break
          case 'edit':
            editNow(entry.id, forward ? entry.to : entry.from)
            break
          case 'indent':
            if (forward) indentNow(entry.id, entry.dir)
            else if (entry.dir === 'in') indentNow(entry.id, 'out')
            else {
              // Back under its old parent, then the rows it adopted back out of it, last first.
              indentNow(entry.id, 'in')
              for (const f of [...entry.followers].reverse()) indentNow(f, 'out')
            }
            break
          case 'toggle':
            toggleNow(entry.id, false)
            break
        }
      } finally {
        replaying.current = false
      }
    }
    const undoEntry = (entry: HistoryEntry) => {
      const h = history.current
      const at = h.past.lastIndexOf(entry)
      if (at < 0) return
      history.current = { past: [...h.past.slice(0, at), ...h.past.slice(at + 1)], future: [...h.future, entry] }
      replay(entry, false)
    }
    const undo = () => {
      const entry = history.current.past.at(-1)
      if (entry) undoEntry(entry)
    }
    const redo = () => {
      const h = history.current
      const entry = h.future.at(-1)
      if (!entry) return
      history.current = { past: [...h.past, entry], future: h.future.slice(0, -1) }
      replay(entry, true)
    }

    const removeNode: DeckDraftActions['removeNode'] = ({ id, text }) => {
      const entry: Extract<HistoryEntry, { kind: 'presence' }> = { kind: 'presence', present: false, nodes: [{ id: resolve(id), text }] }
      makeAbsent(entry.nodes)
      record(entry)
      entry.toastId = toast({
        message: `Deleted “${short(text)}”. Press ${undoKeyLabel()} or Undo to restore.`,
        icon: '🗑️',
        tone: 'farewell',
        placement: 'bottom',
        action: { label: 'Undo', onClick: () => undoEntry(entry) },
      })
    }

    const moveNode: DeckDraftActions['moveNode'] = ({ id, text }, rawTo) => {
      const target = resolve(id)
      const to = resolve(rawTo)
      change((key) => ({ key, kind: 'move', id: target, toParentId: to }), () => moveKnowledgeItem({ deckId, itemId: resolve(target), toNodeId: resolve(to) }), `move “${text}”`)
    }

    const addNode: DeckDraftActions['addNode'] = (node) => {
      const added = addNodeNow(node)
      record({ kind: 'presence', present: true, nodes: [{ id: added.id, text: node.content.trim() }] })
      return added
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
        if (res.data.created.length > 0) record({ kind: 'presence', present: true, nodes: res.data.created.map((c) => ({ id: c.id, text: c.statement })) })
        return { success: true, data: res.data }
      },
      editNode: (rawId, content) => {
        const from = rowOf(rawId)?.content
        const to = content.trim()
        if (from !== undefined && from !== to) record({ kind: 'edit', id: resolve(rawId), from, to })
        editNow(rawId, content)
      },
      removeNode,
      moveNode,
      indentNode: (rawId, dir) => {
        record({ kind: 'indent', id: resolve(rawId), dir, followers: dir === 'out' ? outdentFollowers(rows(), resolve(rawId)) : [] })
        indentNow(rawId, dir)
      },
      toggleType: (rawId) => {
        record({ kind: 'toggle', id: resolve(rawId) })
        toggleNow(rawId, true)
      },
      undo,
      redo,
      isPending: (id) => current.current.pendingIds.has(resolve(id)),
      resolveId: resolve,
      removeStatement: removeNode,
      moveStatement: moveNode,
    }
  }, [detail.deck.id, edit, toast, dismiss, setCoins])

  // Deletes still waiting go out now when the owner leaves the page (or the tab is hidden for good).
  useEffect(() => {
    const flush = () => {
      for (const w of [...waiting.current.values()]) {
        clearTimeout(w.timer)
        w.send()
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])
  useUndoShortcuts(actions, editor !== null)

  return { view, actions }
}
