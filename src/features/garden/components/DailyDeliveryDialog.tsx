'use client'

import Link from 'next/link'
import { GameButton, GameDialog, GameDialogContent, GameProgressBar, GameSlab } from '@/shared/components/game'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import type { FarmPlotView } from '../types'

type DailyDeliveryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  plots: FarmPlotView[]
  signedIn: boolean
}

const MAX_LISTED = 5

// Daily Quests: today's watering run over every thirsty tree on the island.
function DailyDeliveryDialog({ open, onOpenChange, plots, signedIn }: DailyDeliveryDialogProps) {
  const { open: openLogin } = useLoginDialog()
  const thirsty = plots.filter((p) => p.needsWater === true && p.itemCount > 0)
  const watered = plots.filter((p) => p.needsWater === false).length
  const waterable = watered + thirsty.length

  return (
    <GameDialog open={open} onOpenChange={onOpenChange}>
      <GameDialogContent
        title="📜 Daily Quests"
        ribbon="berry"
        description={
          !signedIn
            ? 'Sign in and the tractor brings you a watering run every day.'
            : thirsty.length === 0
              ? 'Every tree on this island is watered today. 🎉'
              : `${thirsty.length} ${thirsty.length === 1 ? 'tree is' : 'trees are'} thirsty today. Water them to grow your streak.`
        }
      >
        {!signedIn ? (
          <GameButton
            tone="leaf"
            size="lg"
            className="w-full"
            onClick={() => {
              onOpenChange(false)
              openLogin()
            }}
          >
            Sign in
          </GameButton>
        ) : (
          <div className="space-y-4">
            {waterable > 0 && (
              <div>
                <p className="mb-1 flex justify-between font-game text-sm font-bold">
                  <span>💧 Water the island</span>
                  <span className="tabular-nums">
                    {watered} / {waterable}
                  </span>
                </p>
                <GameProgressBar value={watered} max={waterable} tone="sky" segments={Math.min(waterable, 12)} label="Trees watered today" />
              </div>
            )}

            {thirsty.length > 0 ? (
              <>
                <ul className="space-y-2">
                  {thirsty.slice(0, MAX_LISTED).map((p) => (
                    <li key={p.id}>
                      <GameSlab className="flex items-center gap-3 px-3 py-2">
                        <span aria-hidden className="text-2xl">
                          {getTreeSpecies(p.treeType).icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-game font-bold">{p.title}</span>
                          <span className="text-xs text-amber-900/65 tabular-nums">{p.masteryPercent}% grown</span>
                        </span>
                        <GameButton asChild tone="sky" size="sm">
                          <Link href={`/deck/${p.slug}/drill`}>💧 Water</Link>
                        </GameButton>
                      </GameSlab>
                    </li>
                  ))}
                </ul>
                {thirsty.length > MAX_LISTED && (
                  <p className="text-center text-xs font-medium text-amber-900/65">+ {thirsty.length - MAX_LISTED} more on the island</p>
                )}
                <GameButton asChild tone="leaf" size="lg" className="w-full">
                  <Link href={`/deck/${thirsty[0].slug}/drill`}>Start delivery 🌿</Link>
                </GameButton>
              </>
            ) : (
              <p className="text-center font-game font-semibold text-emerald-800">
                {watered > 0 ? `${watered} ${watered === 1 ? 'tree' : 'trees'} watered today. Come back tomorrow!` : 'Plant a seed to start your first delivery.'}
              </p>
            )}
          </div>
        )}
      </GameDialogContent>
    </GameDialog>
  )
}

export { DailyDeliveryDialog }
