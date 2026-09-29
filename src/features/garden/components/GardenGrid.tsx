import Link from 'next/link'
import { GameButton, GamePanel } from '@/shared/components/game'
import { Skeleton } from '@/shared/components/ui/skeleton'
import type { DeckCardView } from '../types'
import { TreeCard } from './TreeCard'

const GRID = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'

type GardenGridProps = { decks: DeckCardView[] }

function GardenGrid({ decks }: GardenGridProps) {
  if (decks.length === 0) {
    return (
      <GamePanel tone="parchment" ribbon="leaf" title="No trees planted yet" className="text-center">
        <p aria-hidden className="text-5xl">
          🌱
        </p>
        <p className="mt-3 text-amber-900/75">Your own trees grow here. Shared trees you have opened wait in Visited Gardens on the farm.</p>
        <GameButton asChild tone="leaf" size="lg" className="mt-6">
          <Link href="/deck/new">Plant a Tree 🌱</Link>
        </GameButton>
      </GamePanel>
    )
  }

  return (
    <ul className={GRID}>
      {decks.map((deck) => (
        <li key={deck.id}>
          <TreeCard deck={deck} />
        </li>
      ))}
    </ul>
  )
}

function GardenGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={GRID} aria-busy aria-label="Loading decks">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-60 rounded-[24px] bg-amber-100/80" />
      ))}
    </div>
  )
}

export { GardenGrid, GardenGridSkeleton }
