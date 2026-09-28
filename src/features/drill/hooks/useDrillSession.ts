'use client'

import { useState, useTransition } from 'react'
import { submitDrillResult } from '@/features/progress'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { useStreak } from '@/shared/stores/StreakProvider'
import type { ErrorCode } from '@/shared/types/errors'
import { checkDrillAnswer } from '../actions/checkDrillAnswer'
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
}

// Walks through a session one question at a time. Correct answers come only from the
// server after the player picks: submitDrillResult (saves) when signed in, else checkDrillAnswer.
export function useDrillSession(questions: DrillQuestion[], isSignedIn: boolean) {
  const { open: openLogin } = useLoginDialog()
  const { streak, setStreak } = useStreak()
  const [index, setIndex] = useState(0)
  const [state, setState] = useState<DrillState>({ status: 'answering' })
  const [stats, setStats] = useState<RoundStats>({ correct: 0, improved: 0, mastered: 0 })
  const [saving, setSaving] = useState(isSignedIn)
  const [isPending, startTransition] = useTransition()

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

      const saved = saving ? await submitDrillResult({ ...input, timeZone }) : null
      if (saved?.success) {
        answer = { isCorrect: saved.data.isCorrect, correctTag: saved.data.correctTag }
        progress = { masteryLevel: saved.data.masteryLevel, previousMasteryLevel: saved.data.previousMasteryLevel }
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
        improved: s.improved + (progress && progress.masteryLevel > progress.previousMasteryLevel ? 1 : 0),
        mastered: s.mastered + (progress && progress.masteryLevel === 3 && progress.previousMasteryLevel < 3 ? 1 : 0),
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

  return { question, index, total: questions.length, state, stats, saving, isPending, pick, retry, next }
}
