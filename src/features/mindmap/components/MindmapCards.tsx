import Link from 'next/link'
import { cn } from '@/shared/utils/cn'
import { isMightyRoot } from '../hooks/nodeMastery'
import type { MindmapCard } from '../hooks/mindmapLayout'
import { MasteryRing } from './MasteryRing'

// Mindmap node cards. Category / branch pills toggle collapse; statement cards show mastery and a
// shortcut to drill their branch. Anything at 3/3 glows gold (Mighty Root).

const LEVEL_NAMES = ['Seed', 'Sprout', 'Sapling', 'Mighty Root'] as const
const GOLD_AURA = 'border-yellow-400 bg-yellow-50 shadow-[0_0_0_3px_rgba(250,204,21,0.35),0_0_22px_rgba(234,179,8,0.55)]'

const fmt = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1))

type PillProps = {
  card: MindmapCard
  mastery: number | null
  collapsed: boolean
  onToggle: () => void
  // Statements in the whole branch (shown on the inspect button).
  statementCount: number
  onInspect: () => void
  // Owners only: open the manage dialog for this root.
  onManage?: () => void
  inspected?: boolean
}

const PILL_BUTTON =
  'flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-full border text-[11px] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

// Category (level 1) and branch (deeper) pills: toggle collapse, 🔍 inspect, ✏️ manage (owners).
export function NodePill({ card, mastery, collapsed, onToggle, statementCount, onInspect, onManage, inspected = false }: PillProps) {
  const mighty = isMightyRoot(mastery)
  const category = card.kind === 'category'
  return (
    <div
      className={cn(
        'flex size-full items-center gap-2 rounded-full border-2 pr-1.5 pl-1 shadow-sm transition-[border-color,box-shadow,background-color] duration-300',
        mighty ? GOLD_AURA : category ? 'border-amber-800/40 bg-amber-50' : 'border-amber-800/25 bg-white',
        inspected && 'ring-4 ring-sky-300/70',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!card.collapsible}
        aria-expanded={card.collapsible ? !collapsed : undefined}
        aria-label={`${card.title}${mastery === null ? '' : `, mastery ${fmt(mastery)} of 3`}${mighty ? ', Mighty Root' : ''}${
          card.collapsible ? (collapsed ? `, collapsed (${card.hiddenCount} hidden)` : ', expanded') : ''
        }`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full py-0.5 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default"
      >
        <MasteryRing value={mastery} mighty={mighty} />
        <span className={cn('min-w-0 flex-1 truncate font-semibold text-amber-950', category ? 'text-sm' : 'text-xs')} title={card.title}>
          {card.title}
        </span>
        {card.collapsible && (
          <span
            aria-hidden
            className={cn(
              'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums transition-colors',
              collapsed ? 'bg-amber-700 text-amber-50' : 'bg-amber-100 text-amber-900',
            )}
          >
            {collapsed ? `+${card.hiddenCount}` : '−'}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onInspect}
        aria-label={`Inspect ${card.title}: ${statementCount} ${statementCount === 1 ? 'statement' : 'statements'}`}
        title="View details"
        className={cn(PILL_BUTTON, 'min-w-11 border-sky-300 bg-sky-50 px-1.5 text-sky-800 hover:bg-sky-100', inspected && 'bg-sky-200')}
      >
        <span aria-hidden>🔍</span>
        <span className="tabular-nums">{statementCount}</span>
      </button>
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          aria-label={`Manage ${card.title}`}
          title="Rename, add or remove"
          className={cn(PILL_BUTTON, 'w-7 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100')}
        >
          <span aria-hidden>✏️</span>
        </button>
      )}
    </div>
  )
}

type StatementProps = { card: MindmapCard; level: number; drillHref: string }

// Statement (knowledge item) card. The statement text is the drill answer, so it is never shown here.
export function StatementCard({ card, level, drillHref }: StatementProps) {
  const lvl = Math.min(3, Math.max(0, Math.round(level)))
  const mighty = lvl === 3
  return (
    <article
      aria-label={`${card.title}: ${LEVEL_NAMES[lvl]}, mastery ${lvl} of 3`}
      className={cn(
        'flex size-full flex-col justify-between rounded-xl border-2 px-3 py-2 shadow-sm transition-[border-color,box-shadow,background-color] duration-300',
        mighty ? GOLD_AURA : 'border-amber-800/15 bg-white/95',
      )}
    >
      <p className="line-clamp-2 text-xs leading-snug font-medium text-stone-800" title={card.title}>
        <span aria-hidden className="mr-1">
          📜
        </span>
        {card.title}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="flex gap-0.5" aria-hidden>
            {[1, 2, 3].map((step) => (
              <span
                key={step}
                className={cn('size-2 rounded-full', lvl >= step ? (mighty ? 'bg-yellow-500' : 'bg-emerald-500') : 'bg-stone-300')}
              />
            ))}
          </span>
          <span className={cn('tabular-nums', mighty && 'font-semibold text-yellow-700')}>
            {lvl}/3 · {LEVEL_NAMES[lvl]}
            {mighty && ' ✨'}
          </span>
        </span>
        <Link
          href={drillHref}
          aria-label={`Drill the branch of ${card.title}`}
          title="Drill this branch"
          className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          🌿 Drill
        </Link>
      </div>
    </article>
  )
}
