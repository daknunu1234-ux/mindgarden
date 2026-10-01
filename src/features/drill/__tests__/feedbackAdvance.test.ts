import { describe, expect, it } from 'vitest'
import { AUTO_ADVANCE_MS, autoAdvanceDelay, choiceTapAction } from '../lib/feedbackAdvance'

describe('after an answer', () => {
  it('a correct answer moves on by itself after a short gold flash (250–350 ms)', () => {
    expect(AUTO_ADVANCE_MS).toBeGreaterThanOrEqual(250)
    expect(AUTO_ADVANCE_MS).toBeLessThanOrEqual(350)
    expect(autoAdvanceDelay({ status: 'feedback', answer: { isCorrect: true } })).toBe(AUTO_ADVANCE_MS)
  })

  it('a wrong answer waits so the right one can be read (no timer)', () => {
    expect(autoAdvanceDelay({ status: 'feedback', answer: { isCorrect: false } })).toBeNull()
  })

  it('nothing moves on by itself while answering, checking, on an error or after the round', () => {
    for (const status of ['answering', 'checking', 'error', 'done']) expect(autoAdvanceDelay({ status }), status).toBeNull()
  })
})

describe('tapping a choice', () => {
  it('answers while answering, skips ahead during feedback, and does nothing otherwise', () => {
    expect(choiceTapAction('answering')).toBe('pick')
    expect(choiceTapAction('feedback')).toBe('next')
    for (const status of ['checking', 'error', 'done']) expect(choiceTapAction(status), status).toBeNull()
  })
})
