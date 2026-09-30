'use client'

import { useState } from 'react'
import { GameButton, GameDialog, GameDialogContent } from '@/shared/components/game'
import { catalogFor } from '../lib/farmCatalog'
import type { Placement } from '../lib/farmGrid'

type FarmItemDialogProps = {
  placement: Placement | null
  // Only the owner may move or pick items up.
  isOwner: boolean
  onClose: () => void
  // Owner: start Move mode for this item (the farm closes this dialog).
  onMove?: (placement: Placement) => void
  // Owner: pick it up. The farm removes it at once and syncs in the background (rolls back on error).
  onPickUp?: (placement: Placement) => void
}

// A bought item on the farm: what it is and what it does. The owner can move it to another tile, or
// pick it up again (it's gone, no refund), which frees its tiles.
function FarmItemDialog({ placement, isOwner, onClose, onMove, onPickUp }: FarmItemDialogProps) {
  const entry = placement ? catalogFor(placement.itemType, placement.variant) : undefined
  return (
    <GameDialog open={placement !== null} onOpenChange={(open) => !open && onClose()}>
      <GameDialogContent title={entry ? `${entry.icon} ${entry.name}` : 'Farm item'} ribbon="wood" tone="parchment">
        {placement && entry && (
          <ItemBody key={placement.id} placement={placement} description={entry.description} isOwner={isOwner} onMove={onMove} onPickUp={onPickUp} />
        )}
      </GameDialogContent>
    </GameDialog>
  )
}

function ItemBody({
  placement,
  description,
  isOwner,
  onMove,
  onPickUp,
}: {
  placement: Placement
  description: string
  isOwner: boolean
  onMove?: (placement: Placement) => void
  onPickUp?: (placement: Placement) => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="space-y-4 text-center">
      <p className="text-amber-900/85">{description}</p>
      <p className="text-xs font-semibold text-amber-900/60">
        {placement.width}×{placement.height} at tile ({placement.x}, {placement.y})
      </p>
      {isOwner &&
        (confirming && onPickUp ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-sm font-semibold text-amber-950">Pick it up? You won&apos;t get the coins back.</span>
            <GameButton tone="danger" size="sm" onClick={() => onPickUp(placement)}>
              Pick up
            </GameButton>
            <GameButton tone="cream" size="sm" onClick={() => setConfirming(false)}>
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
            {onPickUp && (
              <GameButton tone="cream" onClick={() => setConfirming(true)}>
                📦 Pick up
              </GameButton>
            )}
          </div>
        ))}
    </div>
  )
}

export { FarmItemDialog }
