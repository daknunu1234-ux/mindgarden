'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameIcon, GameInput, GameLabel, GameTextarea } from '@/shared/components/game'
import { canAffordSeed, SEED_PRICE_COINS } from '@/shared/lib/economy'
import { useCoinShop } from '@/shared/stores/CoinShopProvider'
import { useCoins, useDisplayedCoins } from '@/shared/stores/CoinsProvider'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import { createDeck } from '../actions/createDeck'
import type { TreeTypeId } from '@/shared/lib/treeSkins'
import { TreeSpeciesPicker } from './TreeSpeciesPicker'

type CreateDeckFormProps = {
  // The player's purse from the server (null when unknown) and when it was read (epoch ms).
  coins: number | null
  coinsAsOf?: number
}

function CreateDeckForm({ coins: serverCoins, coinsAsOf }: CreateDeckFormProps) {
  const router = useRouter()
  const { open: openLogin } = useLoginDialog()
  const { open: openShop } = useCoinShop()
  const { setCoins } = useCoins()
  // Newest of the server's purse and any live update (a shop top-up while this page is open).
  const coins = useDisplayedCoins(serverCoins, coinsAsOf)
  const affordable = canAffordSeed(coins)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [treeType, setTreeType] = useState<TreeTypeId>('oak')
  // New trees start private; sharing is a choice (here, or later in the Tree Workshop).
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!affordable) return openShop()
    setError(null)
    startTransition(async () => {
      const res = await createDeck({ title, description, treeType, isPublic })
      if (res.success) {
        // The seed is paid: update the HUD purse right away, then go to the new tree.
        setCoins(res.data.remainingCoins)
        router.push(`/deck/${res.data.deck.slug}`)
        return
      }
      if (res.error.code === 'AUTH_UNAUTHORIZED') openLogin()
      setError(res.error.message)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <SeedPurse coins={coins} affordable={affordable} onGetCoins={openShop} />
      <div>
        <GameLabel htmlFor="deck-title">Name</GameLabel>
        <GameInput id="deck-title" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sinh học Tế bào" />
      </div>

      <div>
        <GameLabel htmlFor="deck-description">
          Description <span className="font-sans text-xs font-normal text-amber-900/60">(optional)</span>
        </GameLabel>
        <GameTextarea
          id="deck-description"
          maxLength={1000}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What will this tree help you remember?"
        />
      </div>

      <TreeSpeciesPicker value={treeType} onChange={setTreeType} />

      {/* Chunky toggle switch. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          id="deck-public"
          aria-checked={isPublic}
          aria-describedby="deck-public-hint"
          onClick={() => setIsPublic((v) => !v)}
          className={cn(
            'relative h-8 w-14 shrink-0 rounded-full border-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] transition-colors focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none',
            isPublic ? 'border-emerald-700 bg-emerald-500' : 'border-stone-400 bg-stone-300',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 size-5 rounded-full border-2 border-white bg-gradient-to-b from-white to-stone-100 shadow-[0_2px_0_rgba(0,0,0,0.25)] transition-[left] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
              isPublic ? 'left-[26px]' : 'left-0.5',
            )}
          />
        </button>
        <div>
          <label htmlFor="deck-public" className="font-game text-sm font-bold text-amber-950">
            {isPublic ? '🌐 Shared with the community' : '🔒 Private'}
          </label>
          <p id="deck-public-hint" className="text-sm text-amber-900/65">
            {isPublic
              ? 'Other gardeners can find it in Community Gardens and visit it read-only.'
              : 'Only you can see and practice this tree. You can share it later.'}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-orange-100 px-3 py-2 text-sm font-semibold text-amber-900">
          {/[.!?]$/.test(error) ? error : `${error}.`}
        </p>
      )}

      <GameButton type="submit" tone="leaf" size="lg" disabled={isPending || !affordable} className="w-full">
        {isPending ? 'Planting…' : `Plant a Tree 🌱 · ${SEED_PRICE_COINS} 🪙`}
      </GameButton>
    </form>
  )
}

// "Seed Cost: 100 🪙 · Your Purse: X 🪙": a wooden price tag above the form. When the purse is
// short, a bouncy "Get More Coins" opens the Coin Shop.
function SeedPurse({ coins, affordable, onGetCoins }: { coins: number | null; affordable: boolean; onGetCoins: () => void }) {
  return (
    <div className="rounded-[20px] border-[3px] border-[#c9955e] bg-gradient-to-b from-[#fffcf3] to-[#f7e2bd] p-3 shadow-[inset_0_2px_0_#fff,0_4px_0_#b07a45]">
      <dl className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-game font-extrabold text-[#4a2511]">
        <div className="flex items-center gap-2">
          <dt className="text-sm text-[#8a5a2b]">Seed Cost:</dt>
          <dd className="flex items-center gap-1 text-xl tabular-nums">
            {SEED_PRICE_COINS} <GameIcon name="coin" className="size-6" />
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-sm text-[#8a5a2b]">Your Purse:</dt>
          <dd className={cn('flex items-center gap-1 text-xl tabular-nums', !affordable && 'text-[#b91c1c]')}>
            {coins ?? '–'} <GameIcon name="coin" className="size-6" />
          </dd>
        </div>
      </dl>
      {!affordable && (
        <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <p role="status" className="text-sm font-semibold text-amber-900">
            {coins === null
              ? 'We could not read your purse right now.'
              : `You need ${SEED_PRICE_COINS - coins} more 🪙 for a seed. Master statements (5/5) to earn coins, or visit the shop.`}
          </p>
          <GameButton type="button" tone="wood" className="mg-bob" onClick={onGetCoins}>
            Get More Coins 🪙
          </GameButton>
        </div>
      )}
    </div>
  )
}

export { CreateDeckForm }
