// Plain-text trap engine (backend/ARCHITECTURE.md §7).
// Pure and deterministic: no Math.random, no Date, no DB, no network, no LaTeX parsing.

import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import {
  CLAUSE_STARTERS,
  NEGATION_PAIRS,
  OPERATOR_SWAPS,
  OPPOSITE_PAIRS,
  PREDICATE_MARKERS,
  type WordPair,
} from './trapDictionary'

export type TrapRules = {
  swaps?: { from: string; to: string }[]
  negate?: boolean
}
// Up to four choices: trap questions use A–C, cloze / recall / recognition questions up to A–D.
export type DrillTag = 'A' | 'B' | 'C' | 'D'
export type DrillChoice = { tag: DrillTag; text: string }
export type TrapResult =
  // 3 choices (A/B/C) normally, 2 (A/B) when only one trap could be made.
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

// ── Sibling concept swaps ────────────────────────────────────────────────────
// "Ty thể sản sinh ATP" + sibling "Ribosome tổng hợp protein" → "Ribosome sản sinh ATP".

const MAX_SUBJECT_WORDS = 6
const PREDICATE_REGEXES = PREDICATE_MARKERS.map(phraseRegex).filter((r): r is RegExp => r !== null)
const CLAUSE_REGEXES = CLAUSE_STARTERS.map((w) => {
  const body = w.split(/\s+/).map(escapeRegExp).join('\\s+')
  return new RegExp(`^${body}(?!${WORD_CHAR})`, 'iu')
})

// The subject is the text before the earliest predicate marker. Returns null whenever the
// shape is uncertain (no marker, a clause, a comma, or a long span) so no garbled trap is made.
export function extractSubject(statement: string): string | null {
  let cut: number | null = null
  for (const regex of PREDICATE_REGEXES) {
    for (const m of statement.matchAll(regex)) {
      if (m.index > 0) {
        if (cut === null || m.index < cut) cut = m.index
        break
      }
    }
  }
  if (cut === null) return null

  const subject = statement.slice(0, cut).trimEnd()
  if (!subject.trim() || /[,;:]/.test(subject)) return null
  if (subject.trim().split(/\s+/).length > MAX_SUBJECT_WORDS) return null
  if (CLAUSE_REGEXES.some((r) => r.test(subject.trimStart()))) return null
  return subject
}

function siblingSwaps(text: string, siblings: readonly string[]): string[] {
  const own = extractSubject(text)
  if (!own) return []
  const rest = text.slice(own.length)
  const out: string[] = []
  for (const sibling of siblings) {
    const other = extractSubject(sibling)
    if (!other || comparable(other) === comparable(own)) continue
    out.push(matchCase(own.trimStart(), other.trim()) + rest)
  }
  return out
}

// NFC, trimmed, deduped, without the statement itself, and sorted so the result never
// depends on the order rows came back from the database.
function normalizeSiblings(text: string, siblings: readonly string[]): string[] {
  const own = comparable(text)
  const byKey = new Map<string, string>()
  for (const s of siblings) {
    const n = s.normalize('NFC').trim()
    const key = comparable(n)
    if (n && key !== own && !byKey.has(key)) byKey.set(key, n)
  }
  return [...byKey.values()].sort()
}

// Distinct one-mutation variants grouped by priority tier:
//   1. context: sibling concept swaps, then configured trap_rules.swaps
//   2. built-in: dictionary opposite pairs, then operators
//   3. negation (only when trap_rules.negate)
// A candidate equal to any sibling's statement is dropped: that sentence is true.
export function collectTrapTiers(correctStmt: string, rules: TrapRules, siblings: readonly string[] = []): string[][] {
  const text = correctStmt.normalize('NFC')
  const sibs = normalizeSiblings(text, siblings)
  const swaps = (rules.swaps ?? []).map((s) => ({ from: s.from.normalize('NFC'), to: s.to.normalize('NFC') }))

  const tiers = [
    [...siblingSwaps(text, sibs), ...replaceEachMatch(text, swaps)],
    [...replaceEachMatch(text, bothWays(OPPOSITE_PAIRS)), ...operatorMutations(text)],
    rules.negate ? replaceEachMatch(text, bothWays(NEGATION_PAIRS)) : [],
  ]

  const seen = new Set([comparable(text), ...sibs.map(comparable)])
  return tiers.map((tier) =>
    tier.filter((candidate) => {
      const key = comparable(candidate)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  )
}

// All candidates in tier order (used for "is this drillable?" checks and tests).
export function collectTrapCandidates(correctStmt: string, rules: TrapRules, siblings: readonly string[] = []): string[] {
  return collectTrapTiers(correctStmt, rules, siblings).flat()
}

// Most traps per question: 2 traps → 3 choices (A/B/C). With only 1 candidate the question
// falls back to 2 choices (A/B, true vs. one trap); 0 candidates → INSUFFICIENT_MUTATIONS.
const MAX_TRAPS = 2

// `siblings` = the true statements of the other items in the same mindmap node.
// Traps are taken tier by tier (seeded shuffle inside each tier), so sibling swaps win,
// then dictionary opposites, then negation. Same inputs → same output, whatever the sibling order.
// The statement is NFC-normalized, so the correct choice text is `correctStmt.normalize('NFC')`.
export function generateTraps(
  correctStmt: string,
  rules: TrapRules,
  seed: string,
  siblings: readonly string[] = [],
): TrapResult {
  const tiers = collectTrapTiers(correctStmt, rules, siblings)
  if (tiers.every((tier) => tier.length === 0)) return { ok: false, reason: 'INSUFFICIENT_MUTATIONS' }

  const random = seededRandom(seed)
  const traps: string[] = []
  for (const tier of tiers) {
    if (traps.length >= MAX_TRAPS) break
    traps.push(...seededShuffle(tier, random).slice(0, MAX_TRAPS - traps.length))
  }
  const correct = correctStmt.normalize('NFC')
  const texts = seededShuffle([correct, ...traps], random)

  const choices = texts.map((text, i) => ({ tag: TAGS[i], text }))
  const correctTag = TAGS[texts.indexOf(correct)]
  return { ok: true, choices, correctTag }
}
