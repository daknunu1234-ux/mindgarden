'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/shared/utils/cn'
import { updateDeck } from '../actions/updateDeck'

type DeckShareToggleProps = { deckId: string; slug: string; isPublic: boolean }

// Owner-only: "Share tree with community (Public link) 🌐". Anyone with the link can open a public
// tree read-only (and it joins their Visited Gardens drawer); private trees are yours alone.
function DeckShareToggle({ deckId, slug, isPublic: initial }: DeckShareToggleProps) {
  const router = useRouter()
  const [isPublic, setIsPublic] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const toggle = () => {
    const next = !isPublic
    setIsPublic(next) // optimistic; reverted on failure
    setError(null)
    startTransition(async () => {
      const res = await updateDeck({ deckId, isPublic: next })
      if (!res.success) {
        setIsPublic(!next)
        setError(`${res.error.message}.`)
        return
      }
      router.refresh()
    })
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/deck/${slug}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy the link: copy it from the address bar instead.')
    }
  }

  const hint = isPublic
    ? 'Shared: anyone with the link can open it read-only and clone it to practise.'
    : 'Private: only you can see and practise this tree.'

  // A compact pill for the Tree Workshop's settings bar; the full explanation is the tooltip.
  return (
    <div className="min-w-0 text-emerald-950">
      <div className="flex flex-wrap items-center gap-2" title={hint}>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-labelledby="deck-share-label"
          aria-describedby="deck-share-hint"
          onClick={toggle}
          disabled={isPending}
          className={cn(
            'relative h-6 w-10 shrink-0 rounded-full border-2 shadow-[inset_0_2px_3px_rgba(0,0,0,0.2)] transition-colors focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none disabled:opacity-60',
            isPublic ? 'border-emerald-700 bg-emerald-500' : 'border-stone-400 bg-stone-300',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 size-4 rounded-full bg-white shadow-[0_1px_0_rgba(0,0,0,0.25)] transition-[left] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
              isPublic ? 'left-[18px]' : 'left-0.5',
            )}
          />
        </button>
        <p id="deck-share-label" className="font-game text-xs font-bold">
          🌐 Share<span className="sr-only"> tree with community (Public link)</span>
        </p>
        <span className={cn('rounded-full px-1.5 text-[10px] leading-4 font-bold', isPublic ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-200 text-stone-700')}>
          {isPublic ? 'Public' : 'Private'}
        </span>
        <span id="deck-share-hint" className="sr-only">
          {hint}
        </span>
        {isPublic && (
          <button
            type="button"
            onClick={copyLink}
            className="rounded-full border-2 border-emerald-700/30 bg-white px-2 text-[11px] leading-5 font-bold text-emerald-900 hover:bg-emerald-50 focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none"
          >
            {copied ? 'Copied! ✓' : '🔗 Copy link'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-amber-900">
          {error}
        </p>
      )}
    </div>
  )
}

export { DeckShareToggle }
