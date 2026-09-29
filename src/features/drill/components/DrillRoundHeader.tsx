import type { ReactNode } from 'react'
import Link from 'next/link'
import { Ribbon } from '@/shared/components/game'

type DrillRoundHeaderProps = {
  mode: 'practice' | 'tournament'
  title: string
  // Set for a root round ("Branch: …").
  focus: { title: string } | null
  // "Practice the whole tree" link shown on a root round.
  wholeTreeHref?: string | null
  reviewing?: boolean
  // Mode extras under the title (review toggle, tournament badge / rules).
  children?: ReactNode
}

// The same header above every round, watering or Mind Tournament: mode label, tree title, the root
// ribbon for a branch round, then the mode's extras. Server-safe (no hooks).
function DrillRoundHeader({ mode, title, focus, wholeTreeHref = null, reviewing = false, children }: DrillRoundHeaderProps) {
  const label = mode === 'tournament' ? '⚔️ Mind Tournament' : reviewing ? 'Watering Session · Review Mode' : 'Watering Session'
  return (
    <div className="mb-6 flex flex-col items-center gap-3 text-center">
      <p className="font-game text-sm font-bold tracking-wide text-emerald-800/70 uppercase">{label}</p>
      <h1 className="font-game text-3xl leading-tight font-extrabold text-emerald-950 [text-shadow:0_2px_0_rgba(255,255,255,0.8)]">{title}</h1>
      {focus && (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Ribbon tone="sky">Branch: {focus.title}</Ribbon>
          {wholeTreeHref && (
            <Link href={wholeTreeHref} className="font-game text-sm font-bold text-emerald-800 underline-offset-4 hover:underline">
              {mode === 'tournament' ? 'Compete on the whole tree' : 'Practice the whole tree'}
            </Link>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

export { DrillRoundHeader }
