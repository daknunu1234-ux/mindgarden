'use client'

import { useId, useState, useTransition, type FormEvent } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent, GameInput, GameLabel } from '@/shared/components/game'
import { useToast } from '@/shared/stores/ToastProvider'
import { deleteDeck } from '../actions/deleteDeck'
import { matchesTreeName } from '../lib/confirmName'

type DeleteDeckDialogProps = {
  deckId: string
  deckTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Danger-zone confirmation: the gardener types the tree's name, then "Uproot Forever". On success
// the action redirects to the farm; the farewell toast lives in the root layout, so it rides along.
function DeleteDeckDialog({ deckId, deckTitle, open, onOpenChange }: DeleteDeckDialogProps) {
  return (
    <GameDialog open={open} onOpenChange={onOpenChange}>
      <GameDialogContent title="Uproot Tree? 🪓" ribbon="danger" tone="parchment">
        {/* Remount per open: the typed name and any error start fresh each time. */}
        {open && <UprootForm key={deckId} deckId={deckId} deckTitle={deckTitle} onCancel={() => onOpenChange(false)} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function UprootForm({ deckId, deckTitle, onCancel }: { deckId: string; deckTitle: string; onCancel: () => void }) {
  const { toast } = useToast()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputId = useId()
  const confirmed = matchesTreeName(typed, deckTitle)

  const uproot = (event: FormEvent) => {
    event.preventDefault()
    if (!confirmed || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        // Only failures come back: success redirects to the farm (see deleteDeck).
        const res = await deleteDeck({ deckId })
        if (!res.success) setError(`${res.error.message}.`)
      } catch (err) {
        // The success path arrives here as Next's redirect signal. Say goodbye, then hand the
        // redirect back to Next so it navigates.
        try {
          unstable_rethrow(err)
        } catch (redirectSignal) {
          toast({ message: `“${deckTitle}” was uprooted. Goodbye, little tree!`, icon: '🍂', tone: 'farewell' })
          throw redirectSignal
        }
        setError('We could not reach the garden. Check your connection and try again.')
      }
    })
  }

  return (
    <form onSubmit={uproot} className="space-y-5">
      <div className="flex items-start gap-3 rounded-[20px] border-[2.5px] border-[#f5a3a3] bg-gradient-to-b from-[#fff5f5] to-[#ffe1e1] p-3.5 text-sm text-[#7f1d1d] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_4px_0_#f08c8c]">
        <span aria-hidden className="text-3xl leading-none">
          ⚠️
        </span>
        <p>
          This will <strong>permanently</strong> remove <strong className="font-game text-base">“{deckTitle}”</strong>, all of its root
          concepts, statements, and your accumulated mastery XP. This can&apos;t be undone.
        </p>
      </div>

      <div>
        <GameLabel htmlFor={inputId}>
          Type <span className="rounded-md bg-[#7f1d1d]/10 px-1.5 py-0.5 text-[#7f1d1d]">{deckTitle}</span> to confirm
        </GameLabel>
        <GameInput
          id={inputId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={deckTitle}
          aria-describedby={error ? `${inputId}-error` : undefined}
          disabled={isPending}
        />
      </div>

      {error && (
        <p id={`${inputId}-error`} role="alert" className="rounded-xl bg-orange-100 px-3 py-2 text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
        <GameButton type="button" tone="wood" size="lg" className="flex-1" onClick={onCancel} disabled={isPending} autoFocus>
          Keep Tree 🌿
        </GameButton>
        <GameButton type="submit" tone="danger" size="lg" className="flex-1" disabled={!confirmed || isPending}>
          {isPending ? 'Uprooting…' : 'Uproot Forever 🪓'}
        </GameButton>
      </div>
    </form>
  )
}

// "Danger Zone" block for the owner's Tree Workshop: a crimson button that opens the dialog.
function DeckDangerZone({ deckId, deckTitle }: { deckId: string; deckTitle: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section
      aria-labelledby="danger-zone-heading"
      className="rounded-[24px] border-[3px] border-dashed border-[#f5a3a3] bg-[#7f1d1d]/25 p-4 shadow-[inset_0_3px_8px_rgba(0,0,0,0.2)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 id="danger-zone-heading" className="font-game text-lg font-extrabold text-[#ffe1e1] [text-shadow:0_2px_0_rgba(69,26,3,0.6)]">
            ⚠️ Danger Zone
          </h3>
          <p className="text-sm text-[#ffe9e0]/85">Uprooting removes this tree, its roots, statements and everyone&apos;s mastery on it.</p>
        </div>
        <GameButton type="button" tone="danger" onClick={() => setOpen(true)}>
          Uproot Tree 🪓
        </GameButton>
      </div>
      <DeleteDeckDialog deckId={deckId} deckTitle={deckTitle} open={open} onOpenChange={setOpen} />
    </section>
  )
}

export { DeckDangerZone, DeleteDeckDialog }
