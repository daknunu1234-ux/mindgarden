// The document import's staging outline (pure, unit-tested). A parsed document becomes Tree Workshop
// rows (ContentRow, outline order) that the Workshop's own editor edits in memory, with the same
// in-place rules (lib/contentTree); "Done" turns the rows back into importOutline's lines. Nothing
// here touches the server: staged rows have local ids (STAGED_PREFIX) until the import writes them.
import { cleanStatement } from './bulkStatements'
import { MAX_OUTLINE_DEPTH, MAX_OUTLINE_LINES, outlineLineIssue, type OutlineLine } from './outlinePlan'
import { insertRow } from './contentTree'
import type { ContentRow } from '../types'

export const STAGED_PREFIX = 'staged-'

// A document's three-level outline (1 root, 2 sub-root, 3 statement; the mindmap's parser gives it).
export type DocumentLine = { level: 1 | 2 | 3; text: string }

// Document lines → Workshop rows: a root at the top, a sub-root under the root above it, a statement
// under the nearest sub-root of that root (else the root). Lines before the first root are skipped
// (the parser always starts with one).
export function stagedRows(lines: readonly DocumentLine[]): ContentRow[] {
  const rows: ContentRow[] = []
  let root: ContentRow | null = null
  let subRoot: ContentRow | null = null
  lines.forEach(({ level, text }, i) => {
    const id = `${STAGED_PREFIX}${i}`
    if (level === 1) {
      root = { id, parentId: null, type: 'root', content: text, depth: 0 }
      subRoot = null
      rows.push(root)
      return
    }
    if (!root) return
    if (level === 2) {
      subRoot = { id, parentId: root.id, type: 'root', content: text, depth: 1 }
      rows.push(subRoot)
      return
    }
    const parent: ContentRow = subRoot ?? root
    rows.push({ id, parentId: parent.id, type: 'statement', content: text, depth: parent.depth + 1 })
  })
  return rows
}

// What "Done" sends: depth, type and cleaned text in outline order (no ids).
export const importLines = (rows: readonly ContentRow[]): OutlineLine[] => rows.map((r) => ({ depth: r.depth, type: r.type, text: cleanStatement(r.content) }))

// Why each row can't be imported (row id → message): the server's rules, checked before "Done".
export function stagingIssues(rows: readonly ContentRow[]): Map<string, string> {
  const issues = new Map<string, string>()
  for (const r of rows) {
    const issue = r.depth > MAX_OUTLINE_DEPTH ? `Nest at most ${MAX_OUTLINE_DEPTH + 1} levels deep` : outlineLineIssue({ type: r.type, text: cleanStatement(r.content) })
    if (issue) issues.set(r.id, issue)
  }
  return issues
}

// Why the whole outline can't be imported, or null (the per-row issues are stagingIssues).
export function stagingBlocker(rows: readonly ContentRow[]): string | null {
  if (rows.length === 0) return 'There is nothing to import'
  if (rows.length > MAX_OUTLINE_LINES) return `Import at most ${MAX_OUTLINE_LINES} lines at a time (this outline has ${rows.length})`
  return null
}

// The bulk importer in staging: statements appended under `parentId`, skipping ones already there
// (as createKnowledgeItems does). `makeId` gives each new row its local id.
export function addStagedStatements(rows: readonly ContentRow[], parentId: string, statements: readonly string[], makeId: () => string) {
  const seen = new Set(rows.filter((r) => r.parentId === parentId && r.type === 'statement').map((r) => cleanStatement(r.content)))
  let next: ContentRow[] = [...rows]
  const created: { id: string; statement: string }[] = []
  let skipped = 0
  for (const raw of statements) {
    const statement = cleanStatement(raw)
    if (seen.has(statement)) {
      skipped++
      continue
    }
    const id = makeId()
    const after = insertRow(next, { id, parentId, type: 'statement', content: statement }, null)
    if (typeof after === 'string') continue
    next = after
    seen.add(statement)
    created.push({ id, statement })
  }
  return { rows: next, created, skipped }
}
