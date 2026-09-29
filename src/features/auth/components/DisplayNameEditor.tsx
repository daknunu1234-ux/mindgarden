'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameInput } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { updateDisplayName } from '../actions/updateDisplayName'
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, displayNameLength, sanitizeDisplayName } from '../lib/displayName'

type DisplayNameEditorProps = {
  // The chosen name, or null when the player still goes by their pseudonym.
  current: string | null
  // What everyone sees without a chosen name ("Mossy Owl").
  fallback: string
  // 'card': the labelled field on the profile. 'inline': a ✏️ next to your own leaderboard row.
  variant?: 'card' | 'inline'
  className?: string
}

// "Garden Name": the public name on tournament boards, other gardeners' Visited Gardens,
// the visitor banner and the header. Saving refreshes the page data, so every board and the header
// show the new name without a reload.
function DisplayNameEditor({ current, fallback, variant = 'card', className }: DisplayNameEditorProps) {
  const router = useRouter()
  const inputId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const shown = saved ?? current
  const clean = sanitizeDisplayName(draft)
  const length = displayNameLength(clean)
  const valid = length >= DISPLAY_NAME_MIN && length <= DISPLAY_NAME_MAX

  const open = () => {
    setDraft(shown ?? '')
    setError(null)
    setEditing(true)
  }

  const save = () => {
    if (!valid || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await updateDisplayName({ displayName: draft })
      if (!res.success) {
        setError(`${res.error.message}.`)
        return
      }
      setSaved(res.data.displayName)
      setEditing(false)
      router.refresh()
    })
  }

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <GameInput
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder={fallback}
          maxLength={60}
          autoFocus
          autoComplete="nickname"
          aria-label="Garden name"
          aria-invalid={draft !== '' && !valid}
          aria-describedby={`${inputId}-hint`}
          className={cn('min-w-0 flex-1', variant === 'inline' && 'h-9 text-sm')}
        />
        <GameButton type="submit" tone="leaf" size="sm" disabled={!valid || isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </GameButton>
        <GameButton type="button" tone="cream" size="sm" onClick={() => setEditing(false)} disabled={isPending}>
          Cancel
        </GameButton>
      </div>
      <p id={`${inputId}-hint`} className={cn('text-xs font-semibold tabular-nums', error ? 'text-amber-900' : 'text-amber-900/65')} role={error ? 'alert' : undefined}>
        {error ?? `${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} characters · ${length}/${DISPLAY_NAME_MAX}${clean !== draft.trim() && clean ? ` · saved as “${clean}”` : ''}`}
      </p>
    </form>
  )

  if (variant === 'inline') {
    return editing ? (
      <div className={cn('w-full', className)}>{form}</div>
    ) : (
      <button
        type="button"
        onClick={open}
        aria-label="Edit your garden name"
        title="Edit your garden name"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-xs hover:bg-amber-100 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none',
          className,
        )}
      >
        ✏️
      </button>
    )
  }

  return (
    <section
      aria-label="Garden name"
      className={cn(
        'rounded-[20px] border-[2.5px] border-[#dcb98c] bg-gradient-to-b from-white to-[#fff6e6] p-4 text-amber-950 shadow-[inset_0_2px_0_#fff,0_4px_0_#d2ac7c]',
        className,
      )}
    >
      <p className="font-game text-sm font-extrabold tracking-wide text-amber-900/75 uppercase">🏡 Garden Name</p>
      {editing ? (
        <div className="mt-2">{form}</div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 truncate font-game text-2xl font-extrabold">{shown ?? fallback}</p>
          <GameButton type="button" tone="cream" size="sm" onClick={open}>
            ✏️ {shown ? 'Edit' : 'Choose a name'}
          </GameButton>
        </div>
      )}
      <p className="mt-2 text-xs text-amber-900/65">
        {shown
          ? 'Shown on tournament boards, in other gardeners’ Visited Gardens and when they visit your trees.'
          : `Until you choose one, other gardeners see you as “${fallback}”.`}{' '}
        Your email stays private.
      </p>
    </section>
  )
}

export { DisplayNameEditor }
