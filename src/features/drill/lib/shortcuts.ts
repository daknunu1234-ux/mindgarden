import type { DrillTag } from '../types'

export type ShortcutAction = { type: 'pick'; tag: DrillTag } | { type: 'next' }

// Choice n ↔ digit n ↔ letter: 1/A, 2/B, 3/C, 4/D. Spelled out (no index arithmetic), so a fourth
// choice can never show or listen for the wrong key.
const TAG_DIGIT: Record<DrillTag, string> = { A: '1', B: '2', C: '3', D: '4' }
const BY_KEY: Record<string, DrillTag> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', a: 'A', b: 'B', c: 'C', d: 'D' }
// Physical digit keys, top row and keypad: on AZERTY a bare "1" types "&", and with a Vietnamese VNI
// IME the digits are tone marks, so event.key isn't the digit but the key's code still is.
const BY_DIGIT_CODE: Record<string, DrillTag> = {
  Digit1: 'A', Digit2: 'B', Digit3: 'C', Digit4: 'D',
  Numpad1: 'A', Numpad2: 'B', Numpad3: 'C', Numpad4: 'D',
}
// Physical letter keys, used only while an IME swallows the key (Telex "d" → "đ" arrives as
// "Process"): otherwise AZERTY's Q key (code KeyA) would pick A.
const BY_LETTER_CODE: Record<string, DrillTag> = { KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D' }
const IME_KEYS = new Set(['Process', 'Unidentified'])

export type ShortcutContext = {
  status: 'answering' | 'checking' | 'feedback' | 'error' | 'done'
  // Tags present in this question (a 2-choice question has no C or D).
  tags: readonly DrillTag[]
  // The key was pressed inside something that handles it itself (input, button, link…).
  targetIsInteractive: boolean
  targetIsEditable: boolean
  // e.g. the login dialog is open.
  blocked: boolean
  withModifier: boolean
  repeat: boolean
  // KeyboardEvent.code (the physical key), when known.
  code?: string
}

// Which choice a key press means, from its key and (as a fallback) its physical code.
export function tagForKey(key: string, code?: string): DrillTag | null {
  const byKey = BY_KEY[key.toLowerCase()]
  if (byKey) return byKey
  if (code && BY_DIGIT_CODE[code]) return BY_DIGIT_CODE[code]
  if (code && IME_KEYS.has(key) && BY_LETTER_CODE[code]) return BY_LETTER_CODE[code]
  return null
}

// Pure: decides what a key press means for the drill, or null to let the browser handle it.
// 1–4 and A–D pick a choice (questions have 2–4); Enter/Space advance during feedback.
export function shortcutFor(key: string, ctx: ShortcutContext): ShortcutAction | null {
  if (ctx.blocked || ctx.withModifier || ctx.repeat || ctx.targetIsEditable) return null

  if (ctx.status === 'answering') {
    const tag = tagForKey(key, ctx.code)
    return tag && ctx.tags.includes(tag) ? { type: 'pick', tag } : null
  }

  // A focused button/link already turns Enter/Space into a click (e.g. the autofocused
  // "Next question" button); handling it here too would skip a question.
  if (ctx.status === 'feedback' && (key === 'Enter' || key === ' ') && !ctx.targetIsInteractive) {
    return { type: 'next' }
  }
  return null
}

// Shown next to each choice: A → 1, B → 2, C → 3, D → 4.
export const shortcutKeyFor = (tag: DrillTag): string => TAG_DIGIT[tag]
