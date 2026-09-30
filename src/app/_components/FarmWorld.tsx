'use client'

import { useState, type ComponentProps } from 'react'
import { chopDeck, DeleteDeckDialog } from '@/features/decks'
import { FarmIslandView, type ChopRun, type FarmPlotView } from '@/features/garden'

type FarmWorldProps = Omit<ComponentProps<typeof FarmIslandView>, 'onUproot'>

type ChopTarget = { plot: FarmPlotView; chop: (run: ChopRun) => void }

// Route-level composition for `/`: the garden's Farm World plus the decks feature's uproot dialog.
// garden stays UI-only (no decks import). The dialog runs in farm mode: confirming hands the farm
// decks' chopDeck to run; the farm removes the tree at once and syncs in the background (no redirect,
// no page re-render).
export function FarmWorld(props: FarmWorldProps) {
  const [uprooting, setUprooting] = useState<ChopTarget | null>(null)
  // Keep the last target while the dialog animates closed.
  const [target, setTarget] = useState<ChopTarget | null>(null)

  return (
    <>
      <FarmIslandView
        {...props}
        onUproot={(plot, chop) => {
          setTarget({ plot, chop })
          setUprooting({ plot, chop })
        }}
      />
      {target && (
        <DeleteDeckDialog
          deckId={target.plot.id}
          deckTitle={target.plot.title}
          open={uprooting !== null}
          onOpenChange={(open) => !open && setUprooting(null)}
          onChop={() => target.chop(() => chopDeck({ deckId: target.plot.id }))}
        />
      )}
    </>
  )
}
