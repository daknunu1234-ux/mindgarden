'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton } from '@/shared/components/game'
import { useToast } from '@/shared/stores/ToastProvider'
import { importOutline } from '../actions/importOutline'
import { editRow, indentRow, insertRow, moveRow, removeRow, toEditorNodes, toggleRow } from '../lib/contentTree'
import { isDrillable } from '../lib/drillable'
import { addStagedStatements, importLines, STAGED_PREFIX, stagedRows, stagingBlocker, stagingIssues, type DocumentLine } from '../lib/outlineStaging'
import { HISTORY_LIMIT } from '../lib/history'
import { ContentOutline } from './ContentOutline'
import { DeckDraftProvider, type DeckDraftActions } from './DeckDraft'
import { useUndoShortcuts } from './useUndoShortcuts'
import type { ContentRow, DeckEditor } from '../types'

type OutlineStagingEditorProps = {
  deckId: string
  treeType: string
  // The parsed document (the mindmap's parser): roots, sub-roots and statements in document order.
  lines: readonly DocumentLine[]
  // Back to picking another file (the staged edits are dropped).
  onBack?: () => void
  // The import went through: close the dialog (the page refreshes itself here).
  onDone: () => void
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
// How many issues the list under the editor names before "and N more".
const ISSUES_SHOWN = 5

// An edit that can't apply leaves the rows as they are (the Workshop shows the same hint first).
const keep = (rows: ContentRow[], next: ContentRow[] | string): ContentRow[] => (typeof next === 'string' ? rows : next)

// The outline and its undo / redo snapshots (everything is in memory, so a snapshot is exact).
type Staged = { rows: ContentRow[]; past: ContentRow[][]; future: ContentRow[][] }

// The deck draft's actions over an in-memory outline: the Tree Workshop's editor (ContentOutline)
// runs on them unchanged, so the import is edited with exactly the Workshop's keys, tools and rules
// (lib/contentTree), and nothing reaches the server until "Done". Deletes go at once with an Undo
// toast, and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo (this editor takes the keys while open).
export function useStagingDraft(initial: readonly ContentRow[]): { rows: ContentRow[]; actions: DeckDraftActions } {
  const { toast } = useToast()
  const [staged, setStaged] = useState<Staged>(() => ({ rows: [...initial], past: [], future: [] }))
  const rows = staged.rows
  // Every change is one step back; an edit that changes nothing is not one.
  const setRows = useCallback(
    (change: (rows: ContentRow[]) => ContentRow[]) =>
      setStaged((s) => {
        const next = change(s.rows)
        return next === s.rows ? s : { rows: next, past: [...s.past, s.rows].slice(-HISTORY_LIMIT), future: [] }
      }),
    [],
  )
  const current = useRef(rows)
  useLayoutEffect(() => {
    current.current = rows
  })
  const nextId = useRef(0)

  const actions = useMemo<DeckDraftActions>(() => {
    const makeId = () => `${STAGED_PREFIX}new-${nextId.current++}`
    const undo = () => setStaged((s) => (s.past.length ? { rows: s.past.at(-1)!, past: s.past.slice(0, -1), future: [...s.future, s.rows] } : s))
    const redo = () => setStaged((s) => (s.future.length ? { rows: s.future.at(-1)!, past: [...s.past, s.rows], future: s.future.slice(0, -1) } : s))
    const removeNode: DeckDraftActions['removeNode'] = ({ id, text }) => {
      setRows((r) => removeRow(r, id))
      toast({ message: `Removed “${text.length > 40 ? `${text.slice(0, 39)}…` : text}” from the import. Press Ctrl+Z or Undo to restore.`, icon: '🗑️', tone: 'farewell', placement: 'bottom', action: { label: 'Undo', onClick: undo } })
    }
    const moveNode: DeckDraftActions['moveNode'] = ({ id }, to) => setRows((r) => keep(r, moveRow(r, id, to)))
    const addNode: DeckDraftActions['addNode'] = ({ parentId, afterId = null, type, content }) => {
      const id = makeId()
      const clean = content.trim()
      setRows((r) => keep(r, insertRow(r, { id, parentId, type, content: clean }, afterId)))
      return { id, done: Promise.resolve({ success: true, drillable: type === 'statement' && isDrillable(clean) }) }
    }
    return {
      staging: true,
      // The species and the tree's name belong to the tree, not to the import.
      changeSpecies: () => undefined,
      renameTree: () => undefined,
      addNode,
      addStatement: (nodeId, statement, place = {}) =>
        addNode({ parentId: place.parentId ?? nodeId, afterId: place.afterId ?? null, type: 'statement', content: statement }).done,
      addStatements: async (_deckId, nodeId, statements) => {
        // The ids are fixed first, so the update below makes the same rows as this preview.
        const ids = statements.map(() => makeId())
        const fixedIds = () => {
          let k = 0
          return () => ids[k++]
        }
        const preview = addStagedStatements(current.current, nodeId, statements, fixedIds())
        setRows((r) => addStagedStatements(r, nodeId, statements, fixedIds()).rows)
        return { success: true, data: { created: preview.created.map((c) => ({ ...c, drillable: isDrillable(c.statement) })), skipped: preview.skipped } }
      },
      editNode: (id, content) => setRows((r) => (r.find((x) => x.id === id)?.content === content.trim() ? r : editRow(r, id, content.trim()))),
      removeNode,
      moveNode,
      indentNode: (id, dir) => setRows((r) => keep(r, indentRow(r, id, dir))),
      toggleType: (id) => {
        const becomes = current.current.find((r) => r.id === id)?.type === 'root' ? 'statement' : 'root'
        setRows((r) => keep(r, toggleRow(r, id)))
        toast({ message: becomes === 'root' ? 'Converted to Root' : 'Converted to Statement', icon: becomes === 'root' ? '🌿' : '📜' })
      },
      undo,
      redo,
      isPending: () => false,
      resolveId: (id) => id,
      removeStatement: removeNode,
      moveStatement: moveNode,
    }
  }, [toast, setRows])
  useUndoShortcuts(actions)

  return { rows, actions }
}

// The document import's review step: the parsed outline in the Tree Workshop's own editor (same
// layout, keys, hover tools and badges), staged in memory. Rows the server would refuse get an amber
// ⚠️ with the reason, and "Done" waits until there are none; then importOutline writes the whole
// outline after the tree's roots, the dialog closes and the page refreshes.
export function OutlineStagingEditor({ deckId, treeType, lines, onBack, onDone }: OutlineStagingEditorProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [initial] = useState(() => stagedRows(lines))
  const { rows, actions } = useStagingDraft(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const editor = useMemo<DeckEditor>(() => ({ deckId, treeType, rows, nodes: toEditorNodes(rows) }), [deckId, treeType, rows])
  const issues = useMemo(() => stagingIssues(rows), [rows])
  const blocker = stagingBlocker(rows)
  const counts = useMemo(
    () => ({
      roots: rows.filter((r) => r.depth === 0).length,
      subRoots: rows.filter((r) => r.depth > 0 && r.type === 'root').length,
      statements: rows.filter((r) => r.type === 'statement').length,
    }),
    [rows],
  )
  const topTitle = (id: string): string => {
    const byId = new Map(rows.map((r) => [r.id, r]))
    let at = byId.get(id)
    while (at?.parentId) at = byId.get(at.parentId)
    return at?.content ?? ''
  }

  const done = () => {
    if (blocker || issues.size > 0) return
    setError(null)
    startTransition(async () => {
      const res = await importOutline({ deckId, items: importLines(rows) })
      if (!res.success) {
        setError(res.error.message)
        return
      }
      const { roots, subRoots, statements } = res.data
      toast({ icon: '📄', tone: 'leaf', message: `Imported ${plural(roots, 'root', 'roots')}, ${plural(subRoots, 'sub-root', 'sub-roots')} and ${plural(statements, 'statement', 'statements')}` })
      onDone()
      router.refresh()
    })
  }

  const listed = [...issues].slice(0, ISSUES_SHOWN)
  return (
    <div className="space-y-3">
      <p className="text-center font-game text-sm font-bold text-emerald-800">
        {plural(counts.roots, 'root', 'roots')} · {plural(counts.subRoots, 'sub-root', 'sub-roots')} · {plural(counts.statements, 'statement', 'statements')}
      </p>
      <p className="text-center text-xs text-amber-900/70">
        Edit it exactly like the Tree Workshop: Enter for a new line, Tab / Shift+Tab to nest, Alt to switch Root ↔ Statement. Nothing is saved until you press Done.
      </p>

      <DeckDraftProvider value={actions}>
        <ContentOutline editor={editor} issues={issues} />
      </DeckDraftProvider>

      {(blocker || issues.size > 0) && (
        <div role="status" className="rounded-xl bg-amber-100/80 px-3 py-2 text-xs text-amber-900">
          <p className="font-bold">{blocker ?? `${plural(issues.size, 'line needs', 'lines need')} a fix before importing (marked ⚠️):`}</p>
          {!blocker && (
            <ul className="mt-1 space-y-0.5">
              {listed.map(([id, issue]) => {
                const row = rows.find((r) => r.id === id)
                return (
                  <li key={id} className="truncate">
                    • <span className="font-semibold">{topTitle(id)}</span> › “{row?.content || '…'}”: {issue}
                  </li>
                )
              })}
              {issues.size > listed.length && <li>• and {issues.size - listed.length} more</li>}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-orange-100 px-3 py-2 text-center text-sm font-bold text-amber-900">
          {error}.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <GameButton tone="leaf" size="lg" className="flex-1" onClick={done} disabled={isPending || blocker !== null || issues.size > 0}>
          {isPending ? 'Importing…' : issues.size > 0 ? `Fix ${plural(issues.size, 'line', 'lines')} first` : `✅ Done: import ${plural(rows.length, 'line', 'lines')}`}
        </GameButton>
        {onBack && (
          <GameButton tone="wood" size="lg" onClick={onBack} disabled={isPending}>
            Another file
          </GameButton>
        )}
      </div>
    </div>
  )
}
