'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { GameButton, GameSlab, HoverActionButton, HoverActions } from '@/shared/components/game'
import { toTreeTypeId } from '@/shared/lib/treeSkins'
import { useToast } from '@/shared/stores/ToastProvider'
import { cn } from '@/shared/utils/cn'
import { flatBranchImpact } from '../lib/branch'
import {
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
  slotTarget,
  topRootOf,
  type OutlineKey,
  type OutlineNode,
  type OutlineSlot,
} from '../lib/outline'
import { BulkStatementImporter } from './BulkStatementImporter'
import { useDeckDraftActions } from './DeckDraft'
import { DeleteRootDialog, DeleteStatementDialog, type RootToDelete, type StatementToDelete } from './DeleteDialogs'
import { TreeSpeciesPicker } from './TreeSpeciesPicker'
import type { DeckEditor as DeckEditorData, EditorItem } from '../types'

const DRILL_TIP =
  'Not drillable yet. Add another statement about a sibling concept in this root (e.g. "Ribosome tổng hợp protein."), or use a word the engine can flip, like tăng/giảm, trước/sau, là or is.'

type DeckEditorProps = { editor: DeckEditorData }

// What is being edited in place: a root's title or a statement's text.
type Editing = { kind: 'node' | 'item'; id: string } | null

// Owner-only Tree Workshop: the species, then the roots as a compact connected outline. A selector
// switches between top-level roots; ＋ Add Root stays pinned at the bottom of the area while it's on
// screen. Everything is typed inline (no dialogs): hover a root for ＋📜 / ＋🌿, ✏️ or double-click to
// edit, then Enter (next sibling), Tab (child), Shift+Tab (up a level), Esc (close). Every change goes
// through the deck draft, so it shows at 0 ms and saves in the background. Only deletes confirm.
// Trap rules are never shown; statements get { negate: true } on the server.
function DeckEditor({ editor }: DeckEditorProps) {
  return (
    <div className="space-y-5">
      <SpeciesForm treeType={editor.treeType} />
      <RootsOutline editor={editor} />
    </div>
  )
}

// Change the tree species: the whole page (tree sprite, ribbon, mindmap roots) switches at once
// through the deck draft, and the server catches up in the background (rolled back with a toast).
function SpeciesForm({ treeType }: { treeType: string }) {
  const { changeSpecies } = useDeckDraftActions()
  return (
    <GameSlab className="p-4 text-amber-950">
      {/* A retired species (e.g. 'sakura') shows as its successor, the one it renders as. */}
      <TreeSpeciesPicker value={toTreeTypeId(treeType)} onChange={changeSpecies} legend="Tree species" />
    </GameSlab>
  )
}

function RootsOutline({ editor }: { editor: DeckEditorData }) {
  const { addNode, addStatement, renameNode, editStatement, isPending, resolveId } = useDeckDraftActions()
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rawSlot, setSlot] = useState<OutlineSlot | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [bulkFor, setBulkFor] = useState<string | null>(null)
  const [deletingStatement, setDeletingStatement] = useState<StatementToDelete | null>(null)
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

  const saveStatement = (nodeId: string, text: string) =>
    void addStatement(nodeId, text).then((res) => {
      if (!res.success) toast({ message: `Could not add “${text}”: ${res.message}.`, icon: '⚠️', tone: 'farewell' })
    })

  // A fast-entry key on the inline input: save what was typed, then move the input on.
  const onSlotKey = (key: OutlineKey, text: string) => {
    if (!liveSlot) return
    const typed = text.trim()
    let created: string | null = null
    if (typed) {
      if (liveSlot.kind === 'root') created = addNode(null, typed)
      else if (liveSlot.kind === 'branch') created = addNode(liveSlot.parentId, typed)
      else saveStatement(liveSlot.nodeId, typed)
    }
    // A new top-level root that is being nested into becomes the one shown.
    if (liveSlot.kind === 'root' && created && key === 'tab') setSelectedId(created)
    const next = nextOutlineSlot(liveSlot, key, typed.length > 0, created, parents)
    showSlot(next)
  }

  // Inline edits: Enter / leaving the field saves, Esc cancels; Tab on a root saves and opens a
  // statement input under it.
  const onEditKey = (key: OutlineKey | 'escape' | 'blur', text: string) => {
    if (!editing) return
    const typed = text.trim()
    if (key !== 'escape' && typed) {
      if (editing.kind === 'node') {
        const title = editor.nodes.find((n) => n.id === editingId)?.title
        if (typed !== title) renameNode(editing.id, typed)
      } else {
        const current = editor.nodes.flatMap((n) => n.items).find((i) => i.id === editing.id)?.statement
        if (typed !== current) editStatement(editing.id, typed)
      }
    }
    setEditing(null)
    if (key === 'tab' && editing.kind === 'node' && editingId) showSlot({ kind: 'statement', nodeId: editingId })
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
    onDeleteRoot: setDeletingRootId,
  }

  return (
    <section aria-labelledby="outline-heading" className="rounded-[20px] border-[3px] border-[#dcb98c] bg-[#fffaf0] p-3 text-amber-950 shadow-[inset_0_2px_0_#fff,0_4px_0_#c89b64] sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="outline-heading" className="font-game text-base font-extrabold">
          🌱 Roots &amp; statements
        </h3>
        <p className="hidden text-[11px] font-semibold text-amber-900/55 sm:block">▾ fold · ↵ next · Tab child · ⇧Tab up · Esc close · double-click to edit</p>
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
          {liveSlot?.kind === 'root' && (
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
          )}
        </ul>
      </nav>

      <div className="mt-3 min-h-16">
        {selected ? (
          <OutlineBranch node={selected} top {...branchProps} />
        ) : (
          liveSlot?.kind !== 'root' && (
            <p className="py-4 text-center text-sm text-amber-900/65">No roots yet. Add the first concept this tree will grow 🌱</p>
          )
        )}
      </div>

      {/* Pinned to the bottom of the screen while this area is in view: no scrolling back up to add a root. */}
      <div className="pointer-events-none sticky bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-10 mt-3 flex justify-end">
        <GameButton tone="leaf" size="sm" className="pointer-events-auto" onClick={() => open({ kind: 'root' })}>
          <Plus className="size-4" strokeWidth={3} /> Add Root
        </GameButton>
      </div>

      <DeleteStatementDialog deckId={editor.deckId} statement={deletingStatement} onClose={() => setDeletingStatement(null)} />
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
  onEditKey: (key: OutlineKey | 'escape' | 'blur', text: string) => void
  onBulk: (nodeId: string) => void
  onDeleteStatement: (statement: StatementToDelete) => void
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
  const statementSlot = slot?.kind === 'statement' && slot.nodeId === node.id
  const branchSlot = slot?.kind === 'branch' && slot.parentId === node.id
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
          {node.items.map((item) => (
            <li key={item.id} className={CHILD}>
              <StatementRow item={item} editing={editingId === item.id} {...props} />
            </li>
          ))}
          {statementSlot && (
            <li className={CHILD}>
              <InlineInput
                placeholder="New statement…"
                label={`New statement under ${node.title}`}
                maxLength={OUTLINE_LIMITS.statement}
                icon="📜"
                onKey={onSlotKey}
                onClose={onCloseSlot}
              />
            </li>
          )}
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

function StatementRow({ item, editing, isPending, onEdit, onEditKey, onDeleteStatement }: BranchProps & { item: EditorItem; editing: boolean }) {
  const pending = isPending(item.id)
  if (editing) {
    return (
      <InlineInput
        initial={item.statement}
        label="Edit statement"
        maxLength={OUTLINE_LIMITS.statement}
        icon="📜"
        onKey={onEditKey}
        onClose={(text) => onEditKey('escape', text)}
        onBlurSave={(text) => onEditKey('blur', text)}
      />
    )
  }
  return (
    <div className="group flex min-h-6 items-start gap-1.5 rounded-md py-0.5 pr-1 hover:bg-amber-100/60">
      <span
        aria-label={pending ? 'Saving' : item.drillable ? 'Ready to drill' : 'Not drillable yet'}
        title={pending ? 'Saving…' : item.drillable ? 'Ready to drill' : DRILL_TIP}
        className="pt-px text-[10px] leading-4"
      >
        {pending ? '⏳' : item.drillable ? '✅' : '💧'}
      </span>
      <span
        className={cn('min-w-0 flex-1 text-xs leading-4 whitespace-pre-wrap', pending && 'text-amber-900/60')}
        onDoubleClick={() => !pending && onEdit('item', item.id)}
      >
        {item.statement}
      </span>
      {/* Still saving: no edit / delete until it has its server id. */}
      {!pending && (
        <HoverActions label="Statement tools" className="shrink-0 [&_button]:h-6 [&_button]:min-w-6 [&_button]:text-[11px]">
          <HoverActionButton icon="✏️" label="Edit statement" tone="edit" onClick={() => onEdit('item', item.id)} />
          <HoverActionButton icon="🗑️" label="Delete statement" tone="delete" onClick={() => onDeleteStatement({ id: item.id, text: item.statement })} />
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
  icon: string
  onKey: (key: OutlineKey, text: string) => void
  // Esc or ✕ (with the text as it stands).
  onClose: (text: string) => void
  // Edits save when the field loses focus; new-item inputs keep their text instead.
  onBlurSave?: (text: string) => void
}

// The one inline field for adding and editing: compact, focused on arrival, IME-safe keys.
function InlineInput({ initial = '', placeholder, label, maxLength, icon, onKey, onClose, onBlurSave }: InlineInputProps) {
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
      <span aria-hidden className="text-[11px]">
        {icon}
      </span>
      <input
        ref={ref}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="Enter Tab Shift+Tab Escape"
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
          onClose(value)
        }}
        aria-label="Close"
        title="Close (Esc)"
        className="flex size-5 shrink-0 items-center justify-center rounded text-emerald-900/60 hover:bg-emerald-200 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        <X className="size-3" strokeWidth={3} />
      </button>
    </div>
  )
}

export { DeckEditor }
