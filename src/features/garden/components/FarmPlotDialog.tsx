'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Droplets, Network, PencilLine, Trash2 } from 'lucide-react'
import { GameButton, GameDialog, GameDialogContent, GameSlab } from '@/shared/components/game'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { useTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { GrowthBar } from './GrowthBar'
import { TreeStageSvg } from './TreeStageSvg'

type FarmPlotDialogProps = {
  plot: FarmPlotView | null
  onOpenChange: (open: boolean) => void
  // Owners only: ask to uproot (delete) this tree. The page wires it to the decks feature.
  onUproot?: (plot: FarmPlotView) => void
}

// Plot popup: water (practise), inspect roots (mindmap), edit and uproot (owner only).
function FarmPlotDialog({ plot, onOpenChange, onUproot }: FarmPlotDialogProps) {
  return (
    <GameDialog open={plot !== null} onOpenChange={onOpenChange}>
      <GameDialogContent title={plot?.title ?? 'Tree'} ribbon="leaf" tone="parchment">
        {/* key: the review switch starts off for every plot. */}
        {plot && <PlotDetails key={plot.id} plot={plot} onUproot={onUproot} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function PlotDetails({ plot, onUproot }: { plot: FarmPlotView; onUproot?: (plot: FarmPlotView) => void }) {
  const { stage, name, emoji } = useTreeStage(plot.masteryPercent)
  const species = getTreeSpecies(plot.treeType)
  const canWater = plot.itemCount > 0
  const allMastered = canWater && plot.masteredCount >= plot.itemCount
  // Review mode: mix 5/5 items back in. Forced on when everything is mastered (nothing else to water).
  const [review, setReview] = useState(false)
  const reviewing = review || allMastered
  const waterHref = `/deck/${plot.slug}/drill${reviewing ? '?review=1' : ''}`

  return (
    <div className="space-y-4">
      <p className="text-center font-game text-sm font-semibold text-amber-900/80">
        {species.icon} {species.label} · {emoji} {name}
      </p>

      <GameSlab className="flex items-center gap-4 p-3">
        <div className="relative shrink-0 rounded-2xl bg-gradient-to-b from-sky-100 to-lime-100 p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)]">
          <TreeStageSvg stage={stage} treeType={plot.treeType} label={`${name} ${species.label}`} className="size-24" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <GrowthBar percent={plot.masteryPercent} />
          <p className="font-medium text-amber-900/75">
            {plot.itemCount} {plot.itemCount === 1 ? 'statement' : 'statements'}
            {plot.mightyRoots > 0 && ` · 💎 ${plot.mightyRoots} Mighty ${plot.mightyRoots === 1 ? 'Root' : 'Roots'}`}
          </p>
          {plot.needsWater === true && canWater && <p className="font-semibold text-sky-800">💧 Thirsty: practise today to water it.</p>}
          {plot.needsWater === false && <p className="font-semibold text-emerald-800">Watered today 🌿</p>}
        </div>
      </GameSlab>

      <div className="grid gap-3">
        {canWater ? (
          <>
            <GameButton asChild tone="sky" size="lg">
              <Link href={waterHref}>
                <Droplets aria-hidden /> {allMastered ? 'Review Mastered 🌿' : reviewing ? 'Water Tree (Review Mode)' : 'Water Tree'}
              </Link>
            </GameButton>
            {allMastered ? (
              <p className="text-center font-game text-sm font-bold text-emerald-800">🌳 Fully cultivated: every statement is at 5/5.</p>
            ) : (
              plot.masteredCount > 0 && (
                <label className="flex cursor-pointer items-center justify-center gap-2.5 font-game text-sm font-bold text-amber-950">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={review}
                    onChange={(e) => setReview(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="relative h-6 w-11 rounded-full border-[2.5px] border-stone-400 bg-stone-300 shadow-[inset_0_2px_3px_rgba(0,0,0,0.2)] transition-colors peer-checked:border-emerald-700 peer-checked:bg-emerald-500 peer-focus-visible:ring-4 peer-focus-visible:ring-yellow-300 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-[0_1.5px_0_rgba(0,0,0,0.25)] after:transition-[left] peer-checked:after:left-[22px]"
                  />
                  Include Mastered Items (Review Mode)
                  <span className="font-sans text-xs font-semibold text-amber-900/60">· {plot.masteredCount} at 5/5</span>
                </label>
              )
            )}
          </>
        ) : (
          <GameButton tone="sky" size="lg" disabled>
            <Droplets aria-hidden /> Nothing to water yet
          </GameButton>
        )}
        <div className="flex gap-3">
          <GameButton asChild tone="wood" className="flex-1">
            <Link href={`/deck/${plot.slug}`}>
              <Network aria-hidden /> Roots
            </Link>
          </GameButton>
          {/* Owner's edit menu: edit + a small uproot (delete) badge. */}
          {plot.isOwner && (
            <GameButton asChild tone="cream" className="flex-1">
              <Link href={`/deck/${plot.slug}#grow-heading`}>
                <PencilLine aria-hidden /> Edit
              </Link>
            </GameButton>
          )}
          {plot.isOwner && onUproot && (
            <GameButton
              type="button"
              tone="danger"
              size="icon"
              onClick={() => onUproot(plot)}
              aria-label={`Uproot ${plot.title}`}
              title="Uproot this tree"
            >
              <Trash2 aria-hidden />
            </GameButton>
          )}
        </div>
      </div>
    </div>
  )
}

export { FarmPlotDialog }
