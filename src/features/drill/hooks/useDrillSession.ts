'use client'

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { submitDrillResult } from '@/features/progress'
import { submitTournamentAnswer, type TournamentAnswer } from '@/features/tournament'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { useCoins } from '@/shared/stores/CoinsProvider'
import { useStreak } from '@/shared/stores/StreakProvider'
import type { ErrorCode } from '@/shared/types/errors'
import { checkDrillAnswer } from '../actions/checkDrillAnswer'
import { autoAdvanceDelay } from '../lib/feedbackAdvance'
import { becameMighty, leveledUp } from '../lib/masteryChange'
import type { DrillAnswer, DrillProgress, DrillQuestion, DrillTag } from '../types'

export type DrillState =
  | { status: 'answering' }
  | { status: 'checking'; picked: DrillTag }
  | { status: 'feedback'; picked: DrillTag; answer: DrillAnswer; progress: DrillProgress | null }
  | { status: 'error'; picked: DrillTag; error: { code: ErrorCode; message: string } }
  | { status: 'done' }

export type RoundStats = {
  correct: number
  // Items whose saved mastery went up this round, and items that reached Mighty Root.
  improved: number
  mastered: number
  // 🪙 gold paid this round (first mastery of an item, once per item ever).
  coinsEarned: number
}

// A Mind Tournament round: answers go to the contestant's isolated tournament progress on this tree.
export type TournamentRound = { deckId: string }

// Walks through a session one question at a time. Correct answers come only from the
// server after the player picks: submitDrillResult (saves) when signed in, else checkDrillAnswer.
// In a tournament round every pick goes to submitTournamentAnswer instead (never user_progress),
// and `standing` follows the contestant's tournament score after each answer.
export function useDrillSession(questions: DrillQuestion[], isSignedIn: boolean, tournament: TournamentRound | null = null) {
  const { open: openLogin } = useLoginDialog()
  const { streak, setStreak } = useStreak()
  const { setCoins } = useCoins()
  const [index, setIndex] = useState(0)
  const [state, setState] = useState<DrillState>({ status: 'answering' })
  const [stats, setStats] = useState<RoundStats>({ correct: 0, improved: 0, mastered: 0, coinsEarned: 0 })
  const [saving, setSaving] = useState(isSignedIn)
  const [isPending, startTransition] = useTransition()
  const [standing, setStanding] = useState<TournamentAnswer | null>(null)

  const question = questions[index]

  const pick = (tag: DrillTag) => {
    if (!question || state.status === 'checking' || state.status === 'feedback') return
    setState({ status: 'checking', picked: tag })

    startTransition(async () => {
      const input = { itemId: question.itemId, seed: question.seed, tag }
      // The streak's calendar day is the player's local day.
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      let answer: DrillAnswer
      let progress: DrillProgress | null = null

      if (tournament) {
        const res = await submitTournamentAnswer({ ...input, deckId: tournament.deckId, timeZone })
        if (!res.success) {
          if (res.error.code === 'AUTH_UNAUTHORIZED') openLogin()
          setState({ status: 'error', picked: tag, error: res.error })
          return
        }
        answer = { isCorrect: res.data.isCorrect, correctTag: res.data.correctTag }
        progress = { masteryLevel: res.data.masteryLevel, previousMasteryLevel: res.data.previousMasteryLevel, coinsEarned: 0 }
        setStanding(res.data)
        setStats((s) => ({
          correct: s.correct + (answer.isCorrect ? 1 : 0),
          improved: s.improved + (leveledUp(progress) ? 1 : 0),
          mastered: s.mastered + (becameMighty(progress) ? 1 : 0),
          coinsEarned: s.coinsEarned,
        }))
        setState({ status: 'feedback', picked: tag, answer, progress })
        return
      }

      const saved = saving ? await submitDrillResult({ ...input, timeZone }) : null
      if (saved?.success) {
        answer = { isCorrect: saved.data.isCorrect, correctTag: saved.data.correctTag }
        progress = {
          masteryLevel: saved.data.masteryLevel,
          previousMasteryLevel: saved.data.previousMasteryLevel,
          coinsEarned: saved.data.coinsEarned,
        }
        // Update the farm HUD's 🪙 balance in place (same reason as the streak below).
        if (saved.data.totalCoins !== null) setCoins(saved.data.totalCoins)
        if (saved.data.streakCount !== null) {
          // Update the header badge in place; a page refresh would restart the round.
          const current = saved.data.streakCount
          setStreak({ current, best: Math.max(streak?.best ?? 0, current), practicedToday: true })
        }
      } else if (saved && saved.error.code !== 'AUTH_UNAUTHORIZED') {
        setState({ status: 'error', picked: tag, error: saved.error })
        return
      } else {
        // Signed out, or the session expired mid-round: still grade, and offer sign-in.
        if (saved) {
          setSaving(false)
          openLogin()
        }
        const checked = await checkDrillAnswer(input)
        if (!checked.success) {
          setState({ status: 'error', picked: tag, error: checked.error })
          return
        }
        answer = checked.data
      }

      setStats((s) => ({
        correct: s.correct + (answer.isCorrect ? 1 : 0),
        improved: s.improved + (leveledUp(progress) ? 1 : 0),
        mastered: s.mastered + (becameMighty(progress) ? 1 : 0),
        coinsEarned: s.coinsEarned + (progress?.coinsEarned ?? 0),
      }))
      setState({ status: 'feedback', picked: tag, answer, progress })
    })
  }

  const retry = () => {
    if (state.status === 'error') pick(state.picked)
  }

  const next = () => {
    if (index + 1 >= questions.length) {
      setState({ status: 'done' })
      return
    }
    setIndex(index + 1)
    setState({ status: 'answering' })
  }

  // A correct answer flashes gold, then the next card comes on its own (lib/feedbackAdvance.ts); a
  // wrong one waits so the right answer can be read. Enter / Space / a tap still move on at once.
  const latestNext = useRef(next)
  useLayoutEffect(() => {
    latestNext.current = next
  })
  useEffect(() => {
    const delay = autoAdvanceDelay(state)
    if (delay === null) return
    const timer = setTimeout(() => latestNext.current(), delay)
    return () => clearTimeout(timer)
  }, [state])

  return { question, index, total: questions.length, state, stats, saving: saving || tournament !== null, standing, isPending, pick, retry, next }
}
