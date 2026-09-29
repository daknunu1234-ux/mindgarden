'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameInput, GameLabel, GameTextarea } from '@/shared/components/game'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import { createDeck } from '../actions/createDeck'
import type { TreeTypeId } from '@/shared/lib/treeSkins'
import { TreeSpeciesPicker } from './TreeSpeciesPicker'

function CreateDeckForm() {
  const router = useRouter()
  const { open: openLogin } = useLoginDialog()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [treeType, setTreeType] = useState<TreeTypeId>('oak')
  const [isPublic, setIsPublic] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createDeck({ title, description, treeType, isPublic })
      if (res.success) {
        router.push(`/deck/${res.data.slug}`)
        return
      }
      if (res.error.code === 'AUTH_UNAUTHORIZED') openLogin()
      setError(res.error.message)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
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
            {isPublic ? '🌍 Public' : '🔒 Private'}
          </label>
          <p id="deck-public-hint" className="text-sm text-amber-900/65">
            {isPublic ? 'Anyone can find and practice this tree.' : 'Only you can see and practice this tree.'}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-orange-100 px-3 py-2 text-sm font-semibold text-amber-900">
          {error}.
        </p>
      )}

      <GameButton type="submit" tone="leaf" size="lg" disabled={isPending} className="w-full">
        {isPending ? 'Planting…' : 'Plant a Tree 🌱'}
      </GameButton>
    </form>
  )
}

export { CreateDeckForm }
