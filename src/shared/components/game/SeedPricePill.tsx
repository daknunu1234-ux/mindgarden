import { seedPriceTag } from '@/shared/lib/economy'
import { cn } from '@/shared/utils/cn'

// A seed's price as a compact coin pill: the same tag on every seed card (planting form, Shop seed
// gallery). `coins` = the player's purse (null / undefined: unknown, never shown as short). A seed
// the purse can't pay turns the pill to the dimmed alert tone, with a tooltip saying what is missing.
// Server-safe.
function SeedPricePill({ price, coins, className }: { price: number; coins?: number | null; className?: string }) {
  const tag = seedPriceTag(price, coins)
  return (
    <span
      title={tag.title}
      data-price={price}
      data-short={tag.short ? 'true' : undefined}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border-2 px-1.5 font-game text-[11px] leading-4 font-extrabold whitespace-nowrap tabular-nums',
        tag.short
          ? 'border-red-300 bg-red-50 text-red-700 opacity-80'
          : 'border-[#8a4a0c] bg-gradient-to-b from-[#fffbe0] to-[#ffd76a] text-[#5a2a02] shadow-[0_1.5px_0_#8a4a0c]',
        className,
      )}
    >
      <span aria-hidden>🪙</span>
      <span className="sr-only">{tag.short ? 'Not enough coins: ' : 'Price: '}</span>
      {price}
    </span>
  )
}

export { SeedPricePill }
