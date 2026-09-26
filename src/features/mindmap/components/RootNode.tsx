import Link from 'next/link'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { branchItemIds, isMightyRoot } from '../hooks/nodeMastery'
import type { RootNodeView } from '../types'
import { MasteryRing } from './MasteryRing'

type RootNodeProps = {
  node: RootNodeView
  // Own items' mastery, or the branch average for grouping roots (displayMastery).
  mastery: number | null
  deckSlug: string
  // Present when the root has sub-roots: the toggle on the card's bottom edge.
  collapse: { collapsed: boolean; hiddenCount: number; onToggle: () => void } | null
}

function RootNode({ node, mastery, deckSlug, collapse }: RootNodeProps) {
  const mighty = isMightyRoot(mastery)
  const branchCount = branchItemIds(node).length
  const ownCount = node.items.length

  return (
    <article
      aria-label={`${node.title}${mastery === null ? '' : `, mastery ${formatLevel(mastery)} of 3`}${mighty ? ', Mighty Root' : ''}`}
      className={cn(
        'relative flex h-full flex-col justify-between rounded-xl border-2 bg-card p-3 shadow-sm transition-colors',
        mighty ? 'border-yellow-500 bg-yellow-50 shadow-yellow-200 ring-2 ring-yellow-300/60' : 'border-amber-800/20',
      )}
    >
      <div className="flex items-start gap-2">
        <MasteryRing value={mastery} mighty={mighty} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-medium text-amber-950" title={node.title}>
            {node.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mighty ? (
              <span className="font-medium text-yellow-700">✨ Mighty Root</span>
            ) : branchCount === 0 ? (
              'No statements yet'
            ) : ownCount > 0 ? (
              `${ownCount} ${ownCount === 1 ? 'statement' : 'statements'}`
            ) : (
              `${branchCount} in branch`
            )}
          </p>
        </div>
      </div>

      {branchCount > 0 && (
        <Link
          href={`/deck/${deckSlug}/drill?nodeId=${node.id}`}
          className={cn(
            'mt-2 inline-flex h-7 items-center justify-center rounded-lg border text-xs font-medium transition-colors',
            'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            mighty
              ? 'border-yellow-500 bg-white text-yellow-800 hover:bg-yellow-100'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
          )}
        >
          Drill branch 🌿
        </Link>
      )}

      {collapse && (
        <button
          type="button"
          onClick={collapse.onToggle}
          aria-expanded={!collapse.collapsed}
          aria-label={
            collapse.collapsed
              ? `Expand ${node.title} (${collapse.hiddenCount} hidden ${collapse.hiddenCount === 1 ? 'root' : 'roots'})`
              : `Collapse ${node.title}`
          }
          className={cn(
            'absolute -bottom-3 left-1/2 z-10 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center gap-0.5 rounded-full border-2 bg-background px-1 text-[11px] font-semibold shadow-sm transition-colors',
            'hover:bg-amber-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            mighty ? 'border-yellow-500 text-yellow-800' : 'border-amber-800/30 text-amber-900',
          )}
        >
          {collapse.collapsed ? (
            <>
              <Plus className="size-3" aria-hidden />
              {collapse.hiddenCount}
            </>
          ) : (
            <Minus className="size-3" aria-hidden />
          )}
        </button>
      )}
    </article>
  )
}

const formatLevel = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1))

export { RootNode, formatLevel }
