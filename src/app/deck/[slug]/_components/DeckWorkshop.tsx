'use client'

import { useEffect, useRef } from 'react'
import { GamePanel, InlineNameEdit } from '@/shared/components/game'
import { DeckDangerZone, DeckEditor, DeckShareToggle, OutlineStagingEditor, TournamentHostToggle, type Deck, type DeckEditorData } from '@/features/decks'
import { OutlineImportButton } from '@/features/mindmap'

type DeckWorkshopProps = {
  deck: Deck
  editor: DeckEditorData
  // The deck draft's renameTree (optimistic; the header shows the same name).
  onRename: (title: string) => void
  // Just bought and placed (`?start=1`): scroll here and open the first root's input, focused.
  start?: boolean
}

// The owner's Tree Workshop: the tree's name (✏️ to rename), the roots outline editor, then one slim
// settings bar (species, share and tournament switches) and the danger zone. Its own module so
// DeckScene can load it as a separate chunk (next/dynamic): it sits below the fold, so the header and
// the tree hydrate without waiting for the editor's code.
export function DeckWorkshop({ deck, editor, onRename, start = false }: DeckWorkshopProps) {
  const sectionRef = useRef<HTMLElement>(null)
  // Arriving from the purchase flow: bring the Workshop into view once, then drop `?start=1` from the
  // address so a reload doesn't do it again.
  useEffect(() => {
    if (!start) return
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const url = new URL(window.location.href)
    url.searchParams.delete('start')
    window.history.replaceState(window.history.state, '', url)
  }, [start])

  return (
    <section ref={sectionRef} aria-labelledby="grow-heading" className="mt-12 scroll-mt-6">
      {/* Slimmer side padding than other panels (px-3 / sm:px-4): the outline gets the width. */}
      <GamePanel tone="wood" ribbon="gold" className="px-3 sm:px-4" title={<span id="grow-heading">🛠️ Tree Workshop</span>}>
        <div className="mb-2 flex justify-center">
          <InlineNameEdit
            value={deck.title}
            onSave={onRename}
            label="Rename tree"
            tone="dark"
            className="max-w-full"
            textClassName="min-w-0 truncate font-game text-lg font-extrabold text-amber-50"
            inputClassName="font-game text-base font-extrabold"
          />
        </div>
        <p className="mb-3 text-center text-sm text-amber-100/85">
          {start && editor.rows.length === 0
            ? 'Your new tree is planted! Name its first root below, then press Enter for the next.'
            : 'Grow your roots right here: pick a root, type statements and sub-roots inline, Enter for the next, Tab to nest.'}
        </p>
        {/* A Word / PowerPoint / PDF outline into this tree: read in the browser, edited in the
            Workshop's own editor (in memory), imported on Done. */}
        <div className="mb-3 flex justify-center">
          <OutlineImportButton
            renderReview={(review) => <OutlineStagingEditor deckId={deck.id} treeType={editor.treeType} lines={review.lines} onBack={review.back} onDone={review.close} />}
          />
        </div>
        <DeckEditor
          editor={editor}
          start={start}
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
