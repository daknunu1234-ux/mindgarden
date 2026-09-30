'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent } from '@/shared/components/game'
import { removeFarmPlacement } from '../actions/removeFarmPlacement'
import { catalogFor } from '../lib/farmCatalog'
import type { Placement } from '../lib/farmGrid'

type FarmItemDialogProps = {
  placement: Placement | null
  // Only the owner may pick items up.
  isOwner: boolean
  onClose: () => void
  // Owner: start Move mode for this item (the farm closes this dialog).
  onMove?: (placement: Placement) => void
}

// A bought item on the farm: what it is and what it does. The owner can move it to another tile, or
// pick it up again (it's gone, no refund), which frees its tiles.
function FarmItemDialog({ placement, isOwner, onClose, onMove }: FarmItemDialogProps) {
  const entry = placement ? catalogFor(placement.itemType, placement.variant) : undefined
  return (
    <GameDialog open={placement !== null} onOpenChange={(open) => !open && onClose()}>
      <GameDialogContent title={entry ? `${entry.icon} ${entry.name}` : 'Farm item'} ribbon="wood" tone="parchment">
        {placement && entry && <ItemBody key={placement.id} placement={placement} description={entry.description} isOwner={isOwner} onClose={onClose} onMove={onMove} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function ItemBody({
  placement,
  description,
  isOwner,
  onClose,
  onMove,
}: {
  placement: Placement
  description: string
  isOwner: boolean
  onClose: () => void
  onMove?: (placement: Placement) => void
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const pickUp = () => {
    setError(null)
    startTransition(async () => {
      const res = await removeFarmPlacement({ placementId: placement.id })
      if (!res.success) {
        setError(`${res.error.message}.`)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-amber-900/85">{description}</p>
      <p className="text-xs font-semibold text-amber-900/60">
        {placement.width}×{placement.height} at tile ({placement.x}, {placement.y})
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}
      {isOwner &&
        (confirming ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-sm font-semibold text-amber-950">Pick it up? You won&apos;t get the coins back.</span>
            <GameButton tone="danger" size="sm" onClick={pickUp} disabled={isPending}>
              {isPending ? 'Picking up…' : 'Pick up'}
            </GameButton>
            <GameButton tone="cream" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
              Keep it
            </GameButton>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            {onMove && (
              <GameButton tone="sky" onClick={() => onMove(placement)} title="Pick it up and put it on another tile">
                ↔️ Move
              </GameButton>
            )}
            <GameButton tone="cream" onClick={() => setConfirming(true)}>
              📦 Pick up
            </GameButton>
          </div>
        ))}
    </div>
  )
}

export { FarmItemDialog }
