'use client'

import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { HoverActionButton, HoverActions } from '@/shared/components/game'
import { useToast } from '@/shared/stores/ToastProvider'
import { cn } from '@/shared/utils/cn'
import { branchCounts, branchEnd, indentRow, indentSlot, insertIndex, toggleRow, toggleSlot, type ContentSlot } from '../lib/contentTree'
import { isDrillable } from '../lib/drillable'
import { editSaves, OUTLINE_LIMITS, type EditEnd, type OutlineKey } from '../lib/outline'
import { treeGuides, type TreeGuide } from '../lib/treeGuides'
import { BulkStatementImporter } from './BulkStatementImporter'
import { useDeckDraftActions } from './DeckDraft'
import { DeleteNodeDialog, type NodeToDelete } from './DeleteDialogs'
import { InlineInput } from './InlineInput'
import { MoveStatementDialog, type StatementToMove } from './MoveStatementDialog'
import { ShortcutPanel } from './ShortcutPanel'
import type { ContentRow, DeckEditor } from '../types'

const DRILL_TIP =
  'Not drillable yet. Add another statement about a sibling concept (e.g. "Ribosome tổng hợp protein."), or use a word the engine can flip, like tăng/giảm, trước/sau, là or is.'
// Horizontal step per level (px).
const STEP = 18

// The Tree Workshop's outline: the tree's content nodes (roots and statements, any under any) as ONE
// multi-level list, in outline order, one top-level root at a time (the chips). A row's position never
// changes when its level or type does:
//   Enter        save, then a new line right below at the same level, of the same type
//   Shift+Enter  save and close · Esc / clicking away: save and close · ✕ discard
//   Tab          indent: the row becomes the last child of the row above at its level
//   Shift+Tab    outdent: up a level right below its old parent (the rows below it become its children)
//   Alt          root ↔ statement in place (a top-level root stays a root)
//   Ctrl+Enter   save, then bulk-add statements (under a root row; beside a statement row)
// The same keys work on a new, unsaved line (it moves or switches type; nothing is saved until Enter).
// Every change goes through the deck draft (lib/contentTree.ts, the database's own rules): 0 ms on
// screen, saved in the background. Only deletes confirm.
// `start`: the tree was just bought and placed: open on a new top-level root line, focused.
// `issues`: row id → why it can't be saved (the document import's staging editor): an amber ⚠️ on
// the row and on its root's chip.
export function ContentOutline({ editor, start = false, issues }: { editor: DeckEditor; start?: boolean; issues?: ReadonlyMap<string, string> }) {
  const headingId = useId()
  const { addNode, editNode, indentNode, toggleType, isPending, resolveId } = useDeckDraftActions()
  const { toast } = useToast()
  const rows = editor.rows
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rawSlot, setRawSlot] = useState<ContentSlot | null>(() =>
    start ? { parentId: null, afterId: editor.rows.filter((r) => r.depth === 0).at(-1)?.id ?? null, type: 'root' } : null,
  )
  // Text carried into a line that moved (Tab / Shift+Tab) or switched type (Alt).
  const [slotDraft, setSlotDraft] = useState('')
  // Caret for a field that remounted while being typed in.
  const [caret, setCaret] = useState<number | null>(null)
  const [rawEditing, setRawEditing] = useState<string | null>(null)
  const [editSelect, setEditSelect] = useState(true)
  // The edit field's text as typed (a remounted row picks it up instead of the saved text).
  const [editDraft, setEditDraft] = useState<string | null>(null)
  const [bulkFor, setBulkFor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<NodeToDelete | null>(null)
  const [moving, setMoving] = useState<{ statement: StatementToMove; excluded: ReadonlySet<string> } | null>(null)
  // Collapsed nodes: view state only (never saved).
  const [rawCollapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  // A blur right after Tab / Shift+Tab / Alt (the old field leaving) must not end the edit.
  const movedJustNow = useRef(false)

  const index = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])
  const byId = (id: string | null | undefined) => (id ? rows[index.get(id) ?? -1] : undefined)
  const collapsed = new Set([...rawCollapsed].map(resolveId))
  const editingId = rawEditing ? resolveId(rawEditing) : null
  const slot: ContentSlot | null = rawSlot && {
    ...rawSlot,
    parentId: rawSlot.parentId && resolveId(rawSlot.parentId),
    afterId: rawSlot.afterId && resolveId(rawSlot.afterId),
  }
  const liveSlot = slot && (slot.parentId === null || index.has(slot.parentId)) ? slot : null

  const tops = rows.filter((r) => r.depth === 0)
  const selected = tops.find((r) => selectedId && r.id === resolveId(selectedId)) ?? tops[0] ?? null
  const topOf = (id: string): string | null => {
    let at = byId(id)
    while (at && at.parentId) at = byId(at.parentId)
    return at?.id ?? null
  }

  // Opening something under a node: it and every node above it unfold, and its chip is shown.
  const reveal = (id: string | null) => {
    if (!id) return
    setCollapsed((c) => {
      const next = new Set([...c].map(resolveId))
      for (let at = byId(id); at; at = byId(at.parentId)) next.delete(at.id)
      return next.size === c.size ? c : next
    })
    const top = topOf(id)
    if (top) setSelectedId(top)
  }
  const keepEditing = (text: string, at?: number) => {
    setEditDraft(text)
    setEditSelect(false)
    setCaret(at ?? null)
    movedJustNow.current = true
    setTimeout(() => {
      movedJustNow.current = false
    }, 0)
  }
  const startEditing = (id: string) => {
    setRawSlot(null)
    setRawEditing(id)
    setEditSelect(true)
    setEditDraft(null)
    setCaret(null)
  }
  const showSlot = (next: ContentSlot | null, draft = '', at: number | null = null) => {
    setRawEditing(null)
    setRawSlot(next)
    setSlotDraft(draft)
    setCaret(at)
    if (next) reveal(next.parentId)
  }
  const openBulk = (id: string | null) => {
    if (!id) return toast({ message: 'Bulk statements go under a root: add the root first', icon: '💡', tone: 'amber' })
    reveal(id)
    setBulkFor(id)
  }
  const hint = (message: string) => toast({ message, icon: '💡', tone: 'amber' })

  const save = (node: { parentId: string | null; afterId: string | null; type: ContentRow['type'] }, text: string) => {
    const { id, done } = addNode({ ...node, content: text })
    void done.then((res) => {
      if (!res.success) toast({ message: `Could not add “${text}”: ${res.message}.`, icon: '⚠️', tone: 'farewell' })
    })
    return id
  }

  // A key on a new line. Only Enter / Shift+Enter save; Tab / Shift+Tab / Alt move or switch the line
  // itself, keeping its text ('keep').
  const onSlotKey = (key: OutlineKey, text: string, at?: number): 'keep' | void => {
    if (!liveSlot) return
    if (key === 'tab' || key === 'shift-tab') {
      const next = indentSlot(rows, liveSlot, key === 'tab' ? 'in' : 'out')
      if (next) showSlot(next, text, at ?? null)
      return 'keep'
    }
    const typed = text.trim()
    if (!typed) return showSlot(null)
    const id = save(liveSlot, typed)
    showSlot(key === 'enter' ? { ...liveSlot, afterId: id } : null)
  }
  const onSlotCommand = (command: 'toggle' | 'bulk', text: string): boolean => {
    if (!liveSlot) return false
    if (command === 'toggle') {
      const next = toggleSlot(liveSlot)
      if (!next) {
        hint('A top-level line is a root')
        return false
      }
      showSlot(next, text)
      return true
    }
    if (text.trim()) save(liveSlot, text.trim())
    showSlot(null)
    openBulk(liveSlot.parentId)
    return true
  }

  // A key on a row being edited. Enter: save, then a new line right below at the same level and of
  // the same type. Tab / Shift+Tab: the row changes level in place and stays in edit.
  const onEditKey = (end: EditEnd, text: string, at?: number): 'keep' | void => {
    const row = byId(editingId)
    if (!row) return setRawEditing(null)
    if (end === 'tab' || end === 'shift-tab') {
      const dir = end === 'tab' ? 'in' : 'out'
      const next = indentRow(rows, row.id, dir)
      if (typeof next === 'string') {
        hint(next)
        return 'keep'
      }
      const typed = text.trim()
      if (typed && typed !== row.content) editNode(row.id, typed)
      indentNode(row.id, dir)
      reveal(next.find((r) => r.id === row.id)?.parentId ?? row.id)
      keepEditing(text, at)
      return 'keep'
    }
    if (end === 'blur' && movedJustNow.current) return 'keep'
    const typed = text.trim()
    if (editSaves(end) && typed && typed !== row.content) editNode(row.id, typed)
    setRawEditing(null)
    if (end === 'enter') showSlot({ parentId: row.parentId, afterId: row.id, type: row.type })
  }
  const onEditCommand = (command: 'toggle' | 'bulk', text: string): boolean => {
    const row = byId(editingId)
    if (!row) return false
    const typed = text.trim()
    if (command === 'toggle') {
      const next = toggleRow(rows, row.id)
      if (typeof next === 'string') {
        hint(next)
        return false
      }
      if (typed && typed !== row.content) editNode(row.id, typed)
      toggleType(row.id)
      // The row stays where it is, still being edited: only its icon changes.
      keepEditing(text)
      return false
    }
    if (typed && typed !== row.content) editNode(row.id, typed)
    setRawEditing(null)
    openBulk(row.type === 'root' ? row.id : row.parentId)
    return true
  }

  const toggleFromTool = (row: ContentRow) => {
    const next = toggleRow(rows, row.id)
    if (typeof next === 'string') return hint(next)
    toggleType(row.id)
  }
  const moveFromTool = (row: ContentRow) => {
    const parent = byId(row.parentId)
    const end = branchEnd(rows, index.get(row.id)!)
    const excluded = new Set(rows.slice(index.get(row.id)!, end).map((r) => r.id))
    setMoving({
      statement: { id: row.id, text: row.content, nodeId: row.parentId ?? '', isSubStatement: parent?.type === 'statement', subStatements: branchCounts(rows, row.id).statements },
      excluded,
    })
  }

  // What a row's own controls do, by row id. One stable object for every row (it reads the latest
  // state through a ref), so rows are memoized: typing in one row, or opening a line, never re-renders
  // the others.
  const toggleCollapse = (id: string) =>
    setCollapsed((c) => {
      const next = new Set([...c].map(resolveId))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const handlers = {
    toggleCollapse,
    edit: (id: string) => startEditing(id),
    addChild: (id: string, type: ContentRow['type']) => showSlot({ parentId: id, afterId: null, type }),
    bulk: (id: string) => (bulkFor === id ? setBulkFor(null) : openBulk(id)),
    toggleType: (id: string) => {
      const row = byId(id)
      if (row) toggleFromTool(row)
    },
    move: (id: string) => {
      const row = byId(id)
      if (row) moveFromTool(row)
    },
    remove: (id: string) => {
      const row = byId(id)
      if (row) setDeleting({ id: row.id, text: row.content, type: row.type, ...branchCounts(rows, row.id) })
    },
  }
  const latestHandlers = useRef(handlers)
  useLayoutEffect(() => {
    latestHandlers.current = handlers
  })
  const rowActions = useMemo<RowActions>(
    () => ({
      toggleCollapse: (id) => latestHandlers.current.toggleCollapse(id),
      edit: (id) => latestHandlers.current.edit(id),
      addChild: (id, type) => latestHandlers.current.addChild(id, type),
      bulk: (id) => latestHandlers.current.bulk(id),
      toggleType: (id) => latestHandlers.current.toggleType(id),
      move: (id) => latestHandlers.current.move(id),
      remove: (id) => latestHandlers.current.remove(id),
    }),
    [],
  )

  // The selected top-level root's rows, minus what collapsed nodes hide, with the new line and the
  // bulk importer placed where they go. Collected first, so each line's connectors can be worked out
  // from the lines around it (treeGuides).
  const lines: OutlineEntry[] = []
  if (selected) {
    const start = index.get(selected.id)!
    const end = branchEnd(rows, start)
    const slotAt = liveSlot && liveSlot.parentId !== null && topOf(liveSlot.parentId) === selected.id ? insertIndex(rows, liveSlot.parentId, liveSlot.afterId) : -1
    const bulkAt = bulkFor && index.has(bulkFor) && topOf(bulkFor) === selected.id ? branchEnd(rows, index.get(bulkFor)!) : -1
    let hideBelow = Infinity
    for (let i = start; i <= end; i++) {
      if (i === slotAt && liveSlot) {
        const parent = byId(liveSlot.parentId)!
        lines.push({
          key: 'slot',
          level: parent.depth + 1 - selected.depth,
          node: (
            <InlineInput
              placeholder={liveSlot.type === 'root' ? 'New sub-root…' : 'New statement…'}
              label={liveSlot.type === 'root' ? `New sub-root under ${parent.content}` : `New statement under ${parent.content}`}
              maxLength={liveSlot.type === 'root' ? OUTLINE_LIMITS.node : OUTLINE_LIMITS.statement}
              icon={liveSlot.type === 'root' ? '🌿' : '•'}
              initial={slotDraft}
              selectInitial={false}
              caret={caret}
              onKey={onSlotKey}
              onCommand={onSlotCommand}
              onClose={() => showSlot(null)}
            />
          ),
        })
      }
      if (i === bulkAt && bulkFor) {
        const target = byId(bulkFor)!
        lines.push({
          key: 'bulk',
          level: target.depth + 1 - selected.depth,
          anchor: 'top',
          node: (
            <BulkStatementImporter
              deckId={editor.deckId}
              rootId={target.id}
              rootTitle={target.content}
              existing={rows.filter((r) => r.parentId === target.id && r.type === 'statement').map((r) => r.content)}
              defaultOpen
              onCancel={() => setBulkFor(null)}
              className="py-1"
            />
          ),
        })
      }
      if (i === end) break
      const row = rows[i]
      if (row.depth > hideBelow) continue
      hideBelow = Infinity
      const hasChildren = i + 1 < rows.length && rows[i + 1].depth > row.depth
      const isCollapsed = hasChildren && collapsed.has(row.id)
      if (isCollapsed) hideBelow = row.depth
      const editing = editingId === row.id
      const hidden = isCollapsed ? branchCounts(rows, row.id) : null
      lines.push({
        key: row.id,
        level: row.depth - selected.depth,
        row: {
          row,
          top: row.depth === 0,
          pending: isPending(row.id),
          issue: issues?.get(row.id) ?? null,
          hasChildren,
          collapsed: isCollapsed,
          hiddenCount: hidden ? hidden.statements + hidden.roots : null,
          // Only the row being edited gets its field (every other row stays memoized).
          editor: editing ? (
              <InlineInput
                initial={editDraft ?? row.content}
                selectInitial={editSelect && editDraft === null}
                caret={caret}
                label={row.type === 'root' ? `Rename ${row.content}` : 'Edit statement'}
                maxLength={row.type === 'root' ? 500 : OUTLINE_LIMITS.statement}
                icon={row.type === 'root' ? (row.depth === 0 ? '🌱' : '🌿') : '•'}
                onKey={onEditKey}
                onCommand={onEditCommand}
                onTextChange={setEditDraft}
                onClose={(text) => onEditKey('escape', text)}
                onCancel={(text) => onEditKey('cancel', text)}
                onBlurSave={(text) => onEditKey('blur', text)}
              />
          ) : null,
        },
      })
    }
  }
  // Connectors depend only on the visible levels: recomputed when the shape changes (a row added,
  // moved, collapsed, a line opened), never on a keystroke. Same levels → the same guide objects, so
  // the memoized rows don't re-render.
  const levelsKey = lines.map((l) => l.level).join(',')
  const guides = useMemo(() => treeGuides(levelsKey ? levelsKey.split(',').map(Number) : []), [levelsKey])
  const body = lines.map((l, i) =>
    l.row ? (
      <OutlineRowLine key={l.key} level={l.level} guide={guides[i]} actions={rowActions} {...l.row} />
    ) : (
      <OutlineLine key={l.key} level={l.level} guide={guides[i]} anchor={l.anchor}>
        {l.node}
      </OutlineLine>
    ),
  )

  // Statement counts on the root chips: once per outline change, not per render.
  const chipCounts = useMemo(() => new Map(rows.filter((r) => r.depth === 0).map((r) => [r.id, branchCounts(rows, r.id).statements])), [rows])
  const statementsUnder = (id: string) => chipCounts.get(id) ?? 0
  // Rows with an issue under each top-level root (only when issues are given).
  const chipIssues = useMemo(() => {
    const counts = new Map<string, number>()
    if (!issues || issues.size === 0) return counts
    let top: string | null = null
    for (const r of rows) {
      if (r.depth === 0) top = r.id
      if (top && issues.has(r.id)) counts.set(top, (counts.get(top) ?? 0) + 1)
    }
    return counts
  }, [rows, issues])
  const lastTop = tops.at(-1)?.id ?? null

  return (
    <section aria-labelledby={headingId} className="rounded-[20px] border-[3px] border-[#dcb98c] bg-[#fffaf0] p-3 text-amber-950 shadow-[inset_0_2px_0_#fff,0_4px_0_#c89b64] sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="font-game text-base font-extrabold">
          🌱 Roots &amp; statements
        </h3>
      </div>

      <div className="mt-2 flex flex-col items-start gap-4 lg:flex-row lg:gap-6">
        <div className="w-full min-w-0 flex-1">
          {/* Root selector: one chip per top-level root; a new top-level root is typed in the last chip. */}
          <nav aria-label="Top-level roots">
            <ul className="flex flex-wrap gap-1.5">
              {tops.map((r) => {
                const active = selected?.id === r.id
                const count = statementsUnder(r.id)
                const flagged = chipIssues.get(r.id) ?? 0
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      aria-current={active ? 'true' : undefined}
                      title={`${r.content}: ${count} ${count === 1 ? 'statement' : 'statements'}${flagged ? `, ${flagged} to fix` : ''}`}
                      className={cn(
                        'flex h-7 max-w-52 items-center gap-1.5 rounded-full border-2 px-2.5 text-xs font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none',
                        active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-800/20 bg-white hover:bg-amber-50',
                        isPending(r.id) && 'border-dashed',
                      )}
                    >
                      {flagged > 0 && (
                        <span role="img" aria-label={`${flagged} to fix`} className="shrink-0 text-[10px]">
                          ⚠️
                        </span>
                      )}
                      <span className="truncate">{r.content}</span>
                      <span className={cn('shrink-0 rounded-full px-1.5 text-[10px] leading-4 tabular-nums', active ? 'bg-white/25' : 'bg-amber-100 text-amber-900')}>{count}</span>
                    </button>
                  </li>
                )
              })}
              {liveSlot && liveSlot.parentId === null ? (
                <li className="min-w-48 flex-1 sm:max-w-72">
                  <InlineInput
                    placeholder="New root…"
                    label="New top-level root"
                    maxLength={OUTLINE_LIMITS.node}
                    icon="🌱"
                    initial={slotDraft}
                    selectInitial={false}
                    caret={caret}
                    onKey={onSlotKey}
                    onCommand={onSlotCommand}
                    onClose={() => showSlot(null)}
                  />
                </li>
              ) : (
                <li>
                  <button
                    type="button"
                    onClick={() => showSlot({ parentId: null, afterId: lastTop, type: 'root' })}
                    className="flex h-7 items-center gap-1 rounded-full border-2 border-dashed border-emerald-600/60 px-2.5 text-xs font-semibold text-emerald-800 transition-colors hover:border-emerald-600 hover:bg-emerald-50 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
                  >
                    <Plus aria-hidden className="size-3.5" strokeWidth={3} /> Add root
                  </button>
                </li>
              )}
            </ul>
          </nav>

          <div className="mt-3 min-h-32">
            {selected ? (
              <ul aria-label={`Outline of ${selected.content}`}>{body}</ul>
            ) : (
              <p className="py-4 text-center text-sm text-amber-900/65">No roots yet. Add the first concept this tree will grow 🌱</p>
            )}
          </div>
        </div>
        <ShortcutPanel />
      </div>

      <DeleteNodeDialog node={deleting} onClose={() => setDeleting(null)} />
      <MoveStatementDialog nodes={editor.nodes} statement={moving?.statement ?? null} excluded={moving?.excluded} onClose={() => setMoving(null)} />
    </section>
  )
}

// One line of the outline: a node's row (memoized), or the new line / the bulk importer.
type OutlineEntry = { key: string; level: number; node?: ReactNode; anchor?: 'center' | 'top'; row?: RowState }

// What a row shows. Compared field by field (rowEqual), so a row re-renders only when it changes.
type RowState = {
  row: ContentRow
  top: boolean
  pending: boolean
  // Why the row can't be saved as it stands (the import's staging editor), or null.
  issue: string | null
  hasChildren: boolean
  collapsed: boolean
  hiddenCount: number | null
  // The edit field, only on the row being edited.
  editor: ReactNode
}

// A row's controls, by row id (one stable object for the whole outline).
type RowActions = {
  toggleCollapse: (id: string) => void
  edit: (id: string) => void
  addChild: (id: string, type: ContentRow['type']) => void
  bulk: (id: string) => void
  toggleType: (id: string) => void
  move: (id: string) => void
  remove: (id: string) => void
}

type RowLineProps = RowState & { level: number; guide: TreeGuide; actions: RowActions }

const sameRow = (a: ContentRow, b: ContentRow) => a === b || (a.id === b.id && a.content === b.content && a.type === b.type && a.depth === b.depth && a.parentId === b.parentId)

// Whether a row line can skip re-rendering: same row data, level, connectors and state. The row being
// edited always re-renders (its field is a new element each time).
export function rowEqual(a: RowLineProps, b: RowLineProps): boolean {
  return (
    sameRow(a.row, b.row) &&
    a.level === b.level &&
    a.guide === b.guide &&
    a.top === b.top &&
    a.pending === b.pending &&
    a.issue === b.issue &&
    a.hasChildren === b.hasChildren &&
    a.collapsed === b.collapsed &&
    a.hiddenCount === b.hiddenCount &&
    a.editor === null &&
    b.editor === null &&
    a.actions === b.actions
  )
}

// A node's whole line (connectors + row), memoized.
const OutlineRowLine = memo(function OutlineRowLine({ level, guide, ...rest }: RowLineProps) {
  return (
    // A row without children has an empty spacer where ▾ would be: the elbow runs through it to the bullet.
    <OutlineLine level={level} guide={guide} reach={rest.hasChildren ? 0 : LEAF_REACH}>
      <OutlineRow {...rest} />
    </OutlineLine>
  )
}, rowEqual)

// Connector lines: thin wood-toned strokes. Column k is centred under the bullet of the level-k
// node (its ▾ toggle / spacer, 16 px wide, starts at k * STEP).
const GUIDE = 'pointer-events-none absolute border-amber-300/70 dark:border-stone-600/40'
const GUIDE_X = 7
// How far past the line's left edge an elbow reaches on a leaf row (up to its bullet).
const LEAF_REACH = 14
// Where a line's elbow meets it: the middle of the row (the bullet is centred on wrapped text too),
// or near the top for a tall block (the bulk importer).
const ANCHOR = { center: '50%', top: '14px' } as const

// One line of the outline at its level, with its tree connectors: │ through-lines for ancestors that
// continue below, ├ / └ into its bullet, and a stem down from its own bullet when its children are
// shown. Every vertical runs the full row height, so wrapped rows leave no gaps.
function OutlineLine({
  level,
  guide,
  anchor = 'center',
  reach = 0,
  children,
}: {
  level: number
  guide: TreeGuide
  anchor?: 'center' | 'top'
  reach?: number
  children: ReactNode
}) {
  const y = ANCHOR[anchor]
  const elbowX = (level - 1) * STEP + GUIDE_X
  return (
    <li className="relative" style={{ paddingLeft: level * STEP }}>
      {guide.through.map((on, k) =>
        on ? <span key={k} aria-hidden className={cn(GUIDE, 'inset-y-0 border-l-[1.5px]')} style={{ left: k * STEP + GUIDE_X }} /> : null,
      )}
      {guide.elbow === 'tee' && <span aria-hidden className={cn(GUIDE, 'inset-y-0 border-l-[1.5px]')} style={{ left: elbowX }} />}
      {guide.elbow && (
        <span
          aria-hidden
          className={cn(GUIDE, 'top-0 border-b-[1.5px]', guide.elbow === 'last' && 'rounded-bl-md border-l-[1.5px]')}
          style={{ left: elbowX, width: STEP - GUIDE_X + 2 + reach, height: y }}
        />
      )}
      {guide.stem && <span aria-hidden className={cn(GUIDE, 'bottom-0 border-l-[1.5px]')} style={{ left: level * STEP + GUIDE_X, top: `calc(${y} + 8px)` }} />}
      {children}
    </li>
  )
}

// One node: ▾ / ▸ when it has children, its icon (🌱 a top-level root, 🌿 a root, • a statement), its
// text (double-click to edit), a status badge for statements, and the owner's hover tools.
function OutlineRow({ row, top, pending, issue, hasChildren, collapsed, hiddenCount, editor, actions }: RowState & { actions: RowActions }) {
  const editing = editor !== null
  const onToggleCollapse = () => actions.toggleCollapse(row.id)
  const onEdit = () => actions.edit(row.id)
  const isRoot = row.type === 'root'
  const drillable = !isRoot && isDrillable(row.content)
  const status = isRoot ? null : pending ? { icon: '⏳', label: 'Saving…', always: true } : drillable ? { icon: '✅', label: 'Ready to drill', always: false } : { icon: '💧', label: DRILL_TIP, always: true }
  return (
    <div className="group flex min-h-6 items-center gap-1 rounded-md pr-1 hover:bg-amber-100/60">
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${row.content}`}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="flex size-4 shrink-0 items-center justify-center rounded text-[10px] leading-none text-amber-900/70 hover:bg-amber-200/70 hover:text-amber-950 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
        >
          <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
        </button>
      ) : (
        <span aria-hidden className="w-4 shrink-0" />
      )}
      {editing ? (
        editor
      ) : (
        <>
          <span aria-hidden className={cn('shrink-0', isRoot ? 'text-xs' : 'w-2 text-center text-[10px] text-amber-800/60')}>
            {isRoot ? (top ? '🌱' : '🌿') : '•'}
          </span>
          <span
            className={cn(
              'min-w-0 whitespace-pre-wrap',
              isRoot ? (top ? 'font-game text-sm font-extrabold' : 'text-[13px] font-semibold') : 'flex-1 text-xs leading-4',
              pending && 'text-amber-900/60',
              issue && 'text-amber-800 underline decoration-orange-400 decoration-wavy underline-offset-2',
            )}
            onDoubleClick={() => !pending && onEdit()}
            title={pending ? undefined : 'Double-click to edit'}
          >
            {row.content}
          </span>
          {hiddenCount !== null && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={`Expand ${row.content}: ${hiddenCount} hidden`}
              className="shrink-0 rounded-full border border-dashed border-amber-700/40 bg-amber-50 px-1.5 text-[10px] leading-4 font-semibold text-amber-800 tabular-nums hover:bg-amber-100 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
            >
              +{hiddenCount} {hiddenCount === 1 ? 'item' : 'items'}
            </button>
          )}
          {issue && (
            <span role="img" aria-label={issue} title={issue} className="shrink-0 text-[10px] leading-4">
              ⚠️
            </span>
          )}
          {status && (
            <span
              role="img"
              aria-label={pending ? 'Saving' : drillable ? 'Ready to drill' : 'Not drillable yet'}
              title={status.label}
              className={cn('shrink-0 text-[9px] leading-4 opacity-70', !status.always && 'opacity-0 transition-opacity group-focus-within:opacity-70 group-hover:opacity-70')}
            >
              {status.icon}
            </span>
          )}
          {!pending && (
            <HoverActions label={`Tools for ${row.content}`} className="ml-auto shrink-0 [&_button]:h-6 [&_button]:min-w-6 [&_button]:text-[11px]">
              <HoverActionButton icon={isRoot ? '＋📜' : '＋↳'} label={`Add a statement under ${row.content}`} onClick={() => actions.addChild(row.id, 'statement')} />
              {isRoot && <HoverActionButton icon="＋🌿" label={`Add a sub-root under ${row.content}`} onClick={() => actions.addChild(row.id, 'root')} />}
              <HoverActionButton icon="✏️" label={`Edit ${row.content}`} tone="edit" onClick={onEdit} />
              {isRoot && <HoverActionButton icon="📋" label={`Bulk add statements under ${row.content}`} onClick={() => actions.bulk(row.id)} />}
              <HoverActionButton
                icon="⇄"
                label={top ? 'A top-level root stays a root' : isRoot ? 'Make it a statement (Alt)' : 'Make it a root (Alt)'}
                disabled={top}
                onClick={() => actions.toggleType(row.id)}
              />
              {!top && <HoverActionButton icon="📂" label={`Move ${row.content} to another root`} onClick={() => actions.move(row.id)} />}
              <HoverActionButton icon="🗑️" label={`Delete ${row.content}`} tone="delete" onClick={() => actions.remove(row.id)} />
            </HoverActions>
          )}
        </>
      )}
    </div>
  )
}
