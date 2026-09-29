import Link from 'next/link'
import { PencilLine } from 'lucide-react'
import { GameButton, GamePanel, GameProgressBar, GameSlab } from '@/shared/components/game'
import { GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
import { cn } from '@/shared/utils/cn'
import { plural } from '../lib/format'
import type { PlantedTreeView } from '../types'

type PlantedTreeListProps = { trees: PlantedTreeView[] }

// The orchard ledger: one raised row per planted tree.
function PlantedTreeList({ trees }: PlantedTreeListProps) {
  return (
    <GamePanel tone="parchment" ribbon="leaf" title="🌳 Your Orchard">
      {trees.length === 0 ? (
        <div className="py-6 text-center">
          <p aria-hidden className="text-5xl">
            🌱
          </p>
          <p className="mt-3 font-game text-lg font-bold">You haven&apos;t planted a tree yet</p>
          <p className="mt-1 text-sm text-amber-900/70">Plant one, add a few roots, and watch it grow as you practice.</p>
          <GameButton asChild tone="leaf" size="lg" className="mt-6">
            <Link href="/deck/new">Plant a Tree 🌱</Link>
          </GameButton>
        </div>
      ) : (
        <ul className="space-y-3">
          {trees.map((tree) => (
            <li key={tree.slug}>
              <GameSlab tone={tree.mightyRoots > 0 ? 'gold' : 'cream'} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-3 sm:flex-nowrap">
                {tree.illustration && (
                  <div className="size-16 shrink-0 rounded-xl bg-gradient-to-b from-sky-100 to-lime-100 p-0.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)]">
                    {tree.illustration}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/deck/${tree.slug}`} className="truncate font-game text-lg font-bold text-amber-950 hover:underline">
                      {tree.title}
                    </Link>
                    {/* Species · growth stage (mastery) · size tier (subject scope). */}
                    <Chip>{tree.treeType}</Chip>
                    {tree.stage && (
                      <Chip tone="leaf" title="Growth stage: how much you've mastered">
                        {tree.stage.emoji} {tree.stage.name}
                      </Chip>
                    )}
                    {tree.size && (
                      <Chip tone={tree.size.tier === 'xl' ? 'gold' : 'sky'} title={`Size: ${tree.size.name}, from ${plural(tree.itemCount, 'statement', 'statements')}`}>
                        {tree.size.badge}
                      </Chip>
                    )}
                    {!tree.isPublic && <Chip>🔒 Private</Chip>}
                    {tree.mightyRoots > 0 && <Chip gold>💎 {plural(tree.mightyRoots, 'Mighty Root', 'Mighty Roots')}</Chip>}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <GameProgressBar
                      value={tree.masteryPercent}
                      tone={tree.masteryPercent >= GOLDEN_BLOOM_PERCENT ? 'gold' : 'leaf'}
                      size="sm"
                      label={`${tree.title} growth`}
                      className="w-28 sm:w-40"
                    />
                    <span className="text-xs font-semibold text-amber-900/70 tabular-nums">
                      {tree.masteryPercent}% · {plural(tree.itemCount, 'statement', 'statements')}
                    </span>
                  </div>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  {tree.itemCount > 0 && (
                    <GameButton asChild tone="sky" size="sm" className="flex-1 sm:flex-none">
                      <Link href={`/deck/${tree.slug}/drill`}>💧 Water</Link>
                    </GameButton>
                  )}
                  <GameButton asChild tone="cream" size="sm" className="flex-1 sm:flex-none">
                    <Link href={`/deck/${tree.slug}#grow-heading`} aria-label={`Edit roots of ${tree.title}`}>
                      <PencilLine aria-hidden className="size-4" /> Edit
                    </Link>
                  </GameButton>
                </div>
              </GameSlab>
            </li>
          ))}
        </ul>
      )}
    </GamePanel>
  )
}

const CHIP_TONES = {
  plain: 'border-amber-900/15 bg-amber-50 text-amber-900/75',
  gold: 'border-yellow-500 bg-yellow-100 text-amber-800',
  leaf: 'border-emerald-500/50 bg-emerald-50 text-emerald-800',
  sky: 'border-sky-500/50 bg-sky-50 text-sky-800',
} as const

function Chip({ children, gold = false, tone, title }: { children: React.ReactNode; gold?: boolean; tone?: keyof typeof CHIP_TONES; title?: string }) {
  return (
    <span
      title={title}
      className={cn('rounded-full border-2 px-2 py-0.5 font-game text-xs font-bold capitalize', CHIP_TONES[tone ?? (gold ? 'gold' : 'plain')])}
    >
      {children}
    </span>
  )
}

export { PlantedTreeList }
