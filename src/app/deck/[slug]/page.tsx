import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { GamePanel } from '@/shared/components/game'
import { getCurrentUser, getDisplayNames } from '@/features/auth'
import { publicName } from '@/shared/lib/neighborName'
import { countsAsVisit, getDeckBySlug, getDeckEditor, getDeckReader, TreeVisitTracker } from '@/features/decks'
import { getFarmHud, getProgressByDecks } from '@/features/progress'
import { getTournamentBoards } from '@/features/tournament'
import { DeckScene } from './_components/DeckScene'

// generateMetadata and the page share one query per request.
const loadDeck = cache((slug: string) => getDeckBySlug({ slug }))

export async function generateMetadata({ params }: PageProps<'/deck/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const res = await loadDeck(slug)
  if (!res.success) return { title: 'MindGarden' }
  return {
    title: `${res.data.deck.title} · MindGarden`,
    description: res.data.deck.description ?? undefined,
  }
}

export default async function DeckPage({ params }: PageProps<'/deck/[slug]'>) {
  const { slug } = await params
  const res = await loadDeck(slug)

  if (!res.success) {
    // A malformed slug can never match a deck, so it is a 404 too.
    if (res.error.code === 'DECK_NOT_FOUND' || res.error.code === 'VALIDATION_FAILED') notFound()

    return (
      <main className="mg-meadow-bg w-full flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
          <GamePanel tone="stone" title="This tree is resting">
            <p className="text-center">{res.error.message}. Try again in a moment.</p>
          </GamePanel>
        </div>
      </main>
    )
  }

  // Signed out → zeros. A progress error only dims the tree; the deck still renders.
  const deckId = res.data.deck.id
  const [progress, userRes] = await Promise.all([getProgressByDecks({ deckIds: [deckId] }), getCurrentUser()])
  const signedIn = userRes.success && userRes.data !== null
  const isOwner = signedIn && userRes.data?.id === res.data.deck.userId
  // Owner → editor. Visitor (strict read-only mode) → the statements to read + their purse for
  // the clone fee.
  // Mind Tournament boards exist only on shared trees.
  const [editor, reader, hud, boards] = await Promise.all([
    isOwner ? getDeckEditor({ deckId }) : null,
    isOwner ? null : getDeckReader({ deckId }),
    !isOwner && signedIn ? getFarmHud() : null,
    res.data.deck.isPublic ? getTournamentBoards({ deckId }) : null,
  ])
  // The owner as visitors see them: their chosen Garden Name, else their pseudonym.
  const ownerNames = isOwner ? null : await getDisplayNames({ userIds: [res.data.deck.userId] })
  const ownerName = publicName(ownerNames?.success ? ownerNames.data[res.data.deck.userId] : null, res.data.deck.userId)
  const purse = hud?.success && hud.data ? hud.data : null
  // Visited Gardens: a signed-in player opening someone else's shared tree. Recorded from the
  // browser after mount, so link prefetching never counts as a visit.
  const tracksVisit = countsAsVisit({
    viewerId: userRes.success ? (userRes.data?.id ?? null) : null,
    ownerId: res.data.deck.userId,
    isPublic: res.data.deck.isPublic,
  })

  return (
    <>
      {tracksVisit && <TreeVisitTracker deckId={deckId} />}
      <DeckScene
        detail={res.data}
        ownerName={ownerName}
        progress={progress.success ? (progress.data[0] ?? null) : null}
        editor={editor?.success ? editor.data : null}
        tournament={{
          isOpen: res.data.deck.isPublic && res.data.deck.isTournamentOpen,
          boards: boards?.success ? boards.data : null,
          viewerId: userRes.success ? (userRes.data?.id ?? null) : null,
          viewerDisplayName: userRes.success ? (userRes.data?.displayName ?? null) : null,
        }}
        visitor={
          isOwner ? null : { reader: reader?.success ? reader.data : null, signedIn, coins: purse?.coins ?? null, coinsAsOf: purse?.coinsAsOf }
        }
      />
    </>
  )
}
