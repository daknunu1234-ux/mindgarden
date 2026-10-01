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

  const hint = locked
    ? 'Share the tree with the community first: only shared trees can host a tournament.'
    : isOpen
      ? 'Live: visitors race to master every statement in the fewest practice days. Their scores never touch your tree.'
      : 'Closed: nobody can join. The boards and the Hall of Fame stay visible.'

  // A compact pill for the Tree Workshop's settings bar; the full explanation is the tooltip.
  return (
    <div className="min-w-0 text-amber-950">
      <div className="flex flex-wrap items-center gap-2" title={hint}>
        <button
          type="button"
          role="switch"
          aria-checked={isOpen}
          aria-labelledby="deck-tournament-label"
          aria-describedby="deck-tournament-hint"
          onClick={toggle}
          disabled={isPending || locked}
          className={cn(
            'relative h-6 w-10 shrink-0 rounded-full border-2 shadow-[inset_0_2px_3px_rgba(0,0,0,0.2)] transition-colors focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none disabled:opacity-60',
            isOpen ? 'border-amber-700 bg-amber-500' : 'border-stone-400 bg-stone-300',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 size-4 rounded-full bg-white shadow-[0_1px_0_rgba(0,0,0,0.25)] transition-[left] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
              isOpen ? 'left-[18px]' : 'left-0.5',
            )}
          />
        </button>
        <p id="deck-tournament-label" className="font-game text-xs font-bold">
          🏆 Tournament<span className="sr-only">: host a Mind Tournament (allow visitors to compete)</span>
        </p>
        <span className={cn('rounded-full px-1.5 text-[10px] leading-4 font-bold', isOpen ? 'bg-amber-200 text-amber-950' : 'bg-stone-200 text-stone-700')}>
          {locked ? 'Share first' : isOpen ? 'Live' : 'Closed'}
        </span>
        <span id="deck-tournament-hint" className="sr-only">
          {hint}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-amber-900">
          {error}
        </p>
      )}
    </div>
  )
}

export { TournamentHostToggle }
