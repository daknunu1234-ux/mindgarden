import { Skeleton } from '@/shared/components/ui/skeleton'
import type { DeckCardView } from '../types'
import { TreeCard } from './TreeCard'

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'

type GardenGridProps = { decks: DeckCardView[] }

function GardenGrid({ decks }: GardenGridProps) {
  if (decks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-16 text-center">
        <p aria-hidden className="text-4xl">🌱</p>
        <p className="mt-3 font-medium">No trees planted yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Public decks will grow here as soon as someone plants one.
        </p>
      </div>
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
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  )
}

export { GardenGrid, GardenGridSkeleton }
