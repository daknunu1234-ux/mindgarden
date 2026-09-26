// Plain-text trap engine (backend/ARCHITECTURE.md §7).
// Pure and deterministic: no Math.random, no Date, no DB, no network, no LaTeX parsing.

import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import { NEGATION_PAIRS, OPERATOR_SWAPS, OPPOSITE_PAIRS, type WordPair } from './trapDictionary'

export type TrapRules = {
  swaps?: { from: string; to: string }[]
  negate?: boolean
}
export type DrillTag = 'A' | 'B' | 'C'
export type DrillChoice = { tag: DrillTag; text: string }
export type TrapResult =
  | { ok: true; choices: DrillChoice[]; correctTag: DrillTag }
  | { ok: false; reason: 'INSUFFICIENT_MUTATIONS' }

const TAGS: readonly DrillTag[] = ['A', 'B', 'C']

// Letters, combining marks and digits count as "inside a word". `\b` is not used
// because it treats Vietnamese diacritics as word breaks.
const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}]'
const LEFT_OPERAND = /[\p{L}\p{N})\]]/u
const RIGHT_OPERAND = /[\p{L}\p{N}([]/u
const DIGIT = /\p{N}/u

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function phraseRegex(phrase: string): RegExp | null {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const body = words.map(escapeRegExp).join('\\s+')
  return new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, 'giu')
}

// Keep a leading capital: "Tăng" → "Giảm", not "giảm".
function matchCase(matched: string, replacement: string): string {
  const first = matched.charAt(0)
  if (first !== first.toLocaleLowerCase() && first === first.toLocaleUpperCase()) {
    return replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1)
  }
  return replacement
}

type Replacement = { from: string; to: string }

// One candidate per match. Longer phrases claim their span first; shorter phrases
// can't match inside a claimed span, so each candidate differs in exactly one place.
function replaceEachMatch(text: string, rules: Replacement[]): string[] {
  const ordered = [...rules].sort((a, b) => b.from.length - a.from.length)
  const claimed: [number, number][] = []
  const out: string[] = []

  for (const { from, to } of ordered) {
    const regex = phraseRegex(from)
    if (!regex) continue
    for (const m of text.matchAll(regex)) {
      const start = m.index
      const end = start + m[0].length
      if (claimed.some(([s, e]) => start < e && end > s)) continue
      claimed.push([start, end])
      out.push(text.slice(0, start) + matchCase(m[0], to) + text.slice(end))
    }
  }
  return out
}

const bothWays = (pairs: readonly WordPair[]): Replacement[] =>
  pairs.flatMap(([a, b]) => [
    { from: a, to: b },
    { from: b, to: a },
  ])

// An operator counts only between two operands, either spaced on both sides ("m * a")
// or tight on both sides ("a+b"). Tight "-" and "/" also need digits on both sides,
// so hyphenated words ("cell-biology") and units ("km/h") are left alone.
function isOperatorAt(text: string, i: number): boolean {
  const op = text[i]
  const spacedLeft = /\s/.test(text[i - 1] ?? '')
  const spacedRight = /\s/.test(text[i + 1] ?? '')
  if (spacedLeft !== spacedRight) return false

  const left = text.slice(0, i).trimEnd().slice(-1)
  const right = text.slice(i + 1).trimStart().charAt(0)
  if (!LEFT_OPERAND.test(left) || !RIGHT_OPERAND.test(right)) return false
  if (spacedLeft) return true
  if (op === '-' || op === '/') return DIGIT.test(left) && DIGIT.test(right)
  return true
}

function operatorMutations(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i++) {
    const swap = OPERATOR_SWAPS[text[i]]
    if (swap && isOperatorAt(text, i)) out.push(text.slice(0, i) + swap + text.slice(i + 1))
  }
  return out
}

const comparable = (s: string) => s.toLocaleLowerCase().replace(/\s+/g, ' ').trim()

// All distinct one-mutation variants of a statement, in source order:
// trap_rules.swaps → opposite pairs → negations (if enabled) → operators.
export function collectTrapCandidates(correctStmt: string, rules: TrapRules): string[] {
  const text = correctStmt.normalize('NFC')
  const swaps = (rules.swaps ?? []).map((s) => ({ from: s.from.normalize('NFC'), to: s.to.normalize('NFC') }))

  const pool = [
    ...replaceEachMatch(text, swaps),
    ...replaceEachMatch(text, bothWays(OPPOSITE_PAIRS)),
    ...(rules.negate ? replaceEachMatch(text, bothWays(NEGATION_PAIRS)) : []),
    ...operatorMutations(text),
  ]

  const seen = new Set([comparable(text)])
  return pool.filter((candidate) => {
    const key = comparable(candidate)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// 1 correct statement + 2 traps, shuffled and tagged A/B/C. Same inputs → same output.
// The statement is NFC-normalized, so the correct choice text is `correctStmt.normalize('NFC')`.
export function generateTraps(correctStmt: string, rules: TrapRules, seed: string): TrapResult {
  const candidates = collectTrapCandidates(correctStmt, rules)
  if (candidates.length < 2) return { ok: false, reason: 'INSUFFICIENT_MUTATIONS' }

  const random = seededRandom(seed)
  const [trapA, trapB] = seededShuffle(candidates, random)
  const correct = correctStmt.normalize('NFC')
  const texts = seededShuffle([correct, trapA, trapB], random)

  const choices = texts.map((text, i) => ({ tag: TAGS[i], text }))
  const correctTag = TAGS[texts.indexOf(correct)]
  return { ok: true, choices, correctTag }
}
