import Link from 'next/link'
import { cn } from '@/shared/utils/cn'
import { useTreeStage } from '../hooks/useTreeStage'
import type { DeckCardView } from '../types'
import { GrowthBar } from './GrowthBar'
import { TreeStageSvg } from './TreeStageSvg'

type TreeCardProps = { deck: DeckCardView }

// A raised garden plot card: sky-and-meadow window with the tree, a parchment body, bouncy lift.
function TreeCard({ deck }: TreeCardProps) {
  const { stage, name, emoji } = useTreeStage(deck.masteryPercent)
  const golden = stage === 5

  return (
    <Link
      href={`/deck/${deck.slug}`}
      className={cn(
        'group flex h-full flex-col rounded-[24px] border-[3px] p-2 transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-1.5 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:translate-y-0.5',
        golden
          ? 'border-yellow-500 bg-gradient-to-b from-yellow-50 to-amber-100 shadow-[0_6px_0_#ca8a04,0_0_24px_rgba(250,204,21,0.4)]'
          : 'border-amber-800/30 bg-gradient-to-b from-[#fffaf0] to-[#fbefd5] shadow-[0_6px_0_rgba(146,64,14,0.28),0_12px_24px_rgba(120,53,15,0.12)]',
      )}
    >
      <div className="relative flex h-32 items-end justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 via-sky-100 to-lime-100 shadow-[inset_0_3px_6px_rgba(0,0,0,0.12)]">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-6 rounded-t-[50%] bg-gradient-to-b from-lime-300 to-emerald-400" />
        <TreeStageSvg
          stage={stage}
          treeType={deck.treeType}
          label={`${name} tree`}
          className="relative size-28 transition-transform duration-300 group-hover:scale-110"
        />
        <span
          className={cn(
            'absolute top-2 left-2 rounded-full border-2 px-2 py-0.5 font-game text-xs font-bold shadow-[0_2px_0_rgba(0,0,0,0.15)]',
            golden ? 'border-amber-600 bg-yellow-200 text-amber-900' : 'border-emerald-700/40 bg-white/90 text-emerald-900',
          )}
        >
          {emoji} {name}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-2 pt-3 pb-1">
        <h3 className="font-game text-lg leading-tight font-bold text-amber-950 group-hover:underline">{deck.title}</h3>
        {deck.description && <p className="mt-1 line-clamp-2 text-sm whitespace-pre-wrap text-amber-900/65">{deck.description}</p>}
        <div className="mt-auto pt-3">
          <GrowthBar percent={deck.masteryPercent} />
          <p className="mt-1.5 font-game text-xs font-bold text-amber-900/55 capitalize">{deck.treeType} tree</p>
        </div>
      </div>
    </Link>
  )
}

export { TreeCard }
