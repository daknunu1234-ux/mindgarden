'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { GameSlab, HoverActionButton, HoverActions } from '@/shared/components/game'
import { getTreeSpecies, speciesUpgradeCost, toTreeTypeId, type TreeTypeId } from '@/shared/lib/treeSkins'
import { useToast } from '@/shared/stores/ToastProvider'
import { cn } from '@/shared/utils/cn'
import { flatBranchImpact } from '../lib/branch'
import {
  editSaves,
  expandPath,
  hiddenCount,
  isWithin,
  nestEditorNodes,
  nextOutlineSlot,
  outlineKey,
  OUTLINE_LIMITS,
  outlineParents,
  resolveOutlineSlot,
  rootSummaries,
  slotAfterEdit,
  slotTarget,
  topRootOf,
  type EditEnd,
  type OutlineKey,
  type OutlineNode,
  type OutlineSlot,
  type StatementSlot,
} from '../lib/outline'
import { nestStatements } from '../lib/statements'
import { BulkStatementImporter } from './BulkStatementImporter'
import { useDeckDraftActions } from './DeckDraft'
import { DeleteRootDialog, DeleteStatementDialog, type RootToDelete, type StatementToDelete } from './DeleteDialogs'
import { MoveStatementDialog, type StatementToMove } from './MoveStatementDialog'
import { TreeSpeciesPicker } from './TreeSpeciesPicker'
import type { DeckEditor as DeckEditorData, EditorItem } from '../types'

const DRILL_TIP =
  'Not drillable yet. Add another statement about a sibling concept in this root (e.g. "Ribosome tổng hợp protein."), or use a word the engine can flip, like tăng/giảm, trước/sau, là or is.'

// `settings`: the page's other tree switches (share, tournament), shown in the bar after the species.
type DeckEditorProps = { editor: DeckEditorData; settings?: ReactNode }

// What is being edited in place: a root's title or a statement's text.
type Editing = { kind: 'node' | 'item'; id: string } | null

// Owner-only Tree Workshop: the roots as a compact connected outline first (writing is the main job),
// then one slim settings bar (species, plus the page's share / tournament switches). A selector
// switches between top-level roots; ＋ Add root is the last chip of that row and turns into the
// new root's input. Everything is typed inline (no dialogs): hover a root for ＋📜 / ＋🌿, ✏️ or double-click to
// edit, then Enter (save + a new line right below), Shift+Enter (save, no new line), Tab (child: a
// sub-statement under a statement), Shift+Tab (up a level), Esc or clicking away (an edit saves; a new
// line closes). Hover a statement for ＋↳ (sub-statement) and 📂 (move to another root). Every change
// goes through the deck draft, so it shows at 0 ms and saves in the background. Only deletes confirm.
// Trap rules are never shown; statements get { negate: true } on the server.
function DeckEditor({ editor, settings }: DeckEditorProps) {
  return (
    <div className="space-y-3">
      <RootsOutline editor={editor} />
      <TreeSettingsBar treeType={editor.treeType}>{settings}</TreeSettingsBar>
    </div>
  )
}

// The secondary controls in one wrapping row under the outline. Changing the species switches the
// whole page (tree sprite, ribbon, mindmap roots) at once through the deck draft, and the server
// catches up in the background (rolled back with a toast).
// A pricier species (a standard tree → a surreal one) costs the difference: the bar asks first, in
// place, and only then changes it. Cheaper or equal species change at once, free.
function TreeSettingsBar({ treeType, children }: { treeType: string; children?: ReactNode }) {
  const { changeSpecies } = useDeckDraftActions()
  const current = toTreeTypeId(treeType)
  const [asking, setAsking] = useState<TreeTypeId | null>(null)
  // Still an upgrade from the species the tree has now (it may have changed while asking).
  const upgrade = asking ? speciesUpgradeCost(current, asking) : 0
  const pick = (next: TreeTypeId) => {
    if (speciesUpgradeCost(current, next) > 0) return setAsking(next)
    setAsking(null)
    changeSpecies(next)
  }
  return (
    <GameSlab role="group" aria-label="Tree settings" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-amber-950">
      {/* A retired species (e.g. 'sakura') shows as its successor, the one it renders as. */}
      <TreeSpeciesPicker compact value={current} onChange={pick} legend="Species" />
      {children}
      {asking && upgrade > 0 && (
        <p role="status" className="flex basis-full flex-wrap items-center gap-2 rounded-xl bg-amber-100/80 px-2.5 py-1.5 text-xs font-semibold">
          <span>
            Change this tree to {getTreeSpecies(asking).icon} {getTreeSpecies(asking).label} for <strong className="tabular-nums">{upgrade} 🪙</strong>?
          </span>
          <button
            type="button"
            onClick={() => {
              changeSpecies(asking)
              setAsking(null)
            }}
            className="rounded-full border-2 border-emerald-700 bg-emerald-500 px-2.5 leading-5 font-bold text-white hover:bg-emerald-600 focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none"
          >
            Pay {upgrade} 🪙
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            className="rounded-full border-2 border-amber-800/30 bg-white px-2.5 leading-5 font-bold hover:bg-amber-50 focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none"
          >
            Cancel
          </button>
        </p>
      )}
    </GameSlab>
  )
}

function RootsOutline({ editor }: { editor: DeckEditorData }) {
  const { addNode, placeStatement, renameNode, editStatement, isPending, resolveId } = useDeckDraftActions()
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rawSlot, setSlot] = useState<OutlineSlot | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [bulkFor, setBulkFor] = useState<string | null>(null)
  const [deletingStatement, setDeletingStatement] = useState<StatementToDelete | null>(null)
  const [movingStatement, setMovingStatement] = useState<StatementToMove | null>(null)
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null)
  // Collapsed roots / sub-roots: view state only (never saved, no server call). It lives here, above
  // the per-root outline, so switching root chips keeps every root's toggles.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set())

  const outline = useMemo(() => nestEditorNodes(editor.nodes), [editor.nodes])
  const roots = useMemo(() => rootSummaries(editor.nodes), [editor.nodes])
  const parents = useMemo(() => outlineParents(editor.nodes), [editor.nodes])
  const known = (id: string) => parents.has(id)

  // Ids typed on this visit move from temp to real when saved; the selection and the open input follow.
  const selected = (selectedId && outline.find((r) => r.id === resolveId(selectedId))) || outline[0] || null
  const slot = rawSlot ? resolveOutlineSlot(rawSlot, resolveId) : null
  const liveSlot = slot && (slot.kind === 'root' || known(slot.kind === 'branch' ? slot.parentId : slot.nodeId)) ? slot : null
  const editingId = editing ? (editing.kind === 'node' ? resolveId(editing.id) : editing.id) : null
  // A root collapsed while it was still saving is stored under its temp id; read it under its real one.
  const collapsed: ReadonlySet<string> = new Set([...collapsedIds].map(resolveId))
  // Stored ids are normalized to real ones on every change; an unchanged set keeps its identity, so
  // expanding an already-open path doesn't even re-render.
  const updateCollapsed = (change: (current: ReadonlySet<string>) => ReadonlySet<string>) =>
    setCollapsedIds((current) => change([...current].some((id) => resolveId(id) !== id) ? new Set([...current].map(resolveId)) : current))

  // Every way of opening an input goes through here: the node it types under (and everything above
  // it) expands first, so the new field is visible and focused straight away.
  const showSlot = (next: OutlineSlot | null) => {
    setSlot(next)
    const target = next && slotTarget(next)
    if (target) updateCollapsed((c) => expandPath(c, target, parents))
  }

  // Collapsing hides the branch, so an input or bulk importer open inside it closes with it.
  const toggleCollapsed = (nodeId: string) => {
    const id = resolveId(nodeId)
    if (collapsed.has(id)) {
      updateCollapsed((c) => {
        const next = new Set(c)
        next.delete(id)
        return next
      })
      return
    }
    updateCollapsed((c) => new Set(c).add(id))
    const target = liveSlot && slotTarget(liveSlot)
    if (target && isWithin(target, id, parents)) setSlot(null)
    if (bulkFor && isWithin(resolveId(bulkFor), id, parents)) setBulkFor(null)
  }

  const rootNode = deletingRootId ? editor.nodes.find((n) => n.id === deletingRootId) : undefined
  const impact = deletingRootId ? flatBranchImpact(editor.nodes, deletingRootId) : null
  const rootToDelete: RootToDelete | null = rootNode && impact ? { id: rootNode.id, title: rootNode.title, ...impact } : null

  // Open an input (closing any edit), keeping the selector on the root it types into.
  const open = (next: OutlineSlot | null) => {
    setEditing(null)
    showSlot(next)
    if (next && next.kind !== 'root') {
      const top = topRootOf(next.kind === 'branch' ? next.parentId : next.nodeId, parents)
      if (top) setSelectedId(top)
    }
  }

  // A statement (or sub-statement) typed in a statement line: shown at once, its temp id returned so
  // the next line can go right below it or under it.
  const saveStatement = (slot: StatementSlot, text: string): string => {
    const { id, done } = placeStatement(slot.nodeId, text, { parentId: slot.parentId, afterId: slot.afterId })
    void done.then((res) => {
      if (!res.success) toast({ message: `Could not add “${text}”: ${res.message}.`, icon: '⚠️', tone: 'farewell' })
    })
    return id
  }

  // A fast-entry key on the inline input: save what was typed, then move the input on.
  const onSlotKey = (key: OutlineKey, text: string) => {
    if (!liveSlot) return
    const typed = text.trim()
    let created: string | null = null
    if (typed) {
      if (liveSlot.kind === 'root') created = addNode(null, typed)
      else if (liveSlot.kind === 'branch') created = addNode(liveSlot.parentId, typed)
      else created = saveStatement(liveSlot, typed)
    }
    // A new top-level root that is being nested into becomes the one shown.
    if (liveSlot.kind === 'root' && created && key === 'tab') setSelectedId(created)
    const next = nextOutlineSlot(liveSlot, key, typed.length > 0, created, parents)
    showSlot(next)
  }

  // Inline edits save on every way out but ✕ (Enter, Shift+Enter, Tab, Shift+Tab, Esc, clicking
  // away). Enter then opens a new line right below the edited statement, Tab a sub-statement under it
  // (lib/outline slotAfterEdit); Tab on a root opens a statement line under it.
  const onEditKey = (end: EditEnd, text: string) => {
    if (!editing) return
    const typed = text.trim()
    const item = editing.kind === 'item' ? editor.nodes.flatMap((n) => n.items.map((i) => ({ ...i, nodeId: n.id }))).find((i) => i.id === editing.id) : undefined
    if (editSaves(end) && typed) {
      if (editing.kind === 'node') {
        const title = editor.nodes.find((n) => n.id === editingId)?.title
        if (typed !== title) renameNode(editing.id, typed)
      } else if (item && typed !== item.statement) {
        editStatement(editing.id, typed)
      }
    }
    setEditing(null)
    const next =
      editing.kind === 'node'
        ? editingId && slotAfterEdit({ kind: 'node', id: editingId }, end)
        : item && slotAfterEdit({ kind: 'item', id: item.id, nodeId: item.nodeId, parentId: item.parentId }, end)
    if (next) showSlot(next)
  }

  const branchProps: BranchProps = {
    deckId: editor.deckId,
    slot: liveSlot,
    editingId,
    bulkFor,
    isPending,
    onOpen: open,
    onSlotKey,
    onCloseSlot: () => setSlot(null),
    onEdit: (kind, id) => {
      setSlot(null)
      setEditing({ kind, id })
    },
    onEditKey,
    onBulk: (id) => {
      if (bulkFor !== id) updateCollapsed((c) => expandPath(c, resolveId(id), parents))
      setBulkFor((current) => (current === id ? null : id))
    },
    collapsed,
    onToggle: toggleCollapsed,
    onDeleteStatement: setDeletingStatement,
    onMoveStatement: setMovingStatement,
    onDeleteRoot: setDeletingRootId,
  }

  return (
    <section aria-labelledby="outline-heading" className="rounded-[20px] border-[3px] border-[#dcb98c] bg-[#fffaf0] p-3 text-amber-950 shadow-[inset_0_2px_0_#fff,0_4px_0_#c89b64] sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="outline-heading" className="font-game text-base font-extrabold">
          🌱 Roots &amp; statements
        </h3>
        <p className="hidden text-[11px] font-semibold text-amber-900/55 sm:block">▾ fold · ↵ next line · ⇧↵ save · Tab nest · ⇧Tab up · Esc done · double-click to edit</p>
      </div>

      {/* Root selector: one chip per top-level root; a new root is typed in the last chip. */}
      <nav aria-label="Top-level roots" className="mt-2">
        <ul className="flex flex-wrap gap-1.5">
          {roots.map((r) => {
            const active = selected?.id === r.id
            const pending = isPending(r.id)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  aria-current={active ? 'true' : undefined}
                  title={`${r.title}: ${r.statementCount} ${r.statementCount === 1 ? 'statement' : 'statements'}, ${r.subRootCount} ${r.subRootCount === 1 ? 'sub-root' : 'sub-roots'}`}
                  className={cn(
                    'flex h-7 max-w-52 items-center gap-1.5 rounded-full border-2 px-2.5 text-xs font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none',
                    active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-800/20 bg-white hover:bg-amber-50',
                    pending && 'border-dashed',
                  )}
                >
                  <span className="truncate">{r.title}</span>
                  <span
                    className={cn('shrink-0 rounded-full px-1.5 text-[10px] leading-4 tabular-nums', active ? 'bg-white/25' : 'bg-amber-100 text-amber-900')}
                  >
                    {r.statementCount}
                  </span>
                </button>
              </li>
            )
          })}
          {/* The row's last chip: "Add root", which turns into the input the new root is typed in. */}
          {liveSlot?.kind === 'root' ? (
            <li className="min-w-48 flex-1 sm:max-w-72">
              <InlineInput
                placeholder="New root…"
                label="New top-level root"
                maxLength={OUTLINE_LIMITS.node}
                icon="🌱"
                onKey={onSlotKey}
                onClose={() => setSlot(null)}
              />
            </li>
          ) : (
            <li>
              <button
                type="button"
                onClick={() => open({ kind: 'root' })}
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
          <OutlineBranch node={selected} top {...branchProps} />
        ) : (
          liveSlot?.kind !== 'root' && (
            <p className="py-4 text-center text-sm text-amber-900/65">No roots yet. Add the first concept this tree will grow 🌱</p>
          )
        )}
      </div>

      <DeleteStatementDialog deckId={editor.deckId} statement={deletingStatement} onClose={() => setDeletingStatement(null)} />
      <MoveStatementDialog nodes={editor.nodes} statement={movingStatement} onClose={() => setMovingStatement(null)} />
      <DeleteRootDialog deckId={editor.deckId} root={rootToDelete} onClose={() => setDeletingRootId(null)} />
    </section>
  )
}

type BranchProps = {
  deckId: string
  slot: OutlineSlot | null
  editingId: string | null
  bulkFor: string | null
  isPending: (id: string) => boolean
  onOpen: (slot: OutlineSlot) => void
  onSlotKey: (key: OutlineKey, text: string) => void
  onCloseSlot: () => void
  onEdit: (kind: 'node' | 'item', id: string) => void
  onEditKey: (end: EditEnd, text: string) => void
  onBulk: (nodeId: string) => void
  onDeleteStatement: (statement: StatementToDelete) => void
  onMoveStatement: (statement: StatementToMove) => void
  onDeleteRoot: (id: string) => void
  // Collapsed roots / sub-roots (real ids) and the ▾ / ▸ toggle.
  collapsed: ReadonlySet<string>
  onToggle: (nodeId: string) => void
}

// Connector lines: a vertical rail down the left of every child list, and an elbow into each row
// (the last child's rail stops at its elbow).
const CHILD = cn(
  'relative pl-4',
  'before:absolute before:top-0 before:left-0 before:h-full before:border-l-2 before:border-amber-800/25',
  'after:absolute after:top-3 after:left-0 after:w-3 after:border-t-2 after:border-amber-800/25',
  'last:before:h-3',
)

// One root or sub-root: its row, then its statements, the statement input, its sub-roots and the
// sub-root input, joined by connector lines. A node with children has a ▾ / ▸ toggle; collapsed, it
// hides its whole branch (rows and lines) and shows how much is tucked away.
function OutlineBranch({ node, top = false, ...props }: BranchProps & { node: OutlineNode; top?: boolean }) {
  const { slot, editingId, bulkFor, isPending, onOpen, onSlotKey, onCloseSlot, onEdit, onEditKey, onBulk, onDeleteRoot, collapsed, onToggle } = props
  const pending = isPending(node.id)
  const stmtSlot = slot?.kind === 'statement' && slot.nodeId === node.id ? slot : null
  const statementSlot = stmtSlot !== null
  const branchSlot = slot?.kind === 'branch' && slot.parentId === node.id
  const groups = nestStatements(node.items)
  // Where the statement line goes: right below a statement (and its sub-statements), among one
  // statement's sub-statements, or at the end of the list.
  const subParent = stmtSlot?.parentId && groups.some((g) => g.item.id === stmtSlot.parentId) ? stmtSlot.parentId : null
  const topAfter = stmtSlot && !stmtSlot.parentId && stmtSlot.afterId && groups.some((g) => g.item.id === stmtSlot.afterId) ? stmtSlot.afterId : null
  const slotAtEnd = statementSlot && !subParent && !topAfter
  const statementInput = (sub: boolean) => (
    <InlineInput
      placeholder={sub ? 'New sub-statement…' : 'New statement…'}
      label={sub ? 'New sub-statement' : `New statement under ${node.title}`}
      maxLength={OUTLINE_LIMITS.statement}
      icon={sub ? '↳' : undefined}
      onKey={onSlotKey}
      onClose={onCloseSlot}
    />
  )
  const canCollapse = node.items.length + node.children.length > 0
  const isCollapsed = canCollapse && collapsed.has(node.id)
  const hidden = isCollapsed ? hiddenCount(node) : null
  const hasChildren = !isCollapsed && (canCollapse || statementSlot || branchSlot || bulkFor === node.id)

  return (
    <div>
      <div className="group relative flex min-h-6 items-center gap-1 rounded-md pr-1 hover:bg-amber-100/60">
        {canCollapse ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.title}`}
            title={isCollapsed ? 'Expand' : 'Collapse'}
            className="flex size-4 shrink-0 items-center justify-center rounded text-[10px] leading-none text-amber-900/70 hover:bg-amber-200/70 hover:text-amber-950 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
          >
            <span aria-hidden>{isCollapsed ? '▸' : '▾'}</span>
          </button>
        ) : (
          <span aria-hidden className="w-4 shrink-0" />
        )}
        {editingId === node.id ? (
          <InlineInput
            initial={node.title}
            label={`Rename ${node.title}`}
            maxLength={OUTLINE_LIMITS.node}
            icon={top ? '🌱' : '🌿'}
            onKey={onEditKey}
            onClose={(text) => onEditKey('escape', text)}
            onCancel={(text) => onEditKey('cancel', text)}
            onBlurSave={(text) => onEditKey('blur', text)}
          />
        ) : (
          <>
            <span aria-hidden className="text-xs">
              {top ? '🌱' : '🌿'}
            </span>
            <span
              className={cn('min-w-0 truncate font-semibold', top ? 'font-game text-sm font-extrabold' : 'text-[13px]', pending && 'text-amber-900/60')}
              onDoubleClick={() => onEdit('node', node.id)}
              title={`${node.title} (double-click to rename)`}
            >
              {node.title}
            </span>
            {pending && (
              <span aria-label="Saving" title="Saving…" className="text-[10px]">
                ⏳
              </span>
            )}
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] leading-4 font-semibold text-amber-900 tabular-nums" title="Statements in this root">
              {node.items.length}
            </span>
            {hidden && (
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                title={`${hidden.statements} ${hidden.statements === 1 ? 'statement' : 'statements'}, ${hidden.subRoots} ${hidden.subRoots === 1 ? 'sub-root' : 'sub-roots'} hidden. Click to expand`}
                aria-label={`Expand ${node.title}: ${hidden.total} hidden ${hidden.total === 1 ? 'item' : 'items'}`}
                className="shrink-0 rounded-full border border-dashed border-amber-700/40 bg-amber-50 px-1.5 text-[10px] leading-4 font-semibold text-amber-800 tabular-nums hover:bg-amber-100 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
              >
                +{hidden.total} {hidden.total === 1 ? 'item' : 'items'}
              </button>
            )}
            <HoverActions label={`Tools for ${node.title}`} className="ml-auto shrink-0 [&_button]:h-6 [&_button]:min-w-6 [&_button]:text-[11px]">
              <HoverActionButton icon="＋📜" label={`Add a statement under ${node.title}`} onClick={() => onOpen({ kind: 'statement', nodeId: node.id })} />
              <HoverActionButton icon="＋🌿" label={`Add a sub-root under ${node.title}`} onClick={() => onOpen({ kind: 'branch', parentId: node.id })} />
              <HoverActionButton icon="✏️" label={`Rename ${node.title}`} tone="edit" onClick={() => onEdit('node', node.id)} />
              {!pending && (
                <>
                  <HoverActionButton icon="📋" label={`Bulk add statements to ${node.title} from notes`} onClick={() => onBulk(node.id)} />
                  <HoverActionButton icon="🗑️" label={`Delete ${node.title} with its sub-roots and statements`} tone="delete" onClick={() => onDeleteRoot(node.id)} />
                </>
              )}
            </HoverActions>
          </>
        )}
      </div>

      {hasChildren && (
        <ul className="ml-2">
          {groups.map(({ item, children }) => {
            const subAfter = subParent === item.id && stmtSlot?.afterId && children.some((c) => c.id === stmtSlot.afterId) ? stmtSlot.afterId : null
            return (
              <Fragment key={item.id}>
                <li className={CHILD}>
                  <StatementRow item={item} nodeId={node.id} subCount={children.length} editing={editingId === item.id} {...props} />
                  {(children.length > 0 || subParent === item.id) && (
                    <ul className="ml-2">
                      {children.map((child) => (
                        <Fragment key={child.id}>
                          <li className={CHILD}>
                            <StatementRow item={child} nodeId={node.id} subCount={0} editing={editingId === child.id} {...props} />
                          </li>
                          {subAfter === child.id && <li className={CHILD}>{statementInput(true)}</li>}
                        </Fragment>
                      ))}
                      {subParent === item.id && !subAfter && <li className={CHILD}>{statementInput(true)}</li>}
                    </ul>
                  )}
                </li>
                {topAfter === item.id && <li className={CHILD}>{statementInput(false)}</li>}
              </Fragment>
            )
          })}
          {slotAtEnd && <li className={CHILD}>{statementInput(Boolean(stmtSlot?.parentId))}</li>}
          {bulkFor === node.id && !pending && (
            <li className={CHILD}>
              <BulkStatementImporter
                deckId={props.deckId}
                rootId={node.id}
                rootTitle={node.title}
                existing={node.items.map((i) => i.statement)}
                defaultOpen
                onCancel={() => onBulk(node.id)}
                className="py-1"
              />
            </li>
          )}
          {node.children.map((child) => (
            <li key={child.id} className={CHILD}>
              <OutlineBranch node={child} {...props} />
            </li>
          ))}
          {branchSlot && (
            <li className={CHILD}>
              <InlineInput
                placeholder="New sub-root…"
                label={`New sub-root under ${node.title}`}
                maxLength={OUTLINE_LIMITS.node}
                icon="🌿"
                onKey={onSlotKey}
                onClose={onCloseSlot}
              />
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

// One statement or sub-statement (item.parentId set) of root `nodeId`; `subCount` = its sub-statements.
function StatementRow({
  item,
  nodeId,
  subCount,
  editing,
  isPending,
  onEdit,
  onEditKey,
  onOpen,
  onDeleteStatement,
  onMoveStatement,
}: BranchProps & { item: EditorItem; nodeId: string; subCount: number; editing: boolean }) {
  const pending = isPending(item.id)
  const sub = item.parentId !== null
  if (editing) {
    return (
      <InlineInput
        initial={item.statement}
        label={sub ? 'Edit sub-statement' : 'Edit statement'}
        maxLength={OUTLINE_LIMITS.statement}
        icon={sub ? '↳' : undefined}
        onKey={onEditKey}
        onClose={(text) => onEditKey('escape', text)}
        onCancel={(text) => onEditKey('cancel', text)}
        onBlurSave={(text) => onEditKey('blur', text)}
      />
    )
  }
  // Status sits at the end of the row, never before the text: ⏳ saving and 💧 not drillable always
  // show (they need attention); ✅ ready only on hover / focus (it's the normal state).
  const status = pending
    ? { icon: '⏳', label: 'Saving…', always: true }
    : item.drillable
      ? { icon: '✅', label: 'Ready to drill', always: false }
      : { icon: '💧', label: DRILL_TIP, always: true }
  return (
    <div className="group flex min-h-6 items-start gap-1.5 rounded-md py-0.5 pr-1 pl-2 hover:bg-amber-100/60">
      <span
        className={cn('min-w-0 flex-1 text-xs leading-4 whitespace-pre-wrap', pending && 'text-amber-900/60')}
        onDoubleClick={() => !pending && onEdit('item', item.id)}
      >
        {item.statement}
      </span>
      <span
        role="img"
        aria-label={pending ? 'Saving' : item.drillable ? 'Ready to drill' : 'Not drillable yet'}
        title={status.label}
        className={cn(
          'shrink-0 pt-px text-[9px] leading-4 opacity-70',
          !status.always && 'opacity-0 transition-opacity group-focus-within:opacity-70 group-hover:opacity-70',
        )}
      >
        {status.icon}
      </span>
      {/* Still saving: no edit / delete until it has its server id. */}
      {!pending && (
        <HoverActions label={sub ? 'Sub-statement tools' : 'Statement tools'} className="shrink-0 [&_button]:h-6 [&_button]:min-w-6 [&_button]:text-[11px]">
          {!sub && <HoverActionButton icon="＋↳" label="Add a sub-statement under this statement" onClick={() => onOpen({ kind: 'statement', nodeId, parentId: item.id })} />}
          <HoverActionButton icon="✏️" label={sub ? 'Edit sub-statement' : 'Edit statement'} tone="edit" onClick={() => onEdit('item', item.id)} />
          <HoverActionButton
            icon="📂"
            label={sub ? 'Move sub-statement to another root' : 'Move statement to another root'}
            onClick={() => onMoveStatement({ id: item.id, text: item.statement, nodeId, isSubStatement: sub, subStatements: subCount })}
          />
          <HoverActionButton
            icon="🗑️"
            label={sub ? 'Delete sub-statement' : 'Delete statement'}
            tone="delete"
            onClick={() => onDeleteStatement({ id: item.id, text: item.statement, subStatements: subCount })}
          />
        </HoverActions>
      )}
    </div>
  )
}

type InlineInputProps = {
  initial?: string
  placeholder?: string
  label: string
  maxLength: number
  // Roots and sub-roots (🌱 / 🌿) and sub-statements (↳); statement fields start with the text.
  icon?: string
  onKey: (key: OutlineKey, text: string) => void
  // Esc (with the text as it stands): an edit saves it, a new-item input closes. Also ✕ unless onCancel is set.
  onClose: (text: string) => void
  // ✕ on an edit: discard the change.
  onCancel?: (text: string) => void
  // Edits save when the field loses focus; new-item inputs keep their text instead.
  onBlurSave?: (text: string) => void
}

// The one inline field for adding and editing: compact, focused on arrival, IME-safe keys.
function InlineInput({ initial = '', placeholder, label, maxLength, icon, onKey, onClose, onCancel, onBlurSave }: InlineInputProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  // A key or ✕ already finished this edit: the blur that follows must not save it again.
  const finished = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    if (initial) ref.current?.select()
  }, [initial])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      finished.current = true
      onClose(value)
      return
    }
    const key = outlineKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })
    if (!key) return
    e.preventDefault()
    if (onBlurSave) finished.current = true
    onKey(key, value)
    setValue('')
  }

  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border-2 border-dashed border-emerald-500 bg-emerald-50 pr-0.5 pl-1.5 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]">
      {icon && (
        <span aria-hidden className="text-[11px]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="Enter Shift+Enter Tab Shift+Tab Escape"
        enterKeyHint="next"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (onBlurSave && !finished.current) {
            finished.current = true
            onBlurSave(value)
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-xs font-medium text-emerald-950 outline-none placeholder:text-emerald-800/50"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          finished.current = true
          const close = onCancel ?? onClose
          close(value)
        }}
        aria-label={onCancel ? 'Discard changes' : 'Close'}
        title={onCancel ? 'Discard changes' : 'Close (Esc)'}
        className="flex size-5 shrink-0 items-center justify-center rounded text-emerald-900/60 hover:bg-emerald-200 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        <X className="size-3" strokeWidth={3} />
      </button>
    </div>
  )
}

export { DeckEditor }
