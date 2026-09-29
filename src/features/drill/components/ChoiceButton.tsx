'use client'

import { KeyChip } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import { shortcutKeyFor } from '../lib/shortcuts'
import type { DrillChoice } from '../types'

// idle → pending (picked, waiting) → correct (gold) / practice (amber) / muted (not involved)
export type ChoiceState = 'idle' | 'pending' | 'correct' | 'practice' | 'muted'

// Tactile slabs: a raised card with a bevel lip that sinks when pressed.
const STATE_CLASS: Record<ChoiceState, string> = {
  idle: 'border-amber-900/20 bg-gradient-to-b from-white to-amber-50 shadow-[0_5px_0_rgba(120,53,15,0.25),0_10px_18px_rgba(120,53,15,0.1)] enabled:hover:-translate-y-1 enabled:hover:border-emerald-400 enabled:hover:shadow-[0_7px_0_rgba(4,120,87,0.35),0_14px_22px_rgba(4,120,87,0.15)] enabled:active:translate-y-[4px] enabled:active:shadow-[0_1px_0_rgba(120,53,15,0.25)]',
  pending: 'mg-spring translate-y-[2px] border-emerald-400 bg-gradient-to-b from-emerald-50 to-lime-50 shadow-[0_3px_0_rgba(4,120,87,0.35)]',
  correct: 'mg-spring border-yellow-400 bg-gradient-to-b from-yellow-50 to-amber-100 shadow-[0_5px_0_#ca8a04,0_0_26px_rgba(250,204,21,0.55)]',
  practice: 'mg-wobble border-amber-400 bg-gradient-to-b from-orange-50 to-amber-100 shadow-[0_5px_0_rgba(217,119,6,0.55)]',
  muted: 'border-amber-900/10 bg-white/60 opacity-55 shadow-[0_3px_0_rgba(120,53,15,0.12)]',
}

const TAG_CLASS: Record<ChoiceState, string> = {
  idle: 'border-emerald-700 from-emerald-400 to-emerald-500 text-white',
  pending: 'border-emerald-700 from-emerald-400 to-emerald-500 text-white',
  correct: 'border-amber-600 from-yellow-300 to-amber-400 text-amber-950',
  practice: 'border-orange-700 from-orange-300 to-amber-500 text-white',
  muted: 'border-stone-400 from-stone-200 to-stone-300 text-stone-600',
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
        'relative flex w-full items-center gap-3 rounded-[20px] border-[3px] px-4 py-3.5 text-left text-amber-950 sm:gap-4 sm:px-5 sm:py-4',
        'transition-[transform,box-shadow,border-color,opacity] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
        'focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none disabled:cursor-default',
        STATE_CLASS[state],
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full border-[3px] bg-gradient-to-b font-game text-lg font-extrabold shadow-[0_3px_0_rgba(0,0,0,0.2)]',
          TAG_CLASS[state],
        )}
      >
        {state === 'correct' ? '✓' : choice.tag}
      </span>
      <span className="flex-1 text-base leading-snug font-medium whitespace-pre-wrap sm:text-lg">{choice.text}</span>
      {/* Hotkey chip; hidden on small (usually touch) screens. */}
      <KeyChip className="hidden sm:inline-flex">{shortcutKeyFor(choice.tag)}</KeyChip>
    </button>
  )
}

export { ChoiceButton }
