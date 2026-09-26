'use client'

import { Kbd } from '@/shared/components/ui/kbd'
import { cn } from '@/shared/utils/cn'
import { shortcutKeyFor } from '../lib/shortcuts'
import type { DrillChoice } from '../types'

// idle → pending (picked, waiting) → correct (gold) / practice (amber) / muted (not involved)
export type ChoiceState = 'idle' | 'pending' | 'correct' | 'practice' | 'muted'

const STATE_CLASS: Record<ChoiceState, string> = {
  idle: 'border-border bg-card hover:border-emerald-300 hover:bg-emerald-50/50',
  pending: 'border-emerald-300 bg-emerald-50/50 animate-pulse',
  correct: 'border-yellow-500 bg-yellow-50',
  practice: 'border-amber-500 bg-amber-50',
  muted: 'border-border bg-card opacity-60',
}

type ChoiceButtonProps = {
  choice: DrillChoice
  state: ChoiceState
  disabled: boolean
  onSelect: (tag: DrillChoice['tag']) => void
}

function ChoiceButton({ choice, state, disabled, onSelect }: ChoiceButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(choice.tag)}
      disabled={disabled}
      aria-pressed={state !== 'idle' && state !== 'muted'}
      aria-keyshortcuts={`${shortcutKeyFor(choice.tag)} ${choice.tag}`}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors duration-200',
        'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default',
        STATE_CLASS[state],
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-semibold">
        {choice.tag}
      </span>
      <span className="flex-1 pt-0.5 whitespace-pre-wrap">{choice.text}</span>
      {/* Shortcut hint; hidden on small (usually touch) screens. */}
      <Kbd className="mt-0.5 hidden sm:inline-flex" aria-hidden>
        {shortcutKeyFor(choice.tag)}
      </Kbd>
    </button>
  )
}

export { ChoiceButton }
