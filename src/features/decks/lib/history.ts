// Undo / redo for the Tree Workshop and the mindmap's owner tools (pure parts, unit-tested). The deck
// draft keeps the last HISTORY_LIMIT changes as entries; undoing one applies its inverse through the
// same draft actions (so the screen changes at 0 ms and the server follows):
//   presence  nodes added or deleted (with their whole branch): undo flips them back
//   edit      a node's text: back to the old text
//   indent    Tab / Shift+Tab: the opposite move (an outdent also hands back the rows it adopted)
//   toggle    Alt: root ↔ statement again
// A deleted branch is snapshotted first, so it can be put back exactly where it was.
import { branchEnd } from './contentTree'
import type { ContentRow } from '../types'

export const HISTORY_LIMIT = 50

// A node's branch as it stood, and its place: under `parentId`, right after sibling `afterId`, or
// first among the children when it had no sibling above it.
export type BranchSnapshot = { rows: ContentRow[]; parentId: string | null; afterId: string | null; first: boolean }

export function branchSnapshot(rows: readonly ContentRow[], id: string): BranchSnapshot | null {
  const at = rows.findIndex((r) => r.id === id)
  if (at < 0) return null
  const row = rows[at]
  let above: ContentRow | undefined
  for (let k = at - 1; k >= 0 && rows[k].depth >= row.depth; k--) if (rows[k].depth === row.depth && rows[k].parentId === row.parentId) above = above ?? rows[k]
  return { rows: rows.slice(at, branchEnd(rows, at)), parentId: row.parentId, afterId: above?.id ?? null, first: !above }
}

// One node to add back. Ids are the snapshot's: the branch's own parents and siblings are re-created
// first, so the caller maps each old id to the new node's id as it goes.
export type RestoreStep = { id: string; parentId: string | null; afterId: string | null; first: boolean; type: ContentRow['type']; content: string }

// The adds that rebuild a snapshot in outline order: the top node at its old place, then each node
// after the previous one under the same parent (or as the first child).
export function restoreSteps(snapshot: BranchSnapshot): RestoreStep[] {
  const lastChild = new Map<string, string>()
  return snapshot.rows.map((r, i) => {
    if (i === 0) return { id: r.id, parentId: snapshot.parentId, afterId: snapshot.afterId, first: snapshot.first, type: r.type, content: r.content }
    const after = lastChild.get(r.parentId!) ?? null
    lastChild.set(r.parentId!, r.id)
    return { id: r.id, parentId: r.parentId, afterId: after, first: after === null, type: r.type, content: r.content }
  })
}

// The siblings below a row that Shift+Tab hands to it as children (contentTree indentRow 'out'), so
// undoing the outdent can give them back.
export function outdentFollowers(rows: readonly ContentRow[], id: string): string[] {
  const at = rows.findIndex((r) => r.id === id)
  if (at < 0) return []
  const row = rows[at]
  const followers: string[] = []
  for (let i = branchEnd(rows, at); i < rows.length && rows[i].depth >= row.depth; i++) if (rows[i].parentId === row.parentId) followers.push(rows[i].id)
  return followers
}

// A node that an entry adds or deletes. Filled in as it goes: the snapshot taken when it was last
// deleted, and the key of that delete while it still waits to reach the server.
export type PresenceNode = { id: string; text: string; snapshot?: BranchSnapshot; removalKey?: string }

export type HistoryEntry =
  // `present`: whether the nodes exist after the change (an add: true, a delete: false).
  | { kind: 'presence'; present: boolean; nodes: PresenceNode[]; toastId?: number }
  | { kind: 'edit'; id: string; from: string; to: string }
  | { kind: 'indent'; id: string; dir: 'in' | 'out'; followers: string[] }
  | { kind: 'toggle'; id: string }

export type History = { past: HistoryEntry[]; future: HistoryEntry[] }

export const emptyHistory = (): History => ({ past: [], future: [] })

// A new change: on top of the past (the oldest drop off), and the redo list is gone.
export const pushEntry = (h: History, entry: HistoryEntry): History => ({ past: [...h.past, entry].slice(-HISTORY_LIMIT), future: [] })
