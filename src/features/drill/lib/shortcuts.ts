import type { DrillTag } from '../types'

export type ShortcutAction = { type: 'pick'; tag: DrillTag } | { type: 'next' }

// 1–4 and A–D pick a choice (questions have 2–4); Enter/Space advance after feedback.
const PICK_KEYS: Record<string, DrillTag> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', a: 'A', b: 'B', c: 'C', d: 'D' }

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
}

// Pure: decides what a key press means for the drill, or null to let the browser handle it.
export function shortcutFor(key: string, ctx: ShortcutContext): ShortcutAction | null {
  if (ctx.blocked || ctx.withModifier || ctx.repeat || ctx.targetIsEditable) return null

  if (ctx.status === 'answering') {
    const tag = PICK_KEYS[key.toLowerCase()]
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
export const shortcutKeyFor = (tag: DrillTag): string => String('ABCD'.indexOf(tag) + 1)
