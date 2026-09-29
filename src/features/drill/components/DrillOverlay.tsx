'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { GameButton, GameIcon, GamePanel, GameProgressBar, GameSlab, KeyChip, ParticleBurst } from '@/shared/components/game'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import { useDrillSession, type DrillState } from '../hooks/useDrillSession'
import { useDrillShortcuts } from '../hooks/useDrillShortcuts'
import type { WaterMood } from '../lib/masteryChange'
import type { DrillSession } from '../types'
import { DrillCard } from './DrillCard'
import { WateringScene } from './WateringScene'

type DrillOverlayProps = { session: DrillSession; isSignedIn: boolean }

// One burst when a round ends with at least one root grown. Loaded lazily; respects reduced motion.
function celebrate() {
  import('canvas-confetti').then(({ default: confetti }) =>
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.55 }, disableForReducedMotion: true }),
  )
}

function moodOf(state: DrillState): WaterMood {
  if (state.status === 'checking') return 'checking'
  if (state.status === 'feedback') return state.answer.isCorrect ? 'golden' : 'practice'
  if (state.status === 'done') return 'golden'
  return 'idle'
}

// The Watering Session: question → answer → the can pours on the roots → next, then a summary.
function DrillOverlay({ session, isSignedIn }: DrillOverlayProps) {
  const router = useRouter()
  const { open: openLogin } = useLoginDialog()
  const { question, index, total, state, stats, saving, isPending, pick, retry, next } = useDrillSession(session.questions, isSignedIn)
  useDrillShortcuts({
    status: state.status,
    tags: question?.choices.map((c) => c.tag) ?? [],
    onPick: pick,
    onNext: next,
  })
  const isDone = state.status === 'done'
  const grewRoots = stats.improved > 0

  useEffect(() => {
    if (isDone && grewRoots) celebrate()
  }, [isDone, grewRoots])
  const deckHref = `/deck/${session.deck.slug}`
  const answered = index + (state.status === 'feedback' || state.status === 'done' ? 1 : 0)

  return (
    <div className="space-y-5">
      {/* Floating round HUD: back, round gauge. */}
      <div className="flex items-center gap-3">
        <GameButton asChild tone="cream" size="icon-sm">
          <Link href={deckHref} aria-label="Back to tree">
            <ArrowLeft strokeWidth={3} />
          </Link>
        </GameButton>
        <GameProgressBar
          value={answered}
          max={total}
          tone="sky"
          size="lg"
          segments={total <= 20 ? total : 0}
          label="Round progress"
          caption={isDone ? 'Round complete!' : `💧 ${answered} / ${total}`}
          className="flex-1"
        />
      </div>

      <div className="overflow-hidden rounded-[24px] border-[3px] border-amber-900/30 shadow-[0_5px_0_rgba(120,53,15,0.3)]">
        {/* The pour class is added on every answer and removed on the next question, so it replays. */}
        <WateringScene
          treeType={session.deck.treeType}
          mood={moodOf(state)}
          growth={total > 0 ? answered / total : 0}
        />
      </div>

      {isDone ? (
        <GamePanel tone="gold" ribbon="gold" title="🏆 Round Complete">
          {grewRoots && <ParticleBurst count={24} radius={140} />}
          <p className="text-center font-game text-2xl font-extrabold text-amber-900">Your tree soaked it all up!</p>
          <div className={saving ? 'mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3' : 'mt-5 grid grid-cols-2 gap-3'}>
            <SummaryStat icon="✨" value={stats.correct} label="Golden" tone="gold" />
            <SummaryStat icon="🌿" value={total - stats.correct} label="To water again" tone="cream" />
            {saving && (
              <SummaryStat
                icon="⬆️"
                value={stats.improved}
                label={stats.improved === 1 ? 'Root grew' : 'Roots grew'}
                tone="leaf"
                className="col-span-2 sm:col-span-1"
              />
            )}
          </div>
          {saving && stats.mastered > 0 && (
            <p className="mt-4 text-center font-game font-bold text-amber-900">
              💎 {stats.mastered} reached Mighty Root!
            </p>
          )}
          {saving && stats.coinsEarned > 0 && <GoldReward coins={stats.coinsEarned} />}
          {!saving && (
            <p className="mt-4 text-center text-sm font-medium">
              <button type="button" onClick={openLogin} className="font-game font-bold text-emerald-800 underline underline-offset-4">
                Sign in
              </button>{' '}
              to save mastery and grow your tree.
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <GameButton tone="leaf" size="lg" onClick={() => router.refresh()}>
              💧 Water again
            </GameButton>
            <GameButton asChild tone="wood" size="lg">
              <Link href={deckHref}>Back to tree</Link>
            </GameButton>
          </div>
        </GamePanel>
      ) : (
        question && (
          <>
            <DrillCard question={question} state={state} onSelect={pick} />

            {state.status === 'error' && (
              <GameSlab role="alert" className="flex flex-wrap items-center gap-3 p-4">
                <p className="flex-1 text-sm text-amber-950">
                  <span className="block font-game font-bold">We couldn&apos;t check that answer</span>
                  {state.error.message}.
                </p>
                <GameButton tone="sun" size="sm" onClick={retry} disabled={isPending}>
                  Try again
                </GameButton>
              </GameSlab>
            )}

            {state.status === 'feedback' && (
              <div className="flex justify-center sm:justify-end">
                <GameButton tone="leaf" size="lg" onClick={next} autoFocus className="min-w-48">
                  {index + 1 >= total ? 'See results 🏆' : 'Next ▶'}
                  <KeyChip className="hidden border-emerald-900/30 bg-emerald-50 text-emerald-900 sm:inline-flex">Enter</KeyChip>
                </GameButton>
              </div>
            )}
          </>
        )
      )}

      {session.skippedCount > 0 && (
        <p className="text-center text-xs font-medium text-amber-900/60">
          {session.skippedCount} {session.skippedCount === 1 ? 'item was' : 'items were'} skipped: their statements have no word the
          trap engine can flip yet.
        </p>
      )}
    </div>
  )
}

// The round's gold, front and centre on the trophy panel: a bouncy coin plaque with a gold shower.
function GoldReward({ coins }: { coins: number }) {
  return (
    <div
      role="status"
      className="mg-spring relative mx-auto mt-5 flex w-fit items-center gap-3 rounded-[22px] border-[3px] border-[#b45309] bg-gradient-to-b from-[#fff7ae] via-[#fcd34d] to-[#f59e0b] py-2.5 pr-5 pl-2.5 shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_6px_0_#8a4a0c,0_0_32px_rgba(250,204,21,0.7)]"
    >
      <ParticleBurst variant="gold" count={22} radius={150} />
      <span className="mg-bob flex size-12 items-center justify-center rounded-full border-[3px] border-[#8a4a0c] bg-gradient-to-b from-[#fffbe0] to-[#ffe28a] shadow-[inset_0_2px_0_#fff,0_3px_0_#8a4a0c]">
        <GameIcon name="coin" className="size-8" />
      </span>
      <span className="font-game text-2xl leading-none font-extrabold text-[#5a2a02] [text-shadow:0_2px_0_rgba(255,255,255,0.6)]">
        +{coins} 🪙 Gold Earned!
      </span>
    </div>
  )
}

type SummaryStatProps ={ icon: string; value: number; label: string; tone: 'gold' | 'cream' | 'leaf'; className?: string }

function SummaryStat({ icon, value, label, tone, className }: SummaryStatProps) {
  return (
    <GameSlab tone={tone} className={cn('flex flex-col items-center px-2 py-3 text-center', className)}>
      <span aria-hidden className="text-2xl">
        {icon}
      </span>
      <span className="font-game text-3xl leading-none font-extrabold text-amber-950 tabular-nums">{value}</span>
      <span className="mt-1 text-xs font-semibold text-amber-900/70">{label}</span>
    </GameSlab>
  )
}

export { DrillOverlay }
