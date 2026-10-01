'use client'

import { SEED_PRICE_COINS } from '@/shared/lib/economy'
import { useCoinShop } from '@/shared/stores/CoinShopProvider'
import { useDisplayedCoins } from '@/shared/stores/CoinsProvider'

// Compact value pill for the wooden header (shared look with StreakBadge).
export const HEADER_PILL =
  'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border-2 border-black/25 bg-slate-900/55 px-2.5 font-game text-sm leading-none font-bold text-white tabular-nums shadow-[inset_0_2px_3px_rgba(0,0,0,0.35)] transition-colors hover:bg-slate-900/70 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none'

// Header 🪙 balance: the newer of the layout's figure and the latest one an action reported this
// visit (a mastered statement, a streak bonus, a seed, a Shop item). Opens the Coin Shop.
function CoinsBadge({ coins, coinsAsOf }: { coins: number; coinsAsOf: number }) {
  const shown = useDisplayedCoins(coins, coinsAsOf) ?? 0
  const { open } = useCoinShop()
  return (
    <button
      type="button"
      onClick={open}
      className={HEADER_PILL}
      aria-label={`Gold coins: ${shown}. Open the Coin Shop`}
      title={`Tree seeds cost from ${SEED_PRICE_COINS} coins. Earn 1 the first time you master a statement (5/5). Click for the Coin Shop`}
    >
      <span aria-hidden>🪙</span>
      {shown}
    </button>
  )
}

export { CoinsBadge }
