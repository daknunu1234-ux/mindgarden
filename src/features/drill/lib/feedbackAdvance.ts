// After an answer is revealed (pure, unit-tested):
// - correct: the gold flash shows, then the next card comes on its own after AUTO_ADVANCE_MS;
// - wrong: the card waits, so the right answer can be read (no timer, no lockout: rule 10);
// - either way Enter, Space or a tap on any choice moves on at once.

export const AUTO_ADVANCE_MS = 300

type FeedbackLike = { status: string; answer?: { isCorrect: boolean } }

// Milliseconds until the session moves on by itself, or null to wait for the player.
export function autoAdvanceDelay(state: FeedbackLike): number | null {
  return state.status === 'feedback' && state.answer?.isCorrect === true ? AUTO_ADVANCE_MS : null
}

// What a tap on a choice does: answer while answering, move on during feedback, nothing otherwise
// (checking, an error, or after the round).
export function choiceTapAction(status: string): 'pick' | 'next' | null {
  if (status === 'answering') return 'pick'
  if (status === 'feedback') return 'next'
  return null
}
