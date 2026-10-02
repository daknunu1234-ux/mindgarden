'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Droplets, Network } from 'lucide-react'
import { GameButton, GameDialog, GameDialogContent, GameSlab } from '@/shared/components/game'
import { FRUIT_COINS } from '@/shared/lib/economy'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { isImmune } from '@/shared/lib/treeVitality'
import { cn } from '@/shared/utils/cn'
import { useTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { BoltIcon } from './BubbleIcons'
import { GrowthBar } from './GrowthBar'
import { TreeStageSvg } from './TreeStageSvg'

type FarmPlotDialogProps = {
  plot: FarmPlotView | null
  onOpenChange: (open: boolean) => void
  // Owners only: ask to chop (delete) this tree. The page wires it to the decks feature.
  onUproot?: (plot: FarmPlotView) => void
  // Owners only: pick the tree up and move it to another tile (Move mode on the farm).
  onMove?: (plot: FarmPlotView) => void
  // Owners only: harvest today's fruit (practised yesterday).
  onHarvest?: (plot: FarmPlotView) => void
  // Owners only: whether today's Daily Rush is already used (it is one run a day for the whole
  // island, so every tree's ⚡ button greys out together). Undefined / null: no button.
  rushPlayed?: boolean | null
}

// The ⚡ Daily Rush button beside Water Tree (ready: fiery gradient; played: muted grey).
const RUSH =
  'inline-flex h-12 shrink-0 items-center justify-center rounded-full px-5 font-game text-base font-bold whitespace-nowrap transition focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none'

// One segment of the owner's compact action row.
const TOOL =
  'flex h-9 flex-1 items-center justify-center gap-1.5 px-3 font-game text-sm font-bold whitespace-nowrap text-amber-950 transition-colors hover:bg-amber-100 focus-visible:bg-amber-100 focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none focus-visible:ring-inset'

// Tree popover: 💧 water (practise), then one compact row for the owner: roots (the tree's page:
// mindmap + Workshop), ↔️ move and 🪓 chop (a planted tree can't go back to the Shop). Visitors (strict read-only
// mode) explore the roots, clone to practise, and ⚔️ compete while the owner hosts a Mind Tournament.
function FarmPlotDialog({ plot, onOpenChange, onUproot, onMove, onHarvest, rushPlayed }: FarmPlotDialogProps) {
  return (
    <GameDialog open={plot !== null} onOpenChange={onOpenChange}>
      <GameDialogContent title={plot?.title ?? 'Tree'} ribbon="leaf" tone="parchment">
        {/* key: the review switch starts off for every plot. */}
        {plot && <PlotDetails key={plot.id} plot={plot} onUproot={onUproot} onMove={onMove} onHarvest={onHarvest} rushPlayed={rushPlayed} />}
      </GameDialogContent>
    </GameDialog>
  )
}

type PlotDetailsProps = Pick<FarmPlotDialogProps, 'onUproot' | 'onMove' | 'onHarvest' | 'rushPlayed'> & { plot: FarmPlotView }

function PlotDetails({ plot, onUproot, onMove, onHarvest, rushPlayed }: PlotDetailsProps) {
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
        {/* pt-5: headroom, so a surreal tree (drawn bigger than its box) stays inside the frame. */}
        <div className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 to-lime-100 px-2 pt-5 pb-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)]">
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
          {plot.withered && <p className="font-semibold text-stone-600">🥀 Withered after 3 days without practice: water it to bring it back.</p>}
          {plot.isOwner && !plot.withered && isImmune(stage) && (
            <p className="font-semibold text-emerald-800">🌳 Evergreen: mastered this deeply, it never withers.</p>
          )}
        </div>
      </GameSlab>

      {/* Practised yesterday: today's fruit hangs on it (also a 🍎 bubble on the farm). */}
      {plot.isOwner && plot.fruitReady && onHarvest && (
        <GameButton tone="sun" size="lg" className="w-full" onClick={() => onHarvest(plot)}>
          🍎 Harvest fruit (+{FRUIT_COINS} 🪙)
        </GameButton>
      )}

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
            {/* Water, and right beside it the day's ⚡ Daily Rush (one run a day, on one tree). */}
            <div className="flex flex-wrap items-stretch gap-3">
              <GameButton asChild tone="sky" size="lg" className="min-w-0 flex-1">
                <Link href={waterHref}>
                  <Droplets aria-hidden /> {allMastered ? 'Review Mastered 🌿' : reviewing ? 'Water Tree (Review Mode)' : 'Water Tree'}
                </Link>
              </GameButton>
              {rushPlayed === true ? (
                <button type="button" disabled title="You played today's Daily Rush. See you tomorrow!" className={cn(RUSH, 'cursor-not-allowed bg-stone-300 text-stone-600')}>
                  See you tomorrow
                </button>
              ) : (
                rushPlayed === false && (
                  <Link
                    href={`/deck/${plot.slug}/rush`}
                    title="Daily Rush: 8 seconds a card, one mistake ends it, 1 coin for every card in a row. Once a day, on one tree"
                    className={cn(RUSH, 'mg-rush-pulse bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white shadow-lg hover:brightness-110 active:scale-95')}
                  >
                    <BoltIcon size={22} className="mr-1.5" /> Daily Rush
                  </Link>
                )
              )}
            </div>
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
        {/* Owner's secondary actions: one compact pill row. Roots opens the tree's page, where the
            mindmap and the Tree Workshop are (there is no separate Edit). */}
        {plot.isOwner && (
          <div
            role="group"
            aria-label="Tree actions"
            className="flex flex-wrap justify-center divide-x-2 divide-amber-900/15 overflow-hidden rounded-2xl border-[2.5px] border-[#dcb98c] bg-gradient-to-b from-white to-[#fff6e6] shadow-[0_3px_0_#d2ac7c]"
          >
            <Link href={`/deck/${plot.slug}`} className={TOOL} title="Open the roots: view the mindmap and edit statements">
              <Network aria-hidden className="size-4" /> Roots
            </Link>
            {onMove && plot.placementId && (
              <button type="button" className={TOOL} onClick={() => onMove(plot)} title="Pick the tree up and put it on another tile">
                <span aria-hidden>↔️</span> Move
              </button>
            )}
            {onUproot && (
              <button
                type="button"
                className={cn(TOOL, 'text-red-700 hover:bg-red-50')}
                onClick={() => onUproot(plot)}
                title="Delete this tree (a Woodshop refunds 25% of its statements)"
              >
                <span aria-hidden>🪓</span> Chop
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export { FarmPlotDialog }
