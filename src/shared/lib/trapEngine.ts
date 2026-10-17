// Plain-text trap engine (backend/ARCHITECTURE.md §7).
// Pure and deterministic: no Math.random, no Date, no DB, no network, no LaTeX parsing.

import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import {
  CLAUSE_STARTERS,
  GUARDED_PHRASES,
  LOOSE_OPPOSITE_PAIRS,
  NEGATION_PAIRS,
  OPERATOR_SWAPS,
  OPPOSITE_PAIRS,
  PREDICATE_MARKERS,
  ROLE_PAIRS,
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

// Compiled once per phrase (the dictionary is tried on every statement). The regexes are global:
// use them with matchAll / search / replace only, never test() or exec(), which keep a position.
const PHRASE_REGEXES = new Map<string, RegExp | null>()
function phraseRegex(phrase: string): RegExp | null {
  const cached = PHRASE_REGEXES.get(phrase)
  if (cached !== undefined) return cached
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  const regex = words.length === 0 ? null : new RegExp(`(?<!${WORD_CHAR})${words.map(escapeRegExp).join('\\s+')}(?!${WORD_CHAR})`, 'giu')
  PHRASE_REGEXES.set(phrase, regex)
  return regex
}

// Keep a leading capital: "Tăng" → "Giảm", not "giảm".
function matchCase(matched: string, replacement: string): string {
  const first = matched.charAt(0)
  if (first !== first.toLocaleLowerCase() && first === first.toLocaleUpperCase()) {
    return replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1)
  }
  return replacement
}

// `exchange`: when the statement names both words, they trade places instead of one being replaced.
// `allow`: a match is used only where it says so (loose opposites: not inside a set phrase).
type Replacement = { from: string; to: string; exchange?: boolean; allow?: (text: string, start: number, end: number) => boolean }

// Whether the word at [start, end) is joined to `other` by a hyphen, a slash or a conjunction.
const JOINER = '\\s*(?:[-/–&]|and|or|vs\\.?|và|hoặc)\\s*'
function joinedWith(text: string, start: number, end: number, other: string): boolean {
  const body = other.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
  if (!body) return false
  return new RegExp(`^${JOINER}${body}(?!${WORD_CHAR})`, 'iu').test(text.slice(end)) || new RegExp(`(?<!${WORD_CHAR})${body}${JOINER}$`, 'iu').test(text.slice(0, start))
}

// "a synchronous call" → "an asynchronous call": the article follows the new word.
function withArticle(before: string, word: string): string {
  const m = /(?<![\p{L}\p{M}\p{N}])(a|an)(\s+)$/iu.exec(before)
  if (!m || !/^[a-z]/i.test(word)) return before
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a'
  if (m[1].toLowerCase() === article) return before
  return before.slice(0, m.index) + (m[1][0] === 'A' ? 'A' + article.slice(1) : article) + m[2]
}

// Both words of a pair trade places everywhere in the text.
function exchanged(text: string, a: string, b: string): string {
  const [ra, rb] = [phraseRegex(a), phraseRegex(b)]
  if (!ra || !rb) return text
  const both = new RegExp(`${ra.source}|${rb.source}`, 'giu')
  return text.replace(both, (m) => matchCase(m, comparable(m) === comparable(a) ? b : a))
}

// One candidate per match. Longer phrases claim their span first; shorter phrases
// can't match inside a claimed span, so each candidate differs in exactly one place.
// Whether the match of `word` at [start, end) sits inside a phrase where it is no pair word at all
// (trapDictionary GUARDED_PHRASES: "lần đầu ra công chúng" holds no "đầu ra").
function guardedPhrase(text: string, word: string, start: number, end: number): boolean {
  const key = comparable(word)
  return GUARDED_PHRASES.some(({ phrase, word: guarded }) => {
    if (guarded !== key) return false
    const regex = phraseRegex(phrase)
    return regex !== null && [...text.matchAll(regex)].some((m) => m.index <= start && m.index + m[0].length >= end)
  })
}

const LONGEST_FIRST = new WeakMap<readonly Replacement[], Replacement[]>()
function longestFirst(rules: readonly Replacement[]): Replacement[] {
  let ordered = LONGEST_FIRST.get(rules)
  if (!ordered) LONGEST_FIRST.set(rules, (ordered = [...rules].sort((a, b) => b.from.length - a.from.length)))
  return ordered
}
const firstWord = (phrase: string) => phrase.trim().split(/\s+/)[0]?.toLocaleLowerCase() ?? ''

function replaceEachMatch(text: string, rules: readonly Replacement[]): string[] {
  const claimed: [number, number][] = []
  const out: string[] = []
  const lower = text.toLocaleLowerCase()

  for (const { from, to, exchange, allow } of longestFirst(rules)) {
    // Most of the dictionary is not in the statement: skip it without running a regex.
    if (!lower.includes(firstWord(from))) continue
    const regex = phraseRegex(from)
    if (!regex) continue
    const other = exchange ? phraseRegex(to) : null
    if (other && text.search(other) >= 0) {
      const named = [...text.matchAll(regex)].filter((m) => !guardedPhrase(text, from, m.index, m.index + m[0].length))
      // Named as a whole ("client-server", "supply and demand"): nothing to exchange.
      if (named.length > 0 && !named.some((m) => joinedWith(text, m.index, m.index + m[0].length, to))) out.push(exchanged(text, from, to))
      continue
    }
    for (const m of text.matchAll(regex)) {
      const start = m.index
      const end = start + m[0].length
      if (claimed.some(([s, e]) => start < e && end > s)) continue
      claimed.push([start, end])
      // "client-server", "supply and demand": the pair is named as a whole there, and swapping one
      // half would say "server-server".
      if (joinedWith(text, start, end, to)) continue
      if (guardedPhrase(text, from, start, end)) continue
      if (allow && !allow(text, start, end)) continue
      out.push(withArticle(text.slice(0, start), to) + matchCase(m[0], to) + text.slice(end))
    }
  }
  return out
}

const ROLES = new Set(ROLE_PAIRS.map(([a, b]) => `${a}|${b}`))
const bothWays = (pairs: readonly WordPair[]): Replacement[] =>
  pairs.flatMap(([a, b]) => {
    const exchange = ROLES.has(`${a}|${b}`)
    return [
      { from: a, to: b, exchange },
      { from: b, to: a, exchange },
    ]
  })

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

const OPPOSITES = bothWays(OPPOSITE_PAIRS)
const NEGATIONS = bothWays(NEGATION_PAIRS)
// The loose opposites (trapDictionary LOOSE_OPPOSITE_PAIRS), each with its guard: not inside a set
// phrase ("trong khi"), or only as the note's last word ("cash in").
const nextWord = (text: string, end: number) => /^\s+([\p{L}\p{M}\p{N}]+)/u.exec(text.slice(end))?.[1]?.toLocaleLowerCase() ?? null
const LOOSE: readonly Replacement[] = LOOSE_OPPOSITE_PAIRS.flatMap(({ pair: [a, b], notBefore, atEnd }) => {
  const allow = (text: string, _start: number, end: number) => {
    const next = nextWord(text, end)
    if (atEnd) return next === null
    return !(next !== null && notBefore?.includes(next))
  }
  return [
    { from: a, to: b, allow },
    { from: b, to: a, allow },
  ]
})
const OPPOSITES_AND_LOOSE: readonly Replacement[] = [...OPPOSITES, ...LOOSE]
const NEGATIONS_ONE_WAY: readonly Replacement[] = NEGATION_PAIRS.map(([from, to]) => ({ from, to }))

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
    [...replaceEachMatch(text, OPPOSITES), ...operatorMutations(text)],
    rules.negate ? replaceEachMatch(text, NEGATIONS) : [],
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

// ── Typed variants (the 8-type question engine, questionEngine.ts) ──────────

// Negation words: a variant with two of them is a double negative, never offered.
const NEGATION_WORD = /(?<![\p{L}\p{M}\p{N}])(không|chẳng|chưa|not|no|never|cannot|n't)(?![\p{L}\p{M}\p{N}])/giu
const negations = (s: string) => [...s.matchAll(NEGATION_WORD)].length

// Type 1 (semantic antonym): the statement with one defining keyword swapped for its opposite
// (dictionary opposites and the author's own trap_rules.swaps first). Only when the tree allows it
// (trap_rules.negate) and the statement has no negation of its own, the predicate itself negated as
// the last resort ("is" → "is not"): the direct opposite of the claim, never a double negative.
// `loose`: the statement is a terse note, so everyday opposites count too ("ngoài" ↔ "trong", a
// final "in" ↔ "out"), which a full sentence uses far too freely to swap.
export function antonymVariants(statement: string, rules: TrapRules, { loose = false }: { loose?: boolean } = {}): string[] {
  const text = statement.normalize('NFC')
  const swaps = (rules.swaps ?? []).map((s) => ({ from: s.from.normalize('NFC'), to: s.to.normalize('NFC') }))
  const own = comparable(text)
  const out = new Map<string, string>()
  const negated = rules.negate && negations(text) === 0 ? replaceEachMatch(text, NEGATIONS_ONE_WAY) : []
  for (const v of [...replaceEachMatch(text, swaps), ...replaceEachMatch(text, loose ? OPPOSITES_AND_LOOSE : OPPOSITES), ...negated]) {
    const key = comparable(v)
    if (key !== own && negations(v) < 2 && !out.has(key)) out.set(key, v)
  }
  return [...out.values()]
}

// Type 4 (sibling swap): the statement with its subject swapped for a sibling's subject, the rest
// intact. A variant that is itself a sibling's true statement is dropped.
export function siblingSwapVariants(statement: string, siblings: readonly string[]): string[] {
  const text = statement.normalize('NFC')
  const sibs = normalizeSiblings(text, siblings)
  const taken = new Set([comparable(text), ...sibs.map(comparable)])
  const out = new Map<string, string>()
  for (const v of siblingSwaps(text, sibs)) {
    const key = comparable(v)
    if (!taken.has(key) && !out.has(key)) out.set(key, v)
  }
  return [...out.values()]
}

// Operator swaps between operands (+ ↔ −, × ↔ ÷, * ↔ /): one variant per operator.
export const operatorVariants = (statement: string): string[] => operatorMutations(statement.normalize('NFC'))

// One-word replacements of the given pairs, both ways, each match on its own (used for conditional
// clauses: an intensity or direction shift).
export const oppositeVariants = (text: string, { loose = false }: { loose?: boolean } = {}): string[] =>
  replaceEachMatch(text.normalize('NFC'), loose ? OPPOSITES_AND_LOOSE : OPPOSITES).filter((v) => negations(v) < 2)

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
