'use client'

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { GameButton, GameDialog, GameDialogContent, type GameTone } from '@/shared/components/game'
import { DEFAULT_DRILL_SIZE, effectiveDrillSize, type DrillSize } from '../lib/drillSize'
import { readDrillSize, saveDrillSize, subscribeDrillSize } from '../lib/drillSizeStore'
import { planLaunch, type LaunchContext, type LaunchPlan, type LaunchRequest } from '../lib/sessionLaunch'
import { DrillSizeSelector } from './DrillSizeSelector'

type SessionLaunchModalProps = {
  plan: LaunchPlan | null
  onOpenChange: (open: boolean) => void
}

// The pop-up before every round, watering or Mind Tournament, whole tree or one root:
// "[Water Tree 🌱 / Review 🌿 / Compete ⚔️] - [Whole Tree / Root: name]", how many questions this
// scope has, the 5 / 10 / 20 selector (remembered), and "Start Session" → the round URL with ?limit= (+ rootId).
function SessionLaunchModal({ plan, onOpenChange }: SessionLaunchModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // The server renders the default; the browser swaps in the saved size.
  const preferred = useSyncExternalStore(subscribeDrillSize, readDrillSize, () => DEFAULT_DRILL_SIZE)
  const available = plan?.available ?? 0
  const size = effectiveDrillSize(preferred, available)
  const compete = plan?.mode === 'compete'

  const start = () => {
    if (!plan || available === 0) return
    startTransition(() => router.push(plan.href(size)))
  }

  return (
    <GameDialog open={plan !== null} onOpenChange={onOpenChange}>
      <GameDialogContent title={plan?.title ?? ''} ribbon={compete ? 'gold' : 'leaf'} tone="parchment">
        {plan && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-amber-900/80">
              {compete
                ? 'Your answers count only on the tournament board, never on your own garden.'
                : plan.review
                  ? 'Review Mode: statements already at 5/5 are mixed back in.'
                  : 'Every correct answer waters a root of your tree.'}
            </p>
            <span
              role="status"
              className="rounded-full border-2 border-amber-900/20 bg-amber-50 px-3 py-1 font-game text-sm font-extrabold text-amber-950 tabular-nums"
            >
              📜 {available} {available === 1 ? 'question' : 'questions'} available · {plan.scopeLabel}
            </span>
            {available === 0 ? (
              <p className="font-game font-bold text-amber-900">
                {compete ? 'Nothing left to compete on here: every statement is at 5/5.' : 'Nothing to water here right now.'}
              </p>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="font-game text-xs font-bold tracking-wide text-amber-900/70 uppercase">Questions per round</span>
                <DrillSizeSelector value={size} onChange={(next: DrillSize) => saveDrillSize(next)} available={available} />
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <GameButton tone={compete ? 'sun' : 'sky'} size="lg" onClick={start} disabled={available === 0 || isPending} autoFocus>
                {isPending ? 'Opening…' : 'Start Session'}
              </GameButton>
              <GameButton tone="cream" size="lg" onClick={() => onOpenChange(false)}>
                Not now
              </GameButton>
            </div>
          </div>
        )}
      </GameDialogContent>
    </GameDialog>
  )
}

// ─── Page-wide launcher: one modal, opened from any button or root on the page ──────────────

type SessionLaunchApi = { open: (request?: LaunchRequest) => void; mode: LaunchContext['mode'] }
const SessionLaunchContext = createContext<SessionLaunchApi | null>(null)

type SessionLaunchProviderProps = { context: LaunchContext; children: ReactNode }

// Wraps a tree page: `useSessionLaunch().open({ rootId?, review? })` opens the pop-up for that scope.
function SessionLaunchProvider({ context, children }: SessionLaunchProviderProps) {
  const [request, setRequest] = useState<LaunchRequest | null>(null)
  const open = useCallback((next: LaunchRequest = {}) => setRequest(next), [])
  // Planned from fresh props every render, so counts follow a refreshed page.
  const plan = request ? planLaunch(context, request) : null
  const api = useMemo(() => ({ open, mode: context.mode }), [open, context.mode])
  return (
    <SessionLaunchContext.Provider value={api}>
      {children}
      <SessionLaunchModal plan={plan} onOpenChange={(isOpen) => !isOpen && setRequest(null)} />
    </SessionLaunchContext.Provider>
  )
}

// null outside a SessionLaunchProvider (nothing to launch there).
function useSessionLaunch(): SessionLaunchApi | null {
  return useContext(SessionLaunchContext)
}

type SessionLaunchButtonProps = LaunchRequest & {
  label: string
  tone?: GameTone
  size?: 'sm' | 'md' | 'lg'
  title?: string
  className?: string
}

// "💧 Water Tree", "⚔️ Join Mind Tournament", "🌿 Review Mastered"…: opens the pop-up instead of starting the round.
function SessionLaunchButton({ label, tone = 'sky', size = 'lg', title, className, rootId, review }: SessionLaunchButtonProps) {
  const launch = useSessionLaunch()
  return (
    <GameButton tone={tone} size={size} title={title} className={className} disabled={!launch} onClick={() => launch?.open({ rootId, review })}>
      {label}
    </GameButton>
  )
}

export { SessionLaunchButton, SessionLaunchModal, SessionLaunchProvider, useSessionLaunch }
