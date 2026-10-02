import { coinBonusLabel } from '@/shared/lib/economy'
import { cn } from '@/shared/utils/cn'

// The "⭐ 1.5x Coins" tag of a special tree (a 180 🪙 species: every statement mastered on it pays
// ×1.5). The same tag wherever such a tree is offered or shown: seed cards, the tree popover, the
// practice round's coin plaque. `compact` drops the word "Coins" for tight spots. Server-safe.
function CoinBonusTag({ multiplier, compact = false, className }: { multiplier: number; compact?: boolean; className?: string }) {
  if (!(multiplier > 1)) return null
  const label = coinBonusLabel(multiplier)
  return (
    <span
      data-coin-bonus={multiplier}
      title={`${label}: every statement you master on this tree pays ×${multiplier} 🪙`}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border-2 border-[#7c3aed] bg-gradient-to-b from-[#f5efff] to-[#dccbff] px-1.5 font-game text-[11px] leading-4 font-extrabold whitespace-nowrap text-[#4c1d95] shadow-[0_1.5px_0_#7c3aed]',
        className,
      )}
    >
      <span aria-hidden>⭐</span>
      {compact ? `${multiplier}x` : label}
    </span>
  )
}

export { CoinBonusTag }
