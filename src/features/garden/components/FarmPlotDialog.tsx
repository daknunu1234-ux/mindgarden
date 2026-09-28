'use client'

import Link from 'next/link'
import { Droplets, Network, PencilLine } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { getTreeSpecies } from '@/shared/lib/treeSkins'
import { useTreeStage } from '../hooks/useTreeStage'
import type { FarmPlotView } from '../types'
import { GrowthBar } from './GrowthBar'
import { TreeStageSvg } from './TreeStageSvg'

type FarmPlotDialogProps = { plot: FarmPlotView | null; onOpenChange: (open: boolean) => void }

// Farm-themed plot popup: water (practise), inspect roots (mindmap), edit (owner only).
function FarmPlotDialog({ plot, onOpenChange }: FarmPlotDialogProps) {
  return (
    <Dialog open={plot !== null} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-amber-900/20 bg-gradient-to-b from-amber-50 to-lime-50 sm:max-w-md">
        {plot && <PlotDetails plot={plot} />}
      </DialogContent>
    </Dialog>
  )
}

function PlotDetails({ plot }: { plot: FarmPlotView }) {
  const { stage, name, emoji } = useTreeStage(plot.masteryPercent)
  const species = getTreeSpecies(plot.treeType)
  const canWater = plot.itemCount > 0

  return (
    <>
      <DialogHeader>
        {/* Wooden sign header. */}
        <div className="mx-auto -mt-1 mb-1 rounded-md border-2 border-amber-900/60 bg-gradient-to-b from-amber-600 to-amber-700 px-4 py-1 shadow">
          <DialogTitle className="text-center text-base font-semibold text-amber-50">{plot.title}</DialogTitle>
        </div>
        <DialogDescription className="text-center">
          {species.icon} {species.label} · {emoji} {name}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4">
        <TreeStageSvg stage={stage} treeType={plot.treeType} label={`${name} ${species.label}`} className="size-28 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <GrowthBar percent={plot.masteryPercent} />
          <p className="text-muted-foreground">
            {plot.itemCount} {plot.itemCount === 1 ? 'statement' : 'statements'}
            {plot.mightyRoots > 0 && ` · ✨ ${plot.mightyRoots} Mighty ${plot.mightyRoots === 1 ? 'Root' : 'Roots'}`}
          </p>
          {plot.needsWater === true && canWater && <p className="text-sky-800">💧 Thirsty: practise today to water it.</p>}
          {plot.needsWater === false && <p className="text-emerald-800">Watered today 🌿</p>}
        </div>
      </div>

      <div className="grid gap-2">
        {canWater ? (
          <Button asChild className="bg-sky-600 text-white hover:bg-sky-700">
            <Link href={`/deck/${plot.slug}/drill`}>
              <Droplets aria-hidden /> Water Tree (Practice 🌿)
            </Link>
          </Button>
        ) : (
          <Button disabled className="bg-sky-600 text-white">
            <Droplets aria-hidden /> Nothing to water yet
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/deck/${plot.slug}`}>
            <Network aria-hidden /> Inspect Roots (Mindmap)
          </Link>
        </Button>
        {plot.isOwner && (
          <Button asChild variant="ghost">
            <Link href={`/deck/${plot.slug}#grow-heading`}>
              <PencilLine aria-hidden /> Edit
            </Link>
          </Button>
        )}
      </div>
    </>
  )
}

export { FarmPlotDialog }
