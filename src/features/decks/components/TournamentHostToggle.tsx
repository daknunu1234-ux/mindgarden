'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/shared/utils/cn'
import { setTournamentOpen } from '../actions/setTournamentOpen'

type TournamentHostToggleProps = { deckId: string; isPublic: boolean; isOpen: boolean }

// Owner-only wooden switch: "🏆 Host Mind Tournament (Allow visitors to compete)". Needs a shared
// tree; closing it keeps the boards (graduates stay engraved).
function TournamentHostToggle({ deckId, isPublic, isOpen: initial }: TournamentHostToggleProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const locked = !isPublic && !isOpen

  const toggle = () => {
    const next = !isOpen
    setIsOpen(next) // optimistic; reverted on failure
    setError(null)
    startTransition(async () => {
      const res = await setTournamentOpen({ deckId, isOpen: next })
      if (!res.success) {
        setIsOpen(!next)
        setError(`${res.error.message}.`)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-[20px] border-[2.5px] border-[#e0a818] bg-gradient-to-b from-[#fffbea] to-[#ffe7a3] p-3.5 text-amber-950 shadow-[inset_0_2px_0_#fff,0_4px_0_#c28c0e]">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isOpen}
          aria-labelledby="deck-tournament-label"
          aria-describedby="deck-tournament-hint"
          onClick={toggle}
          disabled={isPending || locked}
          className={cn(
            'relative h-8 w-14 shrink-0 rounded-full border-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] transition-colors focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none disabled:opacity-60',
            isOpen ? 'border-amber-700 bg-amber-500' : 'border-stone-400 bg-stone-300',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 size-5 rounded-full border-2 border-white bg-gradient-to-b from-white to-stone-100 shadow-[0_2px_0_rgba(0,0,0,0.25)] transition-[left] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
              isOpen ? 'left-[26px]' : 'left-0.5',
            )}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p id="deck-tournament-label" className="font-game text-base font-extrabold">
            🏆 Host Mind Tournament (Allow visitors to compete)
          </p>
          <p id="deck-tournament-hint" className="text-sm text-amber-900/75">
            {locked
              ? 'Share the tree with the community first: only shared trees can host a tournament.'
              : isOpen
                ? 'Live: visitors race to master every statement in the fewest practice days. Their scores never touch your tree.'
                : 'Closed: nobody can join. The boards and the Hall of Fame stay visible.'}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}
    </div>
  )
}

export { TournamentHostToggle }
