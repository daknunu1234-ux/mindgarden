// An imported outline (pure, unit-tested): the rules every line must meet and where each line goes.
// The outline is the Tree Workshop's own shape, rows in outline order with their depth and type:
// depth 0 = a top-level root, and every row sits under the nearest row above it one level up (any
// node under any node, like content_nodes). The import dialog stages it in the Workshop's editor; the
// server (ImportOutlineDto) checks the same rules before writing.
import { LATEX_COMMAND, MAX_STATEMENT_LENGTH, MIN_BULK_STATEMENT_LENGTH } from './bulkStatements'
import type { NodeType } from '../types'

export const MAX_OUTLINE_LINES = 1000
// The deepest row: depth 8, i.e. nine levels (a top-level root and eight below it).
export const MAX_OUTLINE_DEPTH = 8
export const MAX_OUTLINE_ROOT_LENGTH = 150

export type OutlineLine = { depth: number; type: NodeType; text: string }
export type PlannedLine = OutlineLine & { index: number; parent: number | null; order: number }

// Why one line can't be imported as it stands (its text already cleaned), or null.
export function outlineLineIssue({ type, text }: Pick<OutlineLine, 'type' | 'text'>): string | null {
  const n = [...text].length
  if (type === 'statement') {
    if (n < MIN_BULK_STATEMENT_LENGTH) return `A statement needs at least ${MIN_BULK_STATEMENT_LENGTH} characters`
    if (n > MAX_STATEMENT_LENGTH) return `Keep each statement under ${MAX_STATEMENT_LENGTH} characters`
  } else {
    if (n < 1) return 'Name every root and sub-root'
    if (n > MAX_OUTLINE_ROOT_LENGTH) return `Keep root names under ${MAX_OUTLINE_ROOT_LENGTH} characters`
  }
  if (LATEX_COMMAND.test(text)) return 'Use plain text, not LaTeX (no \\commands)'
  return null
}

// Why the outline's shape can't be imported, or null: it starts at the top, never skips a level going
// down, keeps top-level rows roots and stays within MAX_OUTLINE_DEPTH.
export function outlineShapeIssue(items: readonly Pick<OutlineLine, 'depth' | 'type'>[]): string | null {
  if (items.length > 0 && items[0].depth !== 0) return 'The outline must start with a root'
  for (let i = 0; i < items.length; i++) {
    const { depth, type } = items[i]
    if (!Number.isInteger(depth) || depth < 0) return 'Every line needs a level'
    if (depth > MAX_OUTLINE_DEPTH) return `Nest at most ${MAX_OUTLINE_DEPTH + 1} levels deep`
    if (depth === 0 && type !== 'root') return 'A top-level line is a root'
    if (i > 0 && depth > items[i - 1].depth + 1) return 'A line can be at most one level below the line above it'
  }
  return null
}

// Each line's parent among the lines (the nearest line above it one level up) and its place among
// that parent's children; top-level roots are numbered in order. A line deeper than it can be (the
// action refuses that input anyway) is placed one level below the line above it.
export function planOutline(items: readonly OutlineLine[]): PlannedLine[] {
  // The latest line at each depth.
  const lastAt: number[] = []
  let topOrder = 0
  const childCount = new Map<number, number>()
  return items.map((line, index) => {
    const depth = Math.min(Math.max(0, line.depth), lastAt.length)
    lastAt.length = depth
    lastAt.push(index)
    if (depth === 0) return { ...line, depth, index, parent: null, order: ++topOrder }
    const parent = lastAt[depth - 1]
    const order = (childCount.get(parent) ?? 0) + 1
    childCount.set(parent, order)
    return { ...line, depth, index, parent, order }
  })
}
