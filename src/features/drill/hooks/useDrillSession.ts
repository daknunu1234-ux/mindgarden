'use client'

import { useState, useTransition } from 'react'
import type { ErrorCode } from '@/shared/types/errors'
import { checkDrillAnswer } from '../actions/checkDrillAnswer'
import type { DrillAnswer, DrillQuestion, DrillTag } from '../types'

export type DrillState =
  | { status: 'answering' }
  | { status: 'checking'; picked: DrillTag }
  | { status: 'feedback'; picked: DrillTag; answer: DrillAnswer }
  | { status: 'error'; picked: DrillTag; error: { code: ErrorCode; message: string } }
  | { status: 'done' }

// Walks through a session one question at a time. Correct answers come only from
// checkDrillAnswer, after the player picks.
export function useDrillSession(questions: DrillQuestion[]) {
  const [index, setIndex] = useState(0)
  const [state, setState] = useState<DrillState>({ status: 'answering' })
  const [correctCount, setCorrectCount] = useState(0)
  const [isPending, startTransition] = useTransition()

  const question = questions[index]

  const pick = (tag: DrillTag) => {
    if (!question || state.status === 'checking' || state.status === 'feedback') return
    setState({ status: 'checking', picked: tag })
    startTransition(async () => {
      const res = await checkDrillAnswer({ itemId: question.itemId, seed: question.seed, tag })
      if (!res.success) {
        setState({ status: 'error', picked: tag, error: res.error })
        return
      }
      if (res.data.isCorrect) setCorrectCount((n) => n + 1)
      setState({ status: 'feedback', picked: tag, answer: res.data })
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

  return { question, index, total: questions.length, state, correctCount, isPending, pick, retry, next }
}
