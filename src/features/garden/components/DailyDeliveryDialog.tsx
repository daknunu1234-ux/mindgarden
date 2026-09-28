'use client'

import Link from 'next/link'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
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

// The tractor's "daily delivery": today's practice run over every thirsty tree on the island.
function DailyDeliveryDialog({ open, onOpenChange, plots, signedIn }: DailyDeliveryDialogProps) {
  const { open: openLogin } = useLoginDialog()
  const thirsty = plots.filter((p) => p.needsWater === true && p.itemCount > 0)
  const watered = plots.filter((p) => p.needsWater === false).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-amber-900/20 bg-gradient-to-b from-amber-50 to-lime-50 sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto -mt-1 mb-1 rounded-md border-2 border-red-900/50 bg-gradient-to-b from-red-500 to-red-700 px-4 py-1 shadow">
            <DialogTitle className="text-center text-base font-semibold text-red-50">🚜 Daily Delivery</DialogTitle>
          </div>
          <DialogDescription className="text-center">
            {!signedIn
              ? 'Sign in and the tractor brings you a watering run every day.'
              : thirsty.length === 0
                ? 'Every tree on this island is watered today. 🎉'
                : `${thirsty.length} ${thirsty.length === 1 ? 'tree is' : 'trees are'} thirsty today. Water them to grow your streak.`}
          </DialogDescription>
        </DialogHeader>

        {!signedIn ? (
          <Button
            onClick={() => {
              onOpenChange(false)
              openLogin()
            }}
          >
            Sign in
          </Button>
        ) : thirsty.length > 0 ? (
          <>
            <ul className="space-y-2">
              {thirsty.slice(0, MAX_LISTED).map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-amber-900/15 bg-white/70 px-3 py-2">
                  <span aria-hidden className="text-xl">
                    {getTreeSpecies(p.treeType).icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{p.masteryPercent}%</span>
                  <Button asChild size="sm" variant="outline" className="border-sky-300 text-sky-800">
                    <Link href={`/deck/${p.slug}/drill`}>💧 Water</Link>
                  </Button>
                </li>
              ))}
            </ul>
            {thirsty.length > MAX_LISTED && (
              <p className="text-center text-xs text-muted-foreground">+ {thirsty.length - MAX_LISTED} more on the island</p>
            )}
            <Button asChild className="bg-sky-600 text-white hover:bg-sky-700">
              <Link href={`/deck/${thirsty[0].slug}/drill`}>Start delivery 🌿</Link>
            </Button>
          </>
        ) : (
          <p className="text-center text-sm text-emerald-800">
            {watered > 0 ? `${watered} ${watered === 1 ? 'tree' : 'trees'} watered today. Come back tomorrow!` : 'Plant a seed to start your first delivery.'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { DailyDeliveryDialog }
