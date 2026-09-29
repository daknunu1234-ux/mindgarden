import Link from 'next/link'
import { GameButton, GamePanel } from '@/shared/components/game'

export default function DeckNotFound() {
  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6">
        <GamePanel tone="parchment" title="This tree hasn't been planted" className="text-center">
          <p aria-hidden className="text-5xl">
            🕳️
          </p>
          <p className="mt-3 text-amber-900/75">We couldn&apos;t find that deck. It may have been removed, or it&apos;s private.</p>
          <GameButton asChild tone="leaf" size="lg" className="mt-6">
            <Link href="/">Back to the garden</Link>
          </GameButton>
        </GamePanel>
      </div>
    </main>
  )
}
