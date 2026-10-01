// Note patterns for mindmap note-taking (pure, deterministic, plain text only; no LaTeX, no DB).
// Mindmap notes are fragments: "compiles down to clean JavaScript" under a "TypeScript" root,
// "Ty thể: nhà máy năng lượng", "ATP", "ra đời năm 2012". These helpers read such notes so the
// question engine (questionEngine.ts) can always build a fair, server-gradable question.

import { extractSubject } from './trapEngine'
import { CLAUSE_STARTERS, PREDICATE_MARKERS } from './trapDictionary'

const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}]'
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)
const startsWithPhrase = (text: string, phrase: string) =>
  new RegExp(`^${words(phrase).map(escapeRegExp).join('\\s+')}(?!${WORD_CHAR})`, 'iu').test(text)

export const comparable = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

// ── Author cloze marks ───────────────────────────────────────────────────────
// "[Ty thể] sản sinh ATP": brackets mark what the author wants asked. They're stripped for
// display; their spans become the preferred cloze targets.

export type Span = { start: number; end: number }

export function stripMarks(statement: string): { text: string; marked: Span[] } {
  // Whitespace is collapsed first, so the spans found below are positions in the returned text.
  const source = statement.normalize('NFC').replace(/\s+/g, ' ').trim()
  const marked: Span[] = []
  let text = ''
  let last = 0
  for (const m of source.matchAll(/\[\s*([^[\]]*?)\s*\]/gu)) {
    text += source.slice(last, m.index)
    if (m[1]) {
      marked.push({ start: text.length, end: text.length + m[1].length })
      text += m[1]
    }
    last = m.index + m[0].length
  }
  text += source.slice(last)
  return { text, marked }
}

// ── Implicit subject (contextual inheritance) ────────────────────────────────

const CLAUSE = CLAUSE_STARTERS.map((c) => (t: string) => startsWithPhrase(t, c))
const isLowerStart = (t: string) => {
  const c = t.charAt(0)
  return c !== c.toLocaleUpperCase() && c === c.toLocaleLowerCase()
}

// A predicate-only note has no subject of its own: it starts with a predicate word ("is a superset
// of JavaScript", "sản sinh ATP"), or it's a lower-case fragment of 2+ words in which no subject can
// be found ("compiles down to clean JavaScript"). Clauses ("khi nhiệt độ tăng…"), key–value notes
// and notes with their own subject are left alone.
export function isPredicateOnly(text: string): boolean {
  const t = text.trim()
  if (!t || parsePair(t) || CLAUSE.some((starts) => starts(t))) return false
  if (PREDICATE_MARKERS.some((m) => startsWithPhrase(t, m))) return true
  return isLowerStart(t) && words(t).length >= 2 && extractSubject(t) === null
}

export type Proposition = { text: string; inherited: boolean }

// The full proposition a note stands for: predicate-only notes borrow their root's title as the
// subject ("TypeScript" + "compiles down to clean JavaScript" → "TypeScript compiles down to clean
// JavaScript"). `path` = the breadcrumb from the top-level root down to the note's own root.
export function synthesizeProposition(statement: string, path: readonly string[]): Proposition {
  const { text } = stripMarks(statement)
  const subject = path.at(-1)?.trim()
  if (!subject || !isPredicateOnly(text)) return { text, inherited: false }
  return { text: `${subject} ${text}`, inherited: true }
}

// ── Pairs: Key: Value, Key - Value, Key = Value, and definitions ─────────────

export type Pair = { left: string; right: string; joiner: string }

const MAX_KEY_WORDS = 8
const MAX_TERM_WORDS = 6
// Longest first, so "có nghĩa là" wins over "là" and "is defined as" over "is".
const DEFINITION_MARKERS = [
  'được định nghĩa là', 'có nghĩa là', 'được gọi là', 'nghĩa là', 'là',
  'is defined as', 'is known as', 'refers to', 'stands for', 'means', 'is', 'are',
]
const MARKER_REGEXES = DEFINITION_MARKERS.map((m) => ({
  marker: m,
  regex: new RegExp(`(?<!${WORD_CHAR})${words(m).map(escapeRegExp).join('\\s+')}(?!${WORD_CHAR})`, 'iu'),
}))

function keyValue(text: string): Pair | null {
  // "Key: Value" (not a time like 10:30 or a URL), then spaced "Key = Value", then spaced dashes.
  const separators: { regex: RegExp; joiner: string }[] = [
    { regex: /(?<!\d):(?!\/\/)(?!\d)/u, joiner: ':' },
    { regex: /\s=\s/u, joiner: '=' },
    { regex: /\s[-–—]\s/u, joiner: '–' },
  ]
  for (const { regex, joiner } of separators) {
    const m = regex.exec(text)
    if (!m) continue
    const left = text.slice(0, m.index).trim()
    const right = text.slice(m.index + m[0].length).trim()
    if (!left || !right || words(left).length > MAX_KEY_WORDS || left.length > 80) continue
    return { left, right, joiner }
  }
  return null
}

function definition(text: string): Pair | null {
  let best: { at: number; length: number; marker: string } | null = null
  for (const { marker, regex } of MARKER_REGEXES) {
    const m = regex.exec(text)
    if (!m || m.index === 0) continue
    // Earliest marker wins; at the same spot the longer one does (they're listed longest first).
    if (!best || m.index < best.at) best = { at: m.index, length: m[0].length, marker }
  }
  if (!best) return null
  const left = text.slice(0, best.at).trim()
  const right = text.slice(best.at + best.length).trim()
  if (!left || !right || /[,;]/.test(left) || words(left).length > MAX_TERM_WORDS) return null
  if (CLAUSE.some((starts) => starts(left))) return null
  return { left, right, joiner: best.marker }
}

// The two halves of a key–value or definition note, or null for any other shape.
export function parsePair(text: string): Pair | null {
  const t = text.trim()
  return keyValue(t) ?? definition(t)
}

// How a pair reads back with one half blanked: "Ty thể: ____", "____ là bào quan…".
export const pairLine = (pair: Pair, side: 'left' | 'right', blank = '____'): string =>
  pair.joiner === ':' ? (side === 'left' ? `${blank}: ${pair.right}` : `${pair.left}: ${blank}`) : side === 'left' ? `${blank} ${pair.joiner} ${pair.right}` : `${pair.left} ${pair.joiner} ${blank}`

// ── Cloze candidates ─────────────────────────────────────────────────────────

export type ClozeKind = 'marked' | 'number' | 'quoted' | 'term'
export type ClozeTarget = Span & { term: string; kind: ClozeKind }

const NUMBER = /(?<![\p{L}\p{N}.,])-?\d+(?:[.,]\d+)?%?(?![\p{L}\p{N}])/gu
const QUOTED = /["“«`']([^"”»`']{1,60})["”»`']/gu
// A word with a capital letter that isn't just the sentence's first letter: ATP, JavaScript,
// Hà Nội (mid-sentence). Runs of such words join into one term ("New York").
const TERM_WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]*/gu

const hasInnerCapital = (w: string) => /\p{Lu}/u.test(w.slice(1))
const isCapitalized = (w: string) => /^\p{Lu}/u.test(w)

function termTargets(text: string): ClozeTarget[] {
  const out: ClozeTarget[] = []
  let run: ClozeTarget | null = null
  let sentenceStart = true
  for (const m of text.matchAll(TERM_WORD)) {
    const w = m[0].replace(/[.'’-]+$/u, '')
    const atStart = sentenceStart
    // A sentence ends at . ! ? before the next word.
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2)
    sentenceStart = /^[.!?]/.test(after) || /[.!?]$/.test(m[0])
    const isTerm = w.length >= 2 && ((isCapitalized(w) && !atStart) || hasInnerCapital(w) || (w.length >= 2 && w === w.toUpperCase() && /\p{Lu}/u.test(w)))
    if (isTerm) {
      const start = m.index
      const end = m.index + w.length
      const prev: ClozeTarget | null = run
      if (prev && /^\s+$/.test(text.slice(prev.end, start))) {
        // The next capitalised word of the same name ("New York"): grow the term.
        const grown: ClozeTarget = { ...prev, end, term: text.slice(prev.start, end) }
        out[out.length - 1] = grown
        run = grown
      } else {
        const next: ClozeTarget = { start, end, term: w, kind: 'term' }
        out.push(next)
        run = next
      }
    } else run = null
  }
  return out
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

// Everything a cloze card could blank out, author marks first. The whole note never counts (a
// one-word note is asked by recognition instead), and targets never overlap.
export function clozeTargets(statement: string): { text: string; targets: ClozeTarget[] } {
  const { text, marked } = stripMarks(statement)
  const targets: ClozeTarget[] = marked.map((s) => ({ ...s, term: text.slice(s.start, s.end), kind: 'marked' }))
  const add = (t: ClozeTarget) => {
    if (comparable(t.term) === comparable(text) || targets.some((o) => overlaps(o, t))) return
    targets.push(t)
  }
  for (const m of text.matchAll(NUMBER)) add({ start: m.index, end: m.index + m[0].length, term: m[0], kind: 'number' })
  for (const m of text.matchAll(QUOTED)) {
    const start = m.index + 1
    add({ start, end: start + m[1].length, term: m[1], kind: 'quoted' })
  }
  for (const t of termTargets(text)) add(t)
  return { text, targets: targets.sort((a, b) => a.start - b.start) }
}

export const maskAt = (text: string, span: Span, blank = '____') => text.slice(0, span.start) + blank + text.slice(span.end)

// Wrong numbers that look right: a year stays a plausible year, a percentage stays a percentage,
// decimals keep their precision. Never the number itself, never negative unless it was.
export function numberDistractors(term: string): string[] {
  const percent = term.endsWith('%')
  const raw = percent ? term.slice(0, -1) : term
  const comma = raw.includes(',') && !raw.includes('.')
  const value = Number(raw.replace(',', '.'))
  if (!Number.isFinite(value)) return []
  const decimals = (raw.split(/[.,]/)[1] ?? '').length
  const step = decimals > 0 ? 10 ** -decimals : 1
  const isYear = decimals === 0 && !percent && value >= 1000 && value <= 2999
  const deltas = isYear ? [1, -1, 2, -2, 10, -10] : [step, -step, value * 2 - value, -value / 2, 10 * step, -10 * step]
  const out: string[] = []
  for (const d of deltas) {
    let next = value + d
    if (value >= 0 && next < 0) continue
    next = Number(next.toFixed(decimals))
    if (next === value) continue
    let s = next.toFixed(decimals)
    if (comma) s = s.replace('.', ',')
    if (percent) s += '%'
    if (!out.includes(s)) out.push(s)
  }
  return out
}

// ── Short phrases (bullet items) ─────────────────────────────────────────────

const MAX_PHRASE_WORDS = 5

// A term or short label ("Mitochondria", "Golgi apparatus", "useEffect hook"): few words and no
// sentence shape (no pair, no subject + predicate, no predicate-only fragment).
export function isShortPhrase(text: string): boolean {
  const t = text.trim()
  if (!t || words(t).length > MAX_PHRASE_WORDS || parsePair(t)) return false
  return extractSubject(t) === null && !PREDICATE_MARKERS.some((m) => startsWithPhrase(t, m))
}
