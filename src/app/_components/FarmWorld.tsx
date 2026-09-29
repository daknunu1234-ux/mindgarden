'use client'

import { useState, type ComponentProps } from 'react'
import { DeleteDeckDialog } from '@/features/decks'
import { FarmIslandView, type FarmPlotView } from '@/features/garden'

type FarmWorldProps = Omit<ComponentProps<typeof FarmIslandView>, 'onUproot'>

// Route-level composition for `/`: the garden's Farm World plus the decks feature's uproot dialog.
// garden stays UI-only (no decks import); the owner's 🗑 badge in a plot popup lands here.
export function FarmWorld(props: FarmWorldProps) {
  const [uprooting, setUprooting] = useState<FarmPlotView | null>(null)
  // Keep the last target while the dialog animates closed.
  const [target, setTarget] = useState<FarmPlotView | null>(null)

  return (
    <>
      <FarmIslandView
        {...props}
        onUproot={(plot) => {
          setTarget(plot)
          setUprooting(plot)
        }}
      />
      {target && (
        <DeleteDeckDialog
          deckId={target.id}
          deckTitle={target.title}
          open={uprooting !== null}
          onOpenChange={(open) => !open && setUprooting(null)}
        />
      )}
    </>
  )
}
