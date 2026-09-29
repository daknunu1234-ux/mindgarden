import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GameButton, GamePanel } from '@/shared/components/game'
import { SignInPrompt } from '@/shared/components/SignInPrompt'
import { getCurrentUser } from '@/features/auth'
import { DrillOverlay, drillHref, getTournamentSession } from '@/features/drill'
import { TournamentLiveBadge } from '@/features/tournament'

export const metadata: Metadata = { title: 'Mind Tournament · MindGarden' }

// /deck/[slug]/tournament: a Mind Tournament round on someone else's shared tree while its owner
// hosts one. Answers only move the contestant's isolated tournament score (never user_progress).
export default async function TournamentPage({ params }: PageProps<'/deck/[slug]/tournament'>) {
  const { slug } = await params
  const userRes = await getCurrentUser()
  const signedIn = userRes.success && userRes.data !== null
  const treeHref = `/deck/${slug}`

  if (!signedIn) {
    return (
      <main className="mg-meadow-bg w-full flex-1">
        <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
          <SignInPrompt title="Sign in to join the Mind Tournament" description="Your tournament score, practice days and graduation are saved to your account." />
        </div>
      </main>
    )
  }

  const res = await getTournamentSession({ slug })
  if (!res.success) {
    const { code, message } = res.error
    if (code === 'DECK_NOT_FOUND' || code === 'VALIDATION_FAILED') notFound()
    const graduated = code === 'TOURNAMENT_GRADUATED'
    const title =
      code === 'AUTH_FORBIDDEN'
        ? '🏆 You are the host'
        : code === 'TOURNAMENT_CLOSED'
          ? 'The tournament is closed'
          : graduated
            ? '🎓 Đỗ Trạng Nguyên!'
            : code === 'DRILL_NO_ITEMS'
              ? 'Nothing to drill yet 🌱'
              : code === 'DRILL_ALL_MASTERED'
                ? '🌳 All mastered'
                : 'The tournament is resting'
    return (
      <main className="mg-meadow-bg w-full flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
          <GamePanel tone={graduated ? 'gold' : 'parchment'} ribbon={graduated ? 'gold' : 'wood'} title={title}>
            <p className="text-center">{code === 'INTERNAL_ERROR' ? `${message}. Try again in a moment.` : `${message}.`}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <GameButton asChild tone={graduated ? 'sun' : 'wood'} size="lg">
                <Link href={`${treeHref}#tournament`}>📜 Leaderboard</Link>
              </GameButton>
              {code === 'AUTH_FORBIDDEN' && (
                <GameButton asChild tone="sky" size="lg">
                  <Link href={drillHref(slug)}>💧 Water your tree</Link>
                </GameButton>
              )}
            </div>
          </GamePanel>
        </div>
      </main>
    )
  }

  const { deck, sessionId } = res.data
  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <TournamentLiveBadge />
          <h1 className="font-game text-3xl leading-tight font-extrabold text-emerald-950 [text-shadow:0_2px_0_rgba(255,255,255,0.8)]">
            {deck.title}
          </h1>
          <p className="max-w-md text-sm font-medium text-emerald-900/70">
            Master every statement (5/5) in as few practice days as you can. This score is yours alone on the tournament board: it never
            changes your own garden.
          </p>
        </div>
        {/* A new round (after "Next round" refreshes) remounts the overlay with fresh state. */}
        <DrillOverlay key={sessionId} session={res.data} isSignedIn />
      </div>
    </main>
  )
}
