'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Droplets, Network, PencilLine } from 'lucide-react'
import { GameButton, GameDialog, GameDialogContent, GameSlab } from '@/shared/components/game'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { useTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { GrowthBar } from './GrowthBar'
import { TreeStageSvg } from './TreeStageSvg'

type FarmPlotDialogProps = {
  plot: FarmPlotView | null
  onOpenChange: (open: boolean) => void
  // Owners only: ask to chop (delete) this tree. The page wires it to the decks feature.
  onUproot?: (plot: FarmPlotView) => void
  // Owners only: take the tree off the farm (back to the Shop's Trees tab, nothing deleted).
  onRemoveFromFarm?: (plot: FarmPlotView) => void
  // Owners only: pick the tree up and move it to another tile (Move mode on the farm).
  onMove?: (plot: FarmPlotView) => void
}

// Tree popover: 💧 water (practise), 🔍 roots (mindmap), edit, ↔️ move, 📦 remove from the farm and 🪓 chop, all
// owner only. Visitors (strict read-only mode) explore the roots, clone to practise, and ⚔️ compete
// while the owner hosts a Mind Tournament.
function FarmPlotDialog({ plot, onOpenChange, onUproot, onRemoveFromFarm, onMove }: FarmPlotDialogProps) {
  return (
    <GameDialog open={plot !== null} onOpenChange={onOpenChange}>
      <GameDialogContent title={plot?.title ?? 'Tree'} ribbon="leaf" tone="parchment">
        {/* key: the review switch starts off for every plot. */}
        {plot && <PlotDetails key={plot.id} plot={plot} onUproot={onUproot} onRemoveFromFarm={onRemoveFromFarm} onMove={onMove} />}
      </GameDialogContent>
    </GameDialog>
  )
}

type PlotDetailsProps = Pick<FarmPlotDialogProps, 'onUproot' | 'onRemoveFromFarm' | 'onMove'> & { plot: FarmPlotView }

function PlotDetails({ plot, onUproot, onRemoveFromFarm, onMove }: PlotDetailsProps) {
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
            {plot.mightyRoots > 0 && ` · 🌟 ${plot.mightyRoots} Mighty ${plot.mightyRoots === 1 ? 'Root' : 'Roots'}`}
          </p>
          {plot.isOwner && (plot.buff ?? 1) > 1 && (
            <p className="font-semibold text-amber-800">🪙 ×{plot.buff} coins for statements mastered here</p>
          )}
          {plot.needsWater === true && canWater && <p className="font-semibold text-sky-800">💧 Thirsty: practise today to water it.</p>}
          {plot.needsWater === false && <p className="font-semibold text-emerald-800">Watered today 🌿</p>}
        </div>
      </GameSlab>

      <div className="grid gap-3">
        {!plot.isOwner ? (
          <>
            <GameButton tone="sky" size="lg" disabled title="Visitors can explore but not practise: clone this tree to your garden first">
              Clone to practice this tree 🌱
            </GameButton>
            {plot.isTournamentOpen && (
              <GameButton asChild tone="sun" size="lg">
                <Link href={`/deck/${plot.slug}#tournament`}>⚔️ Compete in its Mind Tournament</Link>
              </GameButton>
            )}
            <GameButton asChild tone="leaf">
              <Link href={`/deck/${plot.slug}`}>🌱 Explore &amp; clone this tree</Link>
            </GameButton>
          </>
        ) : canWater ? (
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
        </div>
        {plot.isOwner && onMove && plot.placementId && (
          <GameButton type="button" tone="sky" className="w-full" onClick={() => onMove(plot)} title="Pick the tree up and put it on another tile">
            ↔️ Move
          </GameButton>
        )}
        {plot.isOwner && (onRemoveFromFarm || onUproot) && (
          <div className="flex gap-3">
            {onRemoveFromFarm && plot.placementId && (
              <GameButton type="button" tone="cream" className="flex-1" onClick={() => onRemoveFromFarm(plot)} title="Back to the Shop's Trees tab: nothing is deleted">
                📦 Remove from farm
              </GameButton>
            )}
            {onUproot && (
              <GameButton type="button" tone="danger" className="flex-1" onClick={() => onUproot(plot)} title="Delete this tree (a Woodshop refunds 25% of its statements)">
                🪓 Chop
              </GameButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export { FarmPlotDialog }
