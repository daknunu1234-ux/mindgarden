import * as React from 'react'
import { cn } from '@/shared/utils/cn'

// Recessed parchment input well (carved into the panel), for game forms.
const GAME_FIELD =
  'w-full rounded-[16px] border-[3px] border-[#c9955e] bg-gradient-to-b from-[#fbf1df] to-white px-3.5 py-2 text-base text-[#4a2511] shadow-[inset_0_3px_5px_rgba(120,53,15,0.18),0_2px_0_rgba(255,255,255,0.9)] placeholder:text-[#8a5a2b]/45 transition-[border,box-shadow] focus-visible:border-emerald-500 focus-visible:ring-4 focus-visible:ring-emerald-200 focus-visible:outline-none disabled:opacity-60 aria-invalid:border-rose-400 aria-invalid:ring-rose-100 md:text-sm'

function GameInput({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="game-input" className={cn(GAME_FIELD, 'h-12', className)} {...props} />
}

function GameTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="game-textarea" className={cn(GAME_FIELD, 'min-h-20 resize-y', className)} {...props} />
}

function GameLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('mb-1.5 block font-game text-sm font-bold text-amber-950', className)} {...props} />
}

export { GAME_FIELD, GameInput, GameLabel, GameTextarea }
