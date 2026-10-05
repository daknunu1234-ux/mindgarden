// Statements and sub-statements (pure, unit-tested). A statement may have sub-statements, one
// level deep, in the same root (knowledge_items.parent_item_id, migration 20261010000000). Rows
// carry a sort_order: new rows append (insert time), and a row typed right below another one
// takes the midpoint between that row and the next.

export type StatementGroup<T> = { item: T; children: T[] }

// Flat rows (already in order) → statements, each with its sub-statements in order. A sub-statement
// whose parent isn't in the list (moved, deleted, or still saving) shows as a statement: nothing is lost.
export function nestStatements<T extends { id: string; parentId?: string | null }>(items: readonly T[]): StatementGroup<T>[] {
  const ids = new Set(items.map((i) => i.id))
  const groups: StatementGroup<T>[] = []
  const byId = new Map<string, StatementGroup<T>>()
  for (const item of items) {
    if (item.parentId && ids.has(item.parentId) && item.parentId !== item.id) continue
    const group = { item, children: [] }
    groups.push(group)
    byId.set(item.id, group)
  }
  for (const item of items) {
    if (!item.parentId || item.parentId === item.id || !ids.has(item.parentId)) continue
    const parent = byId.get(item.parentId)
    // A parent that is itself a sub-statement (one level only) leaves the row at the top level.
    if (parent) parent.children.push(item)
    else groups.push({ item, children: [] })
  }
  return groups
}

// The same rows in display order: each statement followed by its sub-statements.
export function flattenStatements<T extends { id: string; parentId?: string | null }>(items: readonly T[]): T[] {
  return nestStatements(items).flatMap((g) => [g.item, ...g.children])
}

// The row with its sub-statements (a sub-statement alone when it is one).
export function withSubStatements<T extends { id: string; parentId?: string | null }>(items: readonly T[], id: string): T[] {
  return items.filter((i) => i.id === id || i.parentId === id)
}

type OrderedRow = { id: string; sort_order?: number | null; created_at?: string | null }

// Database order: sort_order, then insert time, then id (rows from before the migration have only
// created_at, and compare by it).
export function compareStatementRows(a: OrderedRow, b: OrderedRow): number {
  const byOrder = (a.sort_order ?? 0) - (b.sort_order ?? 0)
  if (byOrder !== 0) return byOrder
  const byTime = (a.created_at ?? '').localeCompare(b.created_at ?? '')
  return byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// sort_order for a row appended after `max` (the largest one there, null when none): the insert
// time, like the column default, but always after `max` even if clocks disagree.
export function appendSortOrder(max: number | null, nowSeconds: number): number {
  return max === null || nowSeconds > max ? nowSeconds : max + 0.001
}

// sort_order for a row inserted right after `anchor`, before `next` (null: the anchor is the last).
export function insertSortOrder(anchor: number, next: number | null, nowSeconds: number): number {
  if (next === null || next <= anchor) return appendSortOrder(anchor, nowSeconds)
  return anchor + (next - anchor) / 2
}

// Longest parent statement (code points) a sub-statement takes as its subject in drill questions,
// like a root's title: "Ty thể" → "sản sinh ATP" reads "Ty thể sản sinh ATP". A longer parent is a
// full sentence, not a subject, so its sub-statements keep their root's context.
export const MAX_PARENT_CONTEXT_LENGTH = 80

export function parentContext(parentStatement: string | null | undefined): string | null {
  const text = parentStatement?.trim()
  if (!text) return null
  return [...text].length <= MAX_PARENT_CONTEXT_LENGTH ? text : null
}
