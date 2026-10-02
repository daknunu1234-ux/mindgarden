import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GameButton, GamePanel } from '@/shared/components/game'
import { SignInPrompt } from '@/shared/components/SignInPrompt'
import { getCurrentUser } from '@/features/auth'
import { countDeckTree, getDeckBySlug } from '@/features/decks'
import { DailyRushArena, getDailyRushStatus } from '@/features/rush'

export const metadata: Metadata = { title: 'Daily Rush · MindGarden' }

// /deck/[slug]/rush: the day's one sudden-death run, on this tree. Rendering this page starts
// nothing (so a prefetch never uses up the day): the run begins when the player presses Start.
export default async function RushPage({ params }: PageProps<'/deck/[slug]/rush'>) {
  const { slug } = await params
  const [deckRes, userRes] = await Promise.all([getDeckBySlug({ slug }), getCurrentUser()])
  if (!deckRes.success) notFound()
  const { deck, tree } = deckRes.data
  const user = userRes.success ? userRes.data : null

  const shell = (body: React.ReactNode) => (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">{body}</div>
    </main>
  )

  if (!user) return shell(<SignInPrompt emoji="⚡" title="Sign in to play the Daily Rush" description="One run a day on one of your trees: every card in a row earns a coin." />)

  // Only the owner rushes a tree (visitors clone it first, like practice).
  if (deck.userId !== user.id) {
    return shell(
      <GamePanel tone="parchment" ribbon="leaf" title="🌿 Read-only tree">
        <p className="text-center">The Daily Rush is played on your own trees. Clone this one to your garden, or pick a tree on your farm.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <GameButton asChild tone="wood">
            <Link href={`/deck/${slug}`}>Explore the tree</Link>
          </GameButton>
          <GameButton asChild tone="leaf">
            <Link href="/">My farm</Link>
          </GameButton>
        </div>
      </GamePanel>,
    )
  }

  const statusRes = await getDailyRushStatus()
  const status = statusRes.success ? statusRes.data : null
  const statementCount = countDeckTree(tree).itemCount

  if (status?.playedToday) {
    const last = status.lastRun
    return shell(
      <GamePanel tone="parchment" ribbon="wood" title="⚡ See you tomorrow">
        <p className="text-center font-game text-lg font-extrabold text-amber-950">Today&apos;s Daily Rush is done.</p>
        {last && (
          <p className="mt-2 text-center text-sm font-semibold text-amber-900/80">
            🔥 {last.streak} in a row · +{last.coins} 🪙
          </p>
        )}
        <p className="mt-2 text-center text-sm text-amber-900/75">One run a day, on one tree. Come back tomorrow for the next one.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <GameButton asChild tone="sky" size="lg">
            <Link href={`/deck/${slug}/drill`}>💧 Water this tree</Link>
          </GameButton>
          <GameButton asChild tone="wood">
            <Link href="/">Back to the farm</Link>
          </GameButton>
        </div>
      </GamePanel>,
    )
  }

  if (statementCount === 0) {
    return shell(
      <GamePanel tone="parchment" ribbon="leaf" title="Nothing to rush through yet 🌱">
        <p className="text-center">This tree has no statements yet. Add some in its Workshop, or pick another tree for today&apos;s Daily Rush.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <GameButton asChild tone="leaf">
            <Link href={`/deck/${slug}#grow-heading`}>Open the Workshop</Link>
          </GameButton>
          <GameButton asChild tone="wood">
            <Link href="/">Back to the farm</Link>
          </GameButton>
        </div>
      </GamePanel>,
    )
  }

  return shell(<DailyRushArena deck={{ id: deck.id, slug: deck.slug, title: deck.title }} statementCount={statementCount} />)
}
