import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GameButton, GamePanel, Ribbon } from '@/shared/components/game'
import { getCurrentUser } from '@/features/auth'
import { CloneTreeButton, countDeckTree, getDeckBySlug } from '@/features/decks'
import { getFarmHud } from '@/features/progress'
import { DrillOverlay, drillHref, getDrillSession, isReviewParam, ReviewModeToggle } from '@/features/drill'

export const metadata: Metadata = { title: 'Practice · MindGarden' }

// /deck/[slug]/drill                     → the whole tree (5/5 items rest)
// /deck/[slug]/drill?nodeId=<id>          → one root and its sub-roots ("Drill branch" in the mindmap)
// …&review=1                              → review mode: mastered 5/5 items mixed back in
export default async function DrillPage({ params, searchParams }: PageProps<'/deck/[slug]/drill'>) {
  const { slug } = await params
  const { nodeId: rawNodeId, review: rawReview } = await searchParams
  const nodeId = typeof rawNodeId === 'string' && rawNodeId !== '' ? rawNodeId : undefined
  const includeMastered = isReviewParam(rawReview)

  const [res, userRes] = await Promise.all([getDrillSession({ slug, nodeId, includeMastered }), getCurrentUser()])
  const isSignedIn = userRes.success && userRes.data !== null

  if (!res.success) {
    const { code, message } = res.error
    // Unknown deck, unknown root, or a malformed slug / nodeId can never match: 404.
    if (code === 'DECK_NOT_FOUND' || code === 'NODE_NOT_FOUND' || code === 'VALIDATION_FAILED') notFound()
    // Strict read-only visitor mode: only the owner practises; everyone else is offered a clone.
    if (code === 'FORBIDDEN_VISITOR_PRACTICE') return <VisitorPracticeLocked slug={slug} message={message} signedIn={isSignedIn} />

    const noItems = code === 'DRILL_NO_ITEMS'
    const allMastered = code === 'DRILL_ALL_MASTERED'
    const scope = nodeId ? 'This branch' : 'This tree'
    return (
      <main className="mg-meadow-bg w-full flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
          <GamePanel
            tone={allMastered ? 'gold' : 'parchment'}
            ribbon={allMastered ? 'gold' : noItems ? 'leaf' : 'wood'}
            title={allMastered ? '🌳 Fully Cultivated!' : noItems ? 'Nothing to water yet 🌱' : 'The drill is resting'}
          >
            <p className="text-center">
              {allMastered
                ? `${scope} is fully cultivated: every statement is at 5/5, so it has nothing left to water today. Review mastered statements to keep them sharp.`
                : noItems
                  ? `${scope} has no drillable statements yet. Add statements about sibling concepts, or with words like tăng/giảm, trước/sau or là.`
                  : `${message}. Try again in a moment.`}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {allMastered && (
                <GameButton asChild tone="leaf" size="lg">
                  <Link href={drillHref(slug, { nodeId, review: true })}>Review Mastered 🌿</Link>
                </GameButton>
              )}
              <GameButton asChild tone="wood">
                <Link href={`/deck/${slug}`}>Back to tree</Link>
              </GameButton>
              {nodeId && (noItems || allMastered) && (
                <GameButton asChild tone="cream">
                  <Link href={drillHref(slug)}>Practice the whole tree</Link>
                </GameButton>
              )}
            </div>
          </GamePanel>
        </div>
      </main>
    )
  }

  const { deck, focus, sessionId, masteredCount } = res.data
  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <p className="font-game text-sm font-bold tracking-wide text-emerald-800/70 uppercase">
            {includeMastered ? 'Watering Session · Review Mode' : 'Watering Session'}
          </p>
          <h1 className="font-game text-3xl leading-tight font-extrabold text-emerald-950 [text-shadow:0_2px_0_rgba(255,255,255,0.8)]">
            {deck.title}
          </h1>
          {focus && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <Ribbon tone="sky">Branch: {focus.title}</Ribbon>
              <Link href={drillHref(deck.slug, { review: includeMastered })} className="font-game text-sm font-bold text-emerald-800 underline-offset-4 hover:underline">
                Practice the whole tree
              </Link>
            </div>
          )}
          {/* Only worth offering when this round has mastered items to rest or mix in. */}
          {masteredCount > 0 && (
            <ReviewModeToggle on={includeMastered} masteredCount={masteredCount} href={drillHref(deck.slug, { nodeId, review: !includeMastered })} />
          )}
        </div>
        {/* A new session (e.g. after "Water again" refreshes) remounts the overlay with fresh state. */}
        <DrillOverlay key={sessionId} session={res.data} isSignedIn={isSignedIn} />
      </div>
    </main>
  )
}

// Someone else's tree: "You must clone this tree to your garden to practice it!" with the clone offer.
async function VisitorPracticeLocked({ slug, message, signedIn }: { slug: string; message: string; signedIn: boolean }) {
  const [deckRes, hud] = await Promise.all([getDeckBySlug({ slug }), signedIn ? getFarmHud() : null])
  const purse = hud?.success && hud.data ? hud.data : null
  const deck = deckRes.success ? deckRes.data.deck : null
  const statementCount = deckRes.success ? countDeckTree(deckRes.data.tree).itemCount : 0

  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <GamePanel tone="parchment" ribbon="leaf" title="🌿 Read-only tree">
          <p className="text-center font-game text-lg font-extrabold text-amber-950">{message}</p>
          <p className="mt-2 text-center text-sm text-amber-900/75">
            {deck ? `“${deck.title}” belongs to another gardener. ` : ''}You can explore its roots and statements, but practice happens on your own copy,
            starting from 0/5.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {deck && (
              <CloneTreeButton
                deckId={deck.id}
                deckTitle={deck.title}
                statementCount={statementCount}
                coins={purse?.coins ?? null}
                coinsAsOf={purse?.coinsAsOf}
                signedIn={signedIn}
                size="lg"
              />
            )}
            <GameButton asChild tone="wood">
              <Link href={`/deck/${slug}`}>Explore the tree</Link>
            </GameButton>
            <GameButton asChild tone="cream">
              <Link href="/">My garden</Link>
            </GameButton>
          </div>
        </GamePanel>
      </div>
    </main>
  )
}
