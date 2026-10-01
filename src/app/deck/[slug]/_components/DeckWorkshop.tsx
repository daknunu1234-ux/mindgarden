'use client'

import { GamePanel } from '@/shared/components/game'
import { DeckDangerZone, DeckEditor, DeckShareToggle, TournamentHostToggle, type Deck, type DeckEditorData } from '@/features/decks'

// The owner's Tree Workshop: the roots outline editor first, then one slim settings bar (species,
// share and tournament switches) and the danger zone. Its own module so DeckScene can load it as a
// separate chunk (next/dynamic): it sits below the fold, so the header and the tree hydrate without
// waiting for the editor's code.
export function DeckWorkshop({ deck, editor }: { deck: Deck; editor: DeckEditorData }) {
  return (
    <section aria-labelledby="grow-heading" className="mt-12">
      <GamePanel tone="wood" ribbon="gold" title={<span id="grow-heading">🛠️ Tree Workshop</span>}>
        <p className="mb-3 text-center text-sm text-amber-100/85">
          Grow your roots right here: pick a root, type statements and sub-roots inline, Enter for the next, Tab to nest.
        </p>
        <DeckEditor
          editor={editor}
          settings={
            <>
              <DeckShareToggle deckId={deck.id} slug={deck.slug} isPublic={deck.isPublic} />
              <TournamentHostToggle deckId={deck.id} isPublic={deck.isPublic} isOpen={deck.isTournamentOpen} />
            </>
          }
        />
        <div className="mt-8">
          <DeckDangerZone deckId={deck.id} deckTitle={deck.title} />
        </div>
      </GamePanel>
    </section>
  )
}
