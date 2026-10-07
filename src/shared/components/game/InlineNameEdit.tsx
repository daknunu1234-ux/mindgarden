'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { finishNameEdit, nameEditKey, TREE_NAME_MAX } from '@/shared/lib/treeName'
import { cn } from '@/shared/utils/cn'

type InlineNameEditProps = {
  // The current name (shown, and the starting text of an edit).
  value: string
  // Called with the cleaned, valid, changed name (Enter or clicking away). The caller saves it
  // optimistically; nothing is called when the name didn't change.
  onSave: (name: string) => void
  // What is being named, for screen readers: "Rename tree".
  label?: string
  // Renders the name (e.g. inside an <h1>); defaults to a span with `textClassName`.
  renderName?: (name: ReactNode) => ReactNode
  textClassName?: string
  inputClassName?: string
  className?: string
  // Tone of the ✏️ button: light backgrounds (default) or a dark panel.
  tone?: 'light' | 'dark'
}

// A name with a ✏️ beside it that turns into a text field in place (tree names: the deck page
// header, the Tree Workshop, the farm's tree popover). Enter or clicking away saves; Esc puts the old
// name back; an empty or over-long name stays in the field with the reason under it
// (shared/lib/treeName). Double-clicking the name edits it too.
export function InlineNameEdit({ value, onSave, label = 'Rename', renderName, textClassName, inputClassName, className, tone = 'light' }: InlineNameEditProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Esc / Enter end the edit before the field blurs: the blur that follows must not save again.
  const ended = useRef(false)
  const errorId = useId()

  const start = () => {
    ended.current = false
    setError(null)
    setDraft(value)
  }
  const cancel = () => {
    ended.current = true
    setError(null)
    setDraft(null)
  }
  // Enter keeps the field open on an invalid name (with the reason); clicking away puts the old
  // name back instead (nothing invalid is ever saved).
  const finish = (how: 'enter' | 'blur') => {
    if (draft === null || ended.current) return
    const outcome = finishNameEdit(value, draft)
    if (outcome.kind === 'invalid') {
      if (how === 'enter') return setError(outcome.error)
      return cancel()
    }
    ended.current = true
    setDraft(null)
    setError(null)
    if (outcome.kind === 'save') onSave(outcome.name)
  }

  if (draft !== null) {
    return (
      <span className={cn('inline-flex min-w-0 flex-col', className)}>
        <input
          // A field shown because the player asked to edit: focusing it is what they expect.
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={draft}
          maxLength={TREE_NAME_MAX + 20}
          aria-label={label}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            const command = nameEditKey(e.nativeEvent)
            if (!command) return
            e.preventDefault()
            e.stopPropagation()
            if (command === 'save') finish('enter')
            else cancel()
          }}
          onBlur={() => finish('blur')}
          className={cn(
            'w-full min-w-0 rounded-lg border-2 border-emerald-500 bg-white px-2 py-0.5 text-amber-950 shadow-[0_0_0_3px_rgba(16,185,129,0.18)] outline-none',
            error && 'border-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.18)]',
            inputClassName,
          )}
        />
        {error && (
          <span id={errorId} role="alert" className="mt-1 text-xs font-semibold text-rose-700">
            {error}
          </span>
        )}
      </span>
    )
  }

  const name = (
    <span className={textClassName} onDoubleClick={start} title="Double-click to rename">
      {value}
    </span>
  )
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {renderName ? renderName(name) : name}
      <button
        type="button"
        onClick={start}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:ring-3 focus-visible:ring-yellow-300 focus-visible:outline-none',
          tone === 'dark' ? 'border-amber-100/40 text-amber-50 hover:bg-white/15' : 'border-amber-800/25 bg-white/70 text-amber-900 hover:bg-amber-100',
        )}
      >
        <Pencil aria-hidden className="size-3.5" strokeWidth={2.5} />
      </button>
    </span>
  )
}
