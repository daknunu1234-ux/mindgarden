'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton } from '@/shared/components/game'
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

  return (
    <div className="rounded-[20px] border-[2.5px] border-[#6cc48a] bg-gradient-to-b from-[#f4fdee] to-[#dcf7cb] p-3.5 text-emerald-950 shadow-[inset_0_2px_0_#fff,0_4px_0_#4fa56d]">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-labelledby="deck-share-label"
          onClick={toggle}
          disabled={isPending}
          className={cn(
            'relative h-8 w-14 shrink-0 rounded-full border-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] transition-colors focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none disabled:opacity-60',
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
        <div className="min-w-0 flex-1">
          <p id="deck-share-label" className="font-game text-base font-extrabold">
            Share tree with community (Public link) 🌐
          </p>
          <p className="text-sm text-emerald-900/70">
            {isPublic
              ? 'Shared: anyone with the link can open it read-only and clone it to practise.'
              : 'Private: only you can see and practise this tree.'}
          </p>
        </div>
        {isPublic && (
          <GameButton type="button" tone="cream" size="sm" onClick={copyLink}>
            {copied ? 'Copied! ✓' : '🔗 Copy link'}
          </GameButton>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}
    </div>
  )
}

export { DeckShareToggle }
