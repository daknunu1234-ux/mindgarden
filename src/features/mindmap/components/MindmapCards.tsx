'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { isMastered, MASTERY_NAMES, MAX_MASTERY, toMasteryLevel } from '@/shared/lib/mastery'
import { HoverActionButton, HoverActions } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { isMightyRoot } from '../hooks/nodeMastery'
import type { MindmapCard, MindmapDraftSlot } from '../hooks/mindmapLayout'
import { QUICK_ADD_LIMITS, quickAddKey, type QuickAddKey } from '../hooks/quickAdd'
import type { StatementStatus } from '../types'
import { MasteryRing } from './MasteryRing'

// Mindmap node cards, kept compact (small type, tight padding, micro-badges). Category / branch pills
// toggle collapse; top-level roots also start a round (💧 / ⚔️). Statement cards show the statement
// and its mastery: they have no practice button. Anything at 5/5 glows gold (Mighty Root). Owners
// get hover tools: ＋📜 statement, ＋🌿 sub-root, ✏️ rename in place, 🗑️ delete, ⚙️ manage.

// One pip per mastery step (1…5).
const MASTERY_STEPS = Array.from({ length: MAX_MASTERY }, (_, i) => i + 1)
const GOLD_AURA = 'border-yellow-400 bg-yellow-50 shadow-[0_0_0_2px_rgba(250,204,21,0.35),0_0_16px_rgba(234,179,8,0.5)]'

const fmt = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1))

// Inputs on the canvas: a press here selects text instead of panning the camera.
const stopPan = { onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation() }

type PillProps = {
  card: MindmapCard
  mastery: number | null
  collapsed: boolean
  onToggle: () => void
  // Statements in the whole branch (the inspect micro-badge).
  statementCount: number
  onInspect: () => void
  // Owners only (hover tools): ✏️ edit the title, 🗑️ delete the branch, ⚙️ the full manage dialog,
  // ＋ quick-add a statement / sub-root on the canvas.
  onManage?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onAddStatement?: () => void
  onAddBranch?: () => void
  // Inline rename: the title turns into an input; onRename(null) cancels.
  renaming?: boolean
  onRename?: (title: string | null) => void
  // Still saving (a root just typed): ⏳ instead of the server-backed tools.
  pending?: boolean
  // Top-level roots only: start a round on this root (the page opens the launch pop-up).
  // 'drill' = the owner waters it; 'compete' = a Mind Tournament contestant.
  onPractice?: () => void
  practiceMode?: 'drill' | 'compete'
  inspected?: boolean
}

const MICRO =
  'flex h-5 shrink-0 items-center justify-center gap-0.5 rounded-full border px-1.5 text-[10px] leading-none font-semibold tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

// Category (level 1) and branch (deeper) pills.
export function NodePill({
  card,
  mastery,
  collapsed,
  onToggle,
  statementCount,
  onInspect,
  onManage,
  onEdit,
  onDelete,
  onAddStatement,
  onAddBranch,
  renaming = false,
  onRename,
  pending = false,
  onPractice,
  practiceMode = 'drill',
  inspected = false,
}: PillProps) {
  const mighty = isMightyRoot(mastery)
  const category = card.kind === 'category'
  const hasTools = Boolean(onEdit || onDelete || onManage || onAddStatement || onAddBranch)
  return (
    <div
      className={cn(
        'group relative flex size-full items-center gap-1 rounded-full border-2 pr-1 pl-0.5 shadow-sm transition-[border-color,box-shadow,background-color] duration-300',
        mighty ? GOLD_AURA : category ? 'border-amber-800/40 bg-amber-50' : 'border-amber-800/25 bg-white',
        pending && 'border-dashed',
        inspected && 'ring-3 ring-sky-300/70',
      )}
    >
      {renaming && onRename ? (
        <>
          <MasteryRing value={mastery} mighty={mighty} className={category ? 'size-6' : 'size-5'} />
          <RenameInput title={card.title} onDone={onRename} small={!category} />
        </>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={!card.collapsible}
          aria-expanded={card.collapsible ? !collapsed : undefined}
          aria-label={`${card.title}${mastery === null ? '' : `, mastery ${fmt(mastery)} of ${MAX_MASTERY}`}${mighty ? ', Mighty Root' : ''}${
            card.collapsible ? (collapsed ? `, collapsed (${card.hiddenCount} hidden)` : ', expanded') : ''
          }${pending ? ', saving' : ''}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default"
        >
          <MasteryRing value={mastery} mighty={mighty} className={category ? 'size-6' : 'size-5'} />
          <span
            className={cn('min-w-0 flex-1 truncate font-semibold text-amber-950', category ? 'text-[13px]' : 'text-xs')}
            title={card.title}
            onDoubleClick={onEdit}
          >
            {card.title}
          </span>
          {pending && (
            <span aria-hidden title="Saving…" className="text-[10px]">
              ⏳
            </span>
          )}
          {card.collapsible && (
            <span
              aria-hidden
              className={cn(
                'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums transition-colors',
                collapsed ? 'bg-amber-700 text-amber-50' : 'bg-amber-100 text-amber-900',
              )}
            >
              {collapsed ? `+${card.hiddenCount}` : '−'}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onInspect}
        aria-label={`Inspect ${card.title}: ${statementCount} ${statementCount === 1 ? 'statement' : 'statements'}`}
        title={`${statementCount} ${statementCount === 1 ? 'statement' : 'statements'} · view details`}
        className={cn(MICRO, 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100', inspected && 'bg-sky-200')}
      >
        <span aria-hidden>📜</span>
        {statementCount}
      </button>
      {onPractice && category && statementCount > 0 && !pending && (
        <button
          type="button"
          onClick={onPractice}
          aria-label={practiceMode === 'compete' ? `Compete on the root ${card.title}` : `Drill the root ${card.title}`}
          title={practiceMode === 'compete' ? 'Compete on this root' : 'Drill this root'}
          className={cn(
            MICRO,
            'size-6 px-0 text-xs',
            practiceMode === 'compete'
              ? 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
          )}
        >
          <span aria-hidden>{practiceMode === 'compete' ? '⚔️' : '💧'}</span>
        </button>
      )}
      {/* Owner tools float over the pill's corner and appear on hover / focus (always on touch). */}
      {hasTools && !renaming && (
        <HoverActions placement="corner" label={`Tools for root ${card.title}`}>
          {onAddStatement && <HoverActionButton icon="＋📜" label={`Add a statement under ${card.title}`} onClick={onAddStatement} />}
          {onAddBranch && <HoverActionButton icon="＋🌿" label={`Add a sub-root under ${card.title}`} onClick={onAddBranch} />}
          {!pending && onEdit && <HoverActionButton icon="✏️" label={`Rename root ${card.title}`} tone="edit" onClick={onEdit} />}
          {!pending && onDelete && <HoverActionButton icon="🗑️" label={`Delete root ${card.title}`} tone="delete" onClick={onDelete} />}
          {!pending && onManage && <HoverActionButton icon="⚙️" label={`Manage ${card.title}: bulk add, statements and sub-branches`} onClick={onManage} />}
        </HoverActions>
      )}
    </div>
  )
}

// Rename in place: Enter or leaving the field saves, Esc cancels.
function RenameInput({ title, onDone, small }: { title: string; onDone: (title: string | null) => void; small: boolean }) {
  const [value, setValue] = useState(title)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    ref.current?.select()
  }, [])
  const finish = (next: string | null) => {
    if (done.current) return
    done.current = true
    const clean = next?.trim()
    onDone(clean && clean !== title ? clean : null)
  }
  return (
    <input
      ref={ref}
      value={value}
      maxLength={QUICK_ADD_LIMITS.node}
      aria-label={`Rename root ${title}`}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(null)
        }
      }}
      onBlur={() => finish(value)}
      {...stopPan}
      className={cn(
        'h-6 min-w-0 flex-1 rounded-full border border-sky-300 bg-white px-2 font-semibold text-amber-950 outline-none focus-visible:ring-3 focus-visible:ring-sky-300/60',
        small ? 'text-xs' : 'text-[13px]',
      )}
    />
  )
}

// statement = the true text (owner and visitors); "Statement n" only when it is missing. No practice
// button here: rounds start from the root (pill or inspector). onEdit / onDelete: the owner's hover
// tools (absent for everyone else). status: the owner's ⏳ saving / 💧 not drillable micro-badge.
type StatementProps = {
  card: MindmapCard
  level: number
  statement?: string
  status?: StatementStatus
  onEdit?: () => void
  onDelete?: () => void
}

const STATUS_BADGE: Record<StatementStatus, { icon: string; label: string }> = {
  saving: { icon: '⏳', label: 'Saving…' },
  'not-drillable': { icon: '💧', label: 'Not drillable yet: add a sibling statement or a word the trap engine can flip' },
}

// Statement (knowledge item) card: the statement, a 5-pip mastery meter and micro-badges.
export function StatementCard({ card, level, statement, status, onEdit, onDelete }: StatementProps) {
  const lvl = toMasteryLevel(Math.round(level))
  const mighty = isMastered(lvl)
  // card.title is the layout's fallback (the prompt, or "Statement n"); a blank text never wins over it.
  const text = statement?.trim() || card.title
  const badge = status ? STATUS_BADGE[status] : null
  return (
    <article
      aria-label={`${card.title}: ${MASTERY_NAMES[lvl]}, mastery ${lvl} of ${MAX_MASTERY}${badge ? `, ${badge.label}` : ''}`}
      className={cn(
        'group relative flex size-full flex-col justify-between rounded-lg border px-2 py-1 shadow-sm transition-[border-color,box-shadow,background-color] duration-300',
        mighty ? GOLD_AURA : 'border-amber-800/20 bg-white/95',
        status === 'saving' && 'border-dashed opacity-80',
      )}
    >
      <p className="line-clamp-2 text-[11px] leading-[1.3] font-medium text-stone-800" title={text}>
        {text}
      </p>
      <div className="flex items-center gap-1.5" title={`${lvl}/${MAX_MASTERY} · ${MASTERY_NAMES[lvl]}`}>
        <span className="flex gap-[2px]" aria-hidden>
          {MASTERY_STEPS.map((step) => (
            <span key={step} className={cn('size-1 rounded-full', lvl >= step ? (mighty ? 'bg-yellow-500' : 'bg-emerald-500') : 'bg-stone-300')} />
          ))}
        </span>
        <span aria-hidden className={cn('text-[9px] leading-none text-muted-foreground tabular-nums', mighty && 'font-semibold text-yellow-700')}>
          {lvl}/{MAX_MASTERY}
          {mighty && ' ✨'}
        </span>
        {badge && (
          <span aria-hidden title={badge.label} className="ml-auto text-[9px] leading-none">
            {badge.icon}
          </span>
        )}
      </div>
      {(onEdit || onDelete) && (
        <HoverActions placement="corner" label="Statement tools">
          {onEdit && <HoverActionButton icon="✏️" label="Edit statement" tone="edit" onClick={onEdit} />}
          {onDelete && <HoverActionButton icon="🗑️" label="Delete statement" tone="delete" onClick={onDelete} />}
        </HoverActions>
      )}
    </article>
  )
}

type QuickAddCardProps = {
  slot: MindmapDraftSlot
  placeholder: string
  label: string
  // A quick-add key with the text typed (the page commits it and moves the input); Esc / ✕ closes.
  onKey: (key: QuickAddKey, text: string) => void
  onClose: () => void
}

// The owner's fast-entry input, drawn in the place (and at the size) of the card it will become.
// It stays mounted while it moves, so focus and typing flow on from item to item.
export function QuickAddCard({ slot, placeholder, label, onKey, onClose }: QuickAddCardProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const node = slot.kind !== 'statement'
  const target = slot.kind === 'root' ? 'root' : slot.kind === 'branch' ? slot.parentId : slot.nodeId
  // Focus on open and whenever the input moves to another slot (without scrolling the page).
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [slot.kind, target])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    const key = quickAddKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })
    if (!key) return
    e.preventDefault()
    onKey(key, value)
    setValue('')
  }

  return (
    <div
      className={cn(
        'flex size-full items-center gap-1 border-2 border-dashed border-emerald-500 bg-emerald-50/95 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]',
        node ? 'rounded-full pr-1 pl-2' : 'rounded-lg px-2',
      )}
    >
      <span aria-hidden className="shrink-0 text-xs">
        {slot.kind === 'statement' ? '📜' : '🌿'}
      </span>
      <input
        ref={ref}
        value={value}
        maxLength={node ? QUICK_ADD_LIMITS.node : QUICK_ADD_LIMITS.statement}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="Enter Tab Shift+Tab Escape"
        enterKeyHint="next"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        {...stopPan}
        className={cn(
          'min-w-0 flex-1 bg-transparent font-semibold text-emerald-950 outline-none placeholder:font-medium placeholder:text-emerald-800/50',
          node ? 'text-[13px]' : 'text-[11px]',
        )}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close quick add"
        title="Done (Esc)"
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-emerald-900/60 hover:bg-emerald-200 focus-visible:ring-3 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        <X className="size-3" strokeWidth={3} />
      </button>
    </div>
  )
}

export type RootChip = { id: string; title: string; statementCount: number; mastery: number | null; pending: boolean }

// Quick navigation: every top-level root as a compact chip; tapping one glides the camera to it.
export function RootSwitcher({ roots, activeId, onJump }: { roots: RootChip[]; activeId: string | null; onJump: (id: string) => void }) {
  if (roots.length === 0) return null
  return (
    <nav aria-label="Jump to a root" className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
      <ul className="flex w-max gap-1.5">
        {roots.map((r) => {
          const mighty = isMightyRoot(r.mastery)
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onJump(r.id)}
                aria-current={activeId === r.id ? 'true' : undefined}
                title={`${r.title}: ${r.statementCount} ${r.statementCount === 1 ? 'statement' : 'statements'}`}
                className={cn(
                  'flex h-7 max-w-44 items-center gap-1.5 rounded-full border-2 bg-white/90 px-2 text-xs font-semibold text-amber-950 shadow-[0_2px_0_rgba(120,53,15,0.18)] transition-colors hover:bg-amber-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  activeId === r.id ? 'border-sky-400 bg-sky-50' : mighty ? 'border-yellow-400' : 'border-amber-800/20',
                  r.pending && 'border-dashed',
                )}
              >
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-full', mighty ? 'bg-yellow-400' : r.mastery && r.mastery > 0 ? 'bg-emerald-500' : 'bg-stone-300')}
                />
                <span className="truncate">{r.title}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-1 text-[10px] leading-4 text-amber-900 tabular-nums">{r.statementCount}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
