'use client'

import { useState, useTransition } from 'react'
import { COIN_PACKAGES, formatVnd, packageSavingsPercent, SEED_PRICE_COINS, type CoinPackage } from '@/shared/lib/economy'
import { useCoinShop } from '@/shared/stores/CoinShopProvider'
import { useCoins } from '@/shared/stores/CoinsProvider'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import type { ActionResult } from '@/shared/types/result'
import { cn } from '@/shared/utils/cn'
import { GameButton } from './GameButton'
import { GameDialog, GameDialogContent } from './GameDialog'
import { GameIcon } from './GameIcon'
import { ParticleBurst } from './ParticleBurst'

type TopUp = (input: { packageId: CoinPackage['id'] }) => Promise<ActionResult<{ coinsAdded: number; totalCoins: number }>>

type CoinShopModalProps = {
  signedIn: boolean
  // Development only: a Server Action that credits the package without payment. Null in production.
  simulateTopUp: TopUp | null
}

// 🪙 Coin Shop: four packages priced in VND. Real payments are a later milestone; until then a
// dev-only "Simulate Top-up" credits the picked package, bursts gold and updates the HUD live.
function CoinShopModal({ signedIn, simulateTopUp }: CoinShopModalProps) {
  const { isOpen, setOpen } = useCoinShop()
  return (
    <GameDialog open={isOpen} onOpenChange={setOpen}>
      <GameDialogContent title="🪙 Coin Shop" ribbon="gold" tone="parchment" size="lg" description={`Coins buy tree seeds: ${SEED_PRICE_COINS} 🪙 plants one new tree.`}>
        {isOpen && <ShopBody signedIn={signedIn} simulateTopUp={simulateTopUp} onDone={() => setOpen(false)} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function ShopBody({ signedIn, simulateTopUp, onDone }: CoinShopModalProps & { onDone: () => void }) {
  const { setCoins } = useCoins()
  const { open: openLogin } = useLoginDialog()
  const onSignIn = () => {
    onDone()
    openLogin()
  }
  const [selected, setSelected] = useState<CoinPackage['id']>('coins-100')
  const [result, setResult] = useState<{ tone: 'gold' | 'amber'; text: string; burst?: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const pack = COIN_PACKAGES.find((p) => p.id === selected) ?? COIN_PACKAGES[0]

  const topUp = () => {
    if (!simulateTopUp) return
    setResult(null)
    startTransition(async () => {
      const res = await simulateTopUp({ packageId: selected })
      if (!res.success) {
        setResult({ tone: 'amber', text: `${res.error.message}.` })
        return
      }
      setCoins(res.data.totalCoins)
      setResult({ tone: 'gold', text: `+${res.data.coinsAdded} 🪙 added! Your purse: ${res.data.totalCoins} 🪙`, burst: Date.now() })
    })
  }

  return (
    <div className="space-y-5">
      <ul role="radiogroup" aria-label="Coin packages" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COIN_PACKAGES.map((p) => {
          const picked = p.id === selected
          const save = packageSavingsPercent(p)
          return (
            <li key={p.id}>
              <button
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => setSelected(p.id)}
                className={cn(
                  'relative flex h-full w-full flex-col items-center gap-1 rounded-[20px] border-[3px] px-2 pt-5 pb-3 text-center font-game transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none',
                  picked
                    ? 'mg-spring -translate-y-1 border-[#d69e12] bg-gradient-to-b from-[#fffdf0] to-[#ffe28a] shadow-[inset_0_2px_0_#fff,0_6px_0_#b7830c,0_0_22px_rgba(250,204,21,0.5)]'
                    : 'border-[#dcb98c] bg-gradient-to-b from-white to-[#fff6e6] shadow-[inset_0_2px_0_#fff,0_4px_0_#d2ac7c] hover:-translate-y-0.5',
                )}
              >
                {(p.bestValue || save > 0) && (
                  <span
                    className={cn(
                      'absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border-2 px-2 py-0.5 text-[10px] leading-none font-extrabold whitespace-nowrap text-white shadow-[0_2px_0_rgba(0,0,0,0.25)]',
                      p.bestValue ? 'border-[#8a1033] bg-gradient-to-b from-[#fb7185] to-[#e11d48]' : 'border-[#0b5c2e] bg-gradient-to-b from-[#4fd86b] to-[#16a34a]',
                    )}
                  >
                    {p.bestValue ? `Best Value · Save ${save}%` : `Save ${save}%`}
                  </span>
                )}
                <GameIcon name="coin" className={p.coins >= 100 ? 'size-10' : p.coins >= 50 ? 'size-9' : 'size-8'} />
                <span className="text-2xl leading-none font-extrabold text-[#5a2a02] tabular-nums">{p.coins} 🪙</span>
                {p.bonus && <span className="text-xs font-bold text-emerald-800">{p.bonus}</span>}
                <span className="mt-1 rounded-full bg-[#4a2511]/10 px-2 py-0.5 text-sm font-extrabold text-[#4a2511] tabular-nums">{formatVnd(p.priceVnd)}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {result && (
        <p
          role="status"
          className={cn(
            'relative rounded-xl px-3 py-2 text-center font-game text-base font-extrabold',
            result.tone === 'gold' ? 'mg-spring bg-gradient-to-b from-[#fff7ae] to-[#fcd34d] text-[#5a2a02]' : 'bg-orange-100 text-amber-900',
          )}
        >
          {result.burst && <ParticleBurst key={result.burst} variant="gold" count={24} radius={160} />}
          {result.text}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!signedIn ? (
          <GameButton tone="leaf" size="lg" className="flex-1" onClick={onSignIn}>
            Sign in to top up
          </GameButton>
        ) : simulateTopUp ? (
          <GameButton tone="sun" size="lg" className="flex-1" onClick={topUp} disabled={isPending}>
            {isPending ? 'Adding coins…' : `Simulate Top-up (Dev Mode) · +${pack.coins} 🪙`}
          </GameButton>
        ) : (
          <GameButton tone="sun" size="lg" className="flex-1" disabled>
            Payments coming soon · {formatVnd(pack.priceVnd)}
          </GameButton>
        )}
        <GameButton tone="wood" size="lg" onClick={onDone}>
          Close
        </GameButton>
      </div>
      <p className="text-center text-xs text-amber-900/60">
        {simulateTopUp
          ? '🛠️ Development build: no real payment is taken. Coins are added for testing only.'
          : 'You can also earn 🪙 by mastering statements (5/5): 1 coin each, once per statement.'}
      </p>
    </div>
  )
}

export { CoinShopModal }
