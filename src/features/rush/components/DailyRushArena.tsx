'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { GameButton, GamePanel } from '@/shared/components/game'
import { useCoins } from '@/shared/stores/CoinsProvider'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { cn } from '@/shared/utils/cn'
import { answerDailyRush } from '../actions/answerDailyRush'
import { startDailyRush } from '../actions/startDailyRush'
import { RUSH_CARD_MS, RUSH_MAX_STREAK, RUSH_SECONDS, RUSH_URGENT_SECONDS, rushHeadline } from '../lib/rules'
import type { DrillTag, RushAnswer, RushCard, RushOutcome } from '../types'

type Deck = { id: string; slug: string; title: string }

// What the screen shows. `over.picked` / `correctTag`: the card that ended the run, with its answer.
type Phase =
  | { status: 'ready'; error: string | null }
  | { status: 'starting' }
  // `dealt`: bumps with every card, so the timer bar restarts.
  | { status: 'playing'; card: RushCard; dealt: number; picked: DrillTag | null; checking: boolean }
  | { status: 'over'; outcome: RushOutcome; streak: number; coins: number; card: RushCard | null; picked: DrillTag | null; correctTag: DrillTag | null }

type Vars = CSSProperties & Record<`--mg-${string}`, string>

// Keys → the choice at that position: 1–4, A–D, and the keypad.
const keyIndex = (e: KeyboardEvent): number => {
  const k = e.key.toLowerCase()
  if (k >= '1' && k <= '4') return Number(k) - 1
  if (k.length === 1 && k >= 'a' && k <= 'd') return k.charCodeAt(0) - 97
  const pad = /^Numpad([1-4])$/.exec(e.code)
  return pad ? Number(pad[1]) - 1 : -1
}

// The Daily Rush: one sudden-death run. 8 seconds a card; a right answer deals the next card, a
// wrong one or a timeout ends the run, which pays 1 🪙 per card answered in a row. The run starts
// only when the player presses Start (never on page load, so a prefetch can't use up the day).
// Every pick is graded by the server; the player's own clock only ends the card on screen.
function DailyRushArena({ deck, statementCount }: { deck: Deck; statementCount: number }) {
  const { setCoins } = useCoins()
  const { open: openLogin } = useLoginDialog()
  const [phase, setPhase] = useState<Phase>({ status: 'ready', error: null })
  const [streak, setStreak] = useState(0)
  const [urgent, setUrgent] = useState(false)
  const [flash, setFlash] = useState(0)
  // The run's day (its id for every answer) and a guard against answering one card twice.
  const run = useRef<{ day: string; locked: boolean }>({ day: '', locked: true })

  const finish = useCallback(
    (res: Extract<RushAnswer, { finished: true }>, card: RushCard | null, picked: DrillTag | null) => {
      if (res.totalCoins !== null) setCoins(res.totalCoins)
      if (res.outcome !== 'complete') setFlash((n) => n + 1)
      setStreak(res.streak)
      setPhase({ status: 'over', outcome: res.outcome, streak: res.streak, coins: res.coinsEarned, card, picked, correctTag: res.outcome === 'complete' ? null : res.correctTag })
    },
    [setCoins],
  )

  // Send one pick (or a timeout: null). The card freezes at once; the server's verdict moves on.
  const answer = useCallback(
    (card: RushCard, dealt: number, tag: DrillTag | null) => {
      if (run.current.locked) return
      run.current.locked = true
      setUrgent(false)
      setPhase({ status: 'playing', card, dealt, picked: tag, checking: true })
      void answerDailyRush({ day: run.current.day, tag }).then((res) => {
        if (!res.success) {
          if (res.error.code === 'AUTH_UNAUTHORIZED') openLogin()
          // The run can't continue (already over, or the server is unreachable): show what we know.
          setFlash((n) => n + 1)
          setPhase((p) => ({ status: 'over', outcome: tag === null ? 'timeout' : 'wrong', streak: p.status === 'playing' ? p.card.index : 0, coins: 0, card, picked: tag, correctTag: null }))
          return
        }
        if (res.data.finished) return finish(res.data, card, tag)
        setStreak(res.data.streak)
        run.current.locked = false
        setPhase({ status: 'playing', card: res.data.next, dealt: dealt + 1, picked: null, checking: false })
      })
    },
    [finish, openLogin],
  )

  const start = () => {
    setPhase({ status: 'starting' })
    void startDailyRush({ deckId: deck.id, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then((res) => {
      if (!res.success) {
        if (res.error.code === 'AUTH_UNAUTHORIZED') openLogin()
        setPhase({ status: 'ready', error: res.error.message })
        return
      }
      run.current = { day: res.data.day, locked: false }
      setStreak(0)
      setPhase({ status: 'playing', card: res.data.card, dealt: 0, picked: null, checking: false })
    })
  }

  // The card's clock: the last seconds beat, then the card times out. Stopped while a pick is checked.
  const playing = phase.status === 'playing' && !phase.checking ? phase : null
  const live = useRef({ answer, playing })
  useEffect(() => {
    live.current = { answer, playing }
  })
  const dealt = playing?.dealt ?? -1
  useEffect(() => {
    if (dealt < 0) return
    const beat = setTimeout(() => setUrgent(true), RUSH_CARD_MS - RUSH_URGENT_SECONDS * 1000)
    const out = setTimeout(() => {
      const now = live.current.playing
      if (now) live.current.answer(now.card, now.dealt, null)
    }, RUSH_CARD_MS)
    return () => {
      clearTimeout(beat)
      clearTimeout(out)
    }
  }, [dealt])

  // 1–4 / A–D pick a choice at once (capture phase: nothing else sees the key first).
  useEffect(() => {
    if (dealt < 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const now = live.current.playing
      const choice = now?.card.choices[keyIndex(e)]
      if (!now || !choice) return
      e.preventDefault()
      live.current.answer(now.card, now.dealt, choice.tag)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dealt])

  if (phase.status === 'ready' || phase.status === 'starting') {
    const cards = Math.min(statementCount, RUSH_MAX_STREAK)
    return (
      <GamePanel tone="parchment" ribbon="gold" title="⚡ Daily Rush">
        <p className="text-center font-game text-lg font-extrabold text-amber-950">“{deck.title}”</p>
        <ul className="mx-auto mt-4 max-w-sm space-y-2 text-sm font-medium text-amber-900">
          <li>⏱️ {RUSH_SECONDS} seconds for every card.</li>
          <li>✅ A right answer deals the next card at once.</li>
          <li>💥 A wrong answer or a timeout ends the run.</li>
          <li>🪙 You earn 1 coin for every card in a row (up to {cards} on this tree).</li>
          <li>📅 One run a day, on one tree. Choose well!</li>
        </ul>
        {phase.status === 'ready' && phase.error && (
          <p role="alert" className="mt-4 rounded-xl bg-orange-100 px-3 py-2 text-center text-sm font-semibold text-amber-900">
            {/[.!?]$/.test(phase.error) ? phase.error : `${phase.error}.`}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={start} disabled={phase.status === 'starting'} className={cn(RUSH_BUTTON, 'h-12 px-7 text-lg')}>
            {phase.status === 'starting' ? 'Get ready…' : '⚡ Start the rush'}
          </button>
          <GameButton asChild tone="wood">
            <Link href={`/deck/${deck.slug}`}>Not now</Link>
          </GameButton>
        </div>
      </GamePanel>
    )
  }

  if (phase.status === 'over') {
    return (
      <>
        {flash > 0 && <span key={flash} aria-hidden className="mg-rush-flash pointer-events-none fixed inset-0 z-50 bg-amber-400" />}
        <RushResult deck={deck} outcome={phase.outcome} streak={phase.streak} coins={phase.coins} card={phase.card} picked={phase.picked} correctTag={phase.correctTag} />
      </>
    )
  }

  const { card, picked, checking } = phase
  return (
    <section aria-label="Daily Rush" className={cn('rounded-[24px] border-[3px] border-[#7c2d12] bg-gradient-to-b from-[#fffaf0] to-[#ffe9c7] p-4 shadow-[0_6px_0_#7c2d12] sm:p-6', urgent && 'mg-rush-beat')}>
      <header className="flex items-center justify-between gap-3 font-game font-extrabold text-amber-950">
        <span className="text-sm">⚡ Daily Rush</span>
        <span className="rounded-full border-2 border-[#8a4a0c] bg-gradient-to-b from-[#fffbe0] to-[#ffd76a] px-3 py-0.5 text-base tabular-nums" aria-live="polite">
          🔥 {streak} <span className="sr-only">in a row</span>
        </span>
      </header>

      {/* The card's clock: an amber bar that shrinks to nothing in 8 s while a fiery red one fades in
          over it. Scale and opacity only. It freezes while the pick is checked; `key` restarts it. */}
      <div role="timer" aria-label={`${RUSH_SECONDS} seconds per card`} className="mt-3 h-3 overflow-hidden rounded-full border-2 border-black/20 bg-black/15">
        <div key={phase.dealt} className={cn('mg-rush-timer relative h-full origin-left', checking && 'mg-rush-paused')} style={{ '--mg-dur': `${RUSH_CARD_MS}ms` } as Vars}>
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-300 to-amber-500" />
          <span className="mg-rush-heat absolute inset-0 rounded-full bg-gradient-to-r from-orange-500 to-red-600" style={{ '--mg-dur': `${RUSH_CARD_MS}ms` } as Vars} />
        </div>
      </div>

      {card.context.length > 0 && (
        <p className="mt-4 text-center">
          <span className="inline-block rounded-full border-2 border-amber-800/20 bg-white/80 px-3 py-0.5 font-game text-xs font-bold text-amber-900">{card.context.join(' › ')}</span>
        </p>
      )}
      <h2 className="mt-3 text-center font-game text-xl leading-snug font-extrabold whitespace-pre-wrap text-amber-950 sm:text-2xl">{card.prompt}</h2>
      {card.instruction && <p className="mt-1 text-center text-sm font-semibold text-amber-900/70">{card.instruction}</p>}

      <ul className="mt-5 grid gap-3">
        {card.choices.map((choice, i) => (
          <li key={choice.tag}>
            <button
              type="button"
              disabled={checking}
              // pointerdown, not click: the pick registers the instant the finger lands.
              onPointerDown={(e) => {
                if (e.button === 0) answer(card, phase.dealt, choice.tag)
              }}
              onClick={() => answer(card, phase.dealt, choice.tag)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border-[3px] px-4 py-3 text-left font-game text-base font-bold text-amber-950 transition-transform duration-100 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:scale-[0.98]',
                picked === choice.tag
                  ? 'border-amber-600 bg-amber-200 shadow-[0_2px_0_#b45309]'
                  : 'border-amber-900/25 bg-white shadow-[0_4px_0_rgba(120,53,15,0.25)] hover:-translate-y-0.5 hover:border-amber-500 disabled:opacity-60 disabled:hover:translate-y-0',
              )}
            >
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-amber-900/30 bg-amber-100 text-sm">
                {i + 1}
              </span>
              <span className="min-w-0 whitespace-pre-wrap">{choice.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs font-semibold text-amber-900/60">Keys 1–{card.choices.length} or A–{String.fromCharCode(64 + card.choices.length)}</p>
    </section>
  )
}

// The ⚡ look, shared by the farm's button and this screen: an energetic amber → red gradient.
const RUSH_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 font-game font-bold text-white shadow-lg transition hover:brightness-110 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:scale-95 disabled:opacity-70'

// The result: the streak, the coins flying into the purse, and the card that ended the run.
function RushResult({ deck, outcome, streak, coins, card, picked, correctTag }: { deck: Deck; outcome: RushOutcome; streak: number; coins: number; card: RushCard | null; picked: DrillTag | null; correctTag: DrillTag | null }) {
  const right = card && correctTag ? card.choices.find((c) => c.tag === correctTag) : undefined
  const mine = card && picked ? card.choices.find((c) => c.tag === picked) : undefined
  return (
    <GamePanel tone="gold" ribbon="gold" title={`⚡ ${rushHeadline(outcome, streak)}`} className="mg-land">
      <div className="relative flex flex-col items-center gap-2 text-amber-950">
        <p className="font-game text-6xl leading-none font-extrabold tabular-nums">🔥 {streak}</p>
        <p className="font-game text-base font-bold">
          {streak === 1 ? '1 card in a row' : `${streak} cards in a row`}
          {outcome === 'complete' && ': every card of this run!'}
        </p>
        <p className="mt-2 inline-flex items-center gap-2 rounded-full border-[3px] border-[#8a4a0c] bg-gradient-to-b from-[#fffbe0] to-[#ffd76a] px-5 py-1.5 font-game text-2xl font-extrabold text-[#5a2a02] shadow-[inset_0_2px_0_rgba(255,255,255,0.8),0_4px_0_#8a4a0c]">
          +{coins} 🪙
        </p>
        {/* Coins bursting out of the reward and flying up to the purse. */}
        {coins > 0 && (
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2">
            {Array.from({ length: Math.min(coins, 12) }, (_, i) => (
              <span
                key={i}
                className="mg-burst absolute text-xl leading-none"
                style={{ '--mg-dx': `${Math.round(Math.cos(i * 2.4) * (50 + (i % 4) * 22))}px`, '--mg-dy': `${-90 - (i % 5) * 26}px`, '--mg-spin': `${(i % 2 ? 1 : -1) * (160 + i * 25)}deg`, '--mg-delay': `${i * 0.06}s`, '--mg-dur': '1.2s' } as Vars}
              >
                🪙
              </span>
            ))}
          </span>
        )}
        <p className="mt-1 text-sm font-semibold text-amber-900/75">{coins > 0 ? 'Added to your purse.' : 'No coins this time. Tomorrow is a new run!'}</p>
      </div>

      {outcome !== 'complete' && card && (
        <div className="mt-5 rounded-2xl border-2 border-amber-800/20 bg-white/70 p-3 text-sm text-amber-950">
          <p className="font-game font-bold">{outcome === 'timeout' && !mine ? '⏱️ The clock ran out on:' : 'This one ended the run:'}</p>
          <p className="mt-1 font-medium whitespace-pre-wrap">{card.prompt}</p>
          {mine && right && mine.tag !== right.tag && <p className="mt-2 font-semibold text-amber-800">Your pick: {mine.text}</p>}
          {right && <p className="mt-1 font-semibold text-emerald-800">Answer: {right.text}</p>}
        </div>
      )}

      <p className="mt-5 text-center font-game text-sm font-bold text-amber-900/80">See you tomorrow for the next Daily Rush ⚡</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <GameButton asChild tone="leaf" size="lg">
          <Link href="/">Back to the farm</Link>
        </GameButton>
        <GameButton asChild tone="sky">
          <Link href={`/deck/${deck.slug}/drill`}>💧 Water this tree</Link>
        </GameButton>
      </div>
    </GamePanel>
  )
}

export { DailyRushArena }
