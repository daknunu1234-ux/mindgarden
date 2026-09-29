'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent, GameIcon } from '@/shared/components/game'
import { cloneCost } from '@/shared/lib/economy'
import { useCoinShop } from '@/shared/stores/CoinShopProvider'
import { useCoins, useDisplayedCoins } from '@/shared/stores/CoinsProvider'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { useToast } from '@/shared/stores/ToastProvider'
import { cn } from '@/shared/utils/cn'
import { cloneDeck } from '../actions/cloneDeck'

type CloneTreeButtonProps = {
  deckId: string
  deckTitle: string
  statementCount: number
  // The visitor's purse from the server (null when signed out or unknown) and when it was read.
  coins: number | null
  coinsAsOf?: number
  signedIn: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// "🌱 Clone Tree (N 🪙)": the only way for a visitor to practise someone else's shared tree.
// Opens a confirm dialog with the fee (min(100 + statements, 150), cloneCost) and the purse; a short
// purse offers the Coin Shop, a signed-out visitor gets the sign-in dialog. On success the HUD purse
// updates and the player lands on their own copy, where editing and practice are unlocked.
function CloneTreeButton({ deckId, deckTitle, statementCount, coins: serverCoins, coinsAsOf, signedIn, size = 'md', className }: CloneTreeButtonProps) {
  const { open: openLogin } = useLoginDialog()
  const [open, setOpen] = useState(false)
  const cost = cloneCost(statementCount)

  return (
    <>
      <GameButton
        type="button"
        tone="leaf"
        size={size}
        className={className}
        onClick={() => (signedIn ? setOpen(true) : openLogin())}
      >
        🌱 Clone Tree ({cost} 🪙)
      </GameButton>
      <GameDialog open={open} onOpenChange={setOpen}>
        <GameDialogContent title="Clone this tree? 🌱" ribbon="leaf" tone="parchment">
          {/* Remount per open: the error starts fresh each time. */}
          {open && (
            <CloneForm
              deckId={deckId}
              deckTitle={deckTitle}
              statementCount={statementCount}
              cost={cost}
              serverCoins={serverCoins}
              coinsAsOf={coinsAsOf}
              onCancel={() => setOpen(false)}
            />
          )}
        </GameDialogContent>
      </GameDialog>
    </>
  )
}

type CloneFormProps = {
  deckId: string
  deckTitle: string
  statementCount: number
  cost: number
  serverCoins: number | null
  coinsAsOf?: number
  onCancel: () => void
}

function CloneForm({ deckId, deckTitle, statementCount, cost, serverCoins, coinsAsOf, onCancel }: CloneFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { open: openShop } = useCoinShop()
  const { open: openLogin } = useLoginDialog()
  const { setCoins } = useCoins()
  const coins = useDisplayedCoins(serverCoins, coinsAsOf)
  // Unknown purse: let the server decide (it answers INSUFFICIENT_COINS if short).
  const affordable = coins === null || coins >= cost
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const clone = () => {
    if (!affordable) return openShop()
    setError(null)
    startTransition(async () => {
      const res = await cloneDeck({ deckId })
      if (res.success) {
        setCoins(res.data.remainingCoins)
        toast({ message: `“${deckTitle}” was planted in your garden. Time to practise!`, icon: '🌱', tone: 'leaf' })
        router.push(`/deck/${res.data.deck.slug}`)
        return
      }
      if (res.error.code === 'AUTH_UNAUTHORIZED') openLogin()
      setError(/[.!?]$/.test(res.error.message) ? res.error.message : `${res.error.message}.`)
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-amber-900/80">
        A private copy of <strong className="font-game text-base text-amber-950">“{deckTitle}”</strong> with all its roots and{' '}
        {statementCount} {statementCount === 1 ? 'statement' : 'statements'} grows in your garden. You can edit it and practise it from
        0/5.
      </p>

      <div className="rounded-[20px] border-[3px] border-[#c9955e] bg-gradient-to-b from-[#fffcf3] to-[#f7e2bd] p-3 shadow-[inset_0_2px_0_#fff,0_4px_0_#b07a45]">
        <dl className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-game font-extrabold text-[#4a2511]">
          <div className="flex items-center gap-2">
            <dt className="text-sm text-[#8a5a2b]">Clone Cost:</dt>
            <dd className="flex items-center gap-1 text-xl tabular-nums">
              {cost} <GameIcon name="coin" className="size-6" />
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-sm text-[#8a5a2b]">Your Purse:</dt>
            <dd className={cn('flex items-center gap-1 text-xl tabular-nums', !affordable && 'text-[#b91c1c]')}>
              {coins ?? '–'} <GameIcon name="coin" className="size-6" />
            </dd>
          </div>
        </dl>
        {!affordable && coins !== null && (
          <p role="status" className="mt-2 text-center text-sm font-semibold text-amber-900">
            You need {cost - coins} more 🪙. Master statements (5/5) in your own trees to earn coins, or visit the shop.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-orange-100 px-3 py-2 text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <GameButton type="button" tone="cream" onClick={onCancel} disabled={isPending}>
          Keep exploring
        </GameButton>
        {affordable ? (
          <GameButton type="button" tone="leaf" onClick={clone} disabled={isPending}>
            {isPending ? 'Planting your copy…' : `🌱 Clone for ${cost} 🪙`}
          </GameButton>
        ) : (
          <GameButton type="button" tone="wood" className="mg-bob" onClick={openShop}>
            Get More Coins 🪙
          </GameButton>
        )}
      </div>
    </div>
  )
}

export { CloneTreeButton }
