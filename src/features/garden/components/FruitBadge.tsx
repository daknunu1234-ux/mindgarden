'use client'

import { useDisplayedFruit } from '@/shared/stores/FruitProvider'

// The header's 🍎 counter (beside the 🪙 coins): the island's harvested fruit, the newer of the
// layout's figure and the latest one a harvest reported this visit. Same pill as the coins (progress
// HeaderStats HEADER_PILL), not a button.
const PILL =
  'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border-2 border-black/25 bg-slate-900/55 px-2.5 font-game text-sm leading-none font-bold text-white tabular-nums shadow-[inset_0_2px_3px_rgba(0,0,0,0.35)]'

export function FruitBadge({ fruit, fruitAsOf }: { fruit: number; fruitAsOf: number }) {
  const shown = useDisplayedFruit(fruit, fruitAsOf) ?? 0
  return (
    <span
      role="status"
      className={PILL}
      aria-label={`Fruit: ${shown}`}
      title="Fruit from your harvests. A powered Candy Factory turns 10 fruits into 1 candy box"
      data-fruit={shown}
    >
      <span aria-hidden>🍎</span>
      {shown}
    </span>
  )
}
