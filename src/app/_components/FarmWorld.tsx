'use client'

import { useState, type ComponentProps } from 'react'
import { chopDeck, createDeck, DeleteDeckDialog, renameDeck } from '@/features/decks'
import { FarmIslandView, type BuySeedRun, type ChopRun, type FarmPlotView, type RenameRun } from '@/features/garden'
import { harvestTreeFruit } from '@/features/progress'

type FarmWorldProps = Omit<ComponentProps<typeof FarmIslandView>, 'onUproot' | 'onHarvest' | 'onBuySeed' | 'onRenameTree'>

type ChopTarget = { plot: FarmPlotView; chop: (run: ChopRun) => void }

// The Shop's seed purchase: decks' createDeck plants it (charging the species' seed price) with the
// suggested name; the farm then places it and asks for its real name.
const buySeed: BuySeedRun = async (treeType, title) => {
  const res = await createDeck({ title, treeType })
  if (!res.success) return res
  const { deck, remainingCoins } = res.data
  return { success: true, data: { tree: { id: deck.id, slug: deck.slug, title: deck.title, treeType: deck.treeType }, remainingCoins } }
}

// ✏️ Rename on the farm (tree popover, naming prompt): decks' renameDeck.
const renameTree: RenameRun = async (deckId, title) => {
  const res = await renameDeck({ deckId, title })
  return res.success ? { success: true, data: { title: res.data.title } } : res
}

// Route-level composition for `/`: the garden's Farm World plus the decks feature's uproot dialog and
// progress' fruit harvest, decks' seed purchase and rename.
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
        onHarvest={(deckId, timeZone) => harvestTreeFruit({ deckId, timeZone })}
        onBuySeed={props.signedIn && !props.visitor ? buySeed : undefined}
        onRenameTree={props.signedIn && !props.visitor ? renameTree : undefined}
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
