// Statement shapes for the conceptual question types (pure, deterministic, plain text; no LaTeX, no
// DB, no network). The question engine (questionEngine.ts) asks:
//   • conditional / causal statements ("A does B when C", "When C, A does B", "Khi C, A B") from both
//     angles (what happens under C; under which condition A does B),
//   • statements with a worked example ("…, e.g. …", "Ví dụ: …") as scenarios to name the concept of,
//   • formulas and indexed statements (D0, D1, t + 1, 1 + r, r − g, fractions) with index, compounding,
//     sign and fraction mutations.
// Every variant is a well-formed expression of the same shape as the original: no misspellings, no
// lookalike words, no added negation.

import { comparable } from './notePatterns'
import { operatorVariants } from './trapEngine'

const WORD = '[\\p{L}\\p{M}\\p{N}]'
const trimEnd = (s: string) => s.trim().replace(/[\s.;:!]+$/u, '')
const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)

// ── Conditional / causal clauses: A does B when C ────────────────────────────

// Connectors that open a condition (or a cause). Longest first, so "as soon as" wins over "as".
const CONNECTORS = ['as soon as', 'whenever', 'because', 'when', 'once', 'if', 'khi', 'nếu', 'hễ', 'vì'] as const

export type Conditional = {
  // The main clause (agent + action / outcome): "gas pressure increases".
  main: string
  // The condition (or cause) without its connector: "the temperature rises".
  condition: string
  // The connector as written: "when", "Khi".
  connector: string
  // Where the condition sits in the statement.
  order: 'condition-first' | 'condition-last'
}

const connectorBody = (c: string) => c.split(' ').join('\\s+')
const FIRST = new RegExp(`^(${CONNECTORS.map(connectorBody).join('|')})(?!${WORD})\\s+(.+?),\\s*(?:(?:thì|then)\\s+)?(.+)$`, 'iu')
const LAST = new RegExp(`^(.+?)\\s+(${CONNECTORS.map(connectorBody).join('|')})(?!${WORD})\\s+(.+)$`, 'iu')
const enoughWords = (s: string, n = 2) => s.trim().split(/\s+/).length >= n

// Splits a conditional or causal statement into its main clause and condition; null for any other
// shape (no connector, a fragment too short to stand alone, a list).
export function parseConditional(statement: string): Conditional | null {
  const text = trimEnd(statement.normalize('NFC').replace(/\s+/g, ' '))
  const first = FIRST.exec(text)
  if (first) {
    const [, connector, condition, main] = first
    if (enoughWords(condition) && enoughWords(main) && !/[,;]/.test(main)) return { main: trimEnd(main), condition: trimEnd(condition), connector, order: 'condition-first' }
  }
  const last = LAST.exec(text)
  if (last) {
    const [, main, connector, condition] = last
    if (enoughWords(main) && enoughWords(condition) && !/[,;]/.test(main)) return { main: trimEnd(main), condition: trimEnd(condition), connector, order: 'condition-last' }
  }
  return null
}

// The main clause as a stand-alone sentence ("Gas pressure increases."), and the condition as a
// clause with its connector ("when the temperature rises").
export const mainSentence = (c: Pick<Conditional, 'main'>) => `${capitalize(c.main)}.`
export const conditionClause = (c: Pick<Conditional, 'connector' | 'condition'>) => `${c.connector.toLocaleLowerCase()} ${c.condition}`

// ── Scenarios: a statement carrying a worked example ─────────────────────────

const EXAMPLE_MARKERS = ['for example', 'for instance', 'e.g.', 'such as', 'ví dụ như', 'ví dụ', 'chẳng hạn như', 'chẳng hạn', 'vd']
const markerBody = (m: string) => m.split(' ').map((w) => w.replace(/\./g, '\\.')).join('\\s+')
const INLINE = new RegExp(`^(.+?)[\\s,;:(—–-]+(?:${EXAMPLE_MARKERS.map(markerBody).join('|')})(?!${WORD})[\\s,:]*(.+?)\\)?$`, 'iu')
const LEADING = new RegExp(`^(?:${EXAMPLE_MARKERS.map(markerBody).join('|')}|example)(?!${WORD})\\s*[:—–-]\\s*(.+)$`, 'iu')

export type Scenario = {
  // The worked example: the scenario shown to the player.
  example: string
  // The claim it illustrates (null when the whole note is an example of its root).
  claim: string | null
}

// The example a statement gives, if it gives one ("Diffusion moves particles down a gradient, e.g. a
// drop of ink spreading in water" → example "a drop of ink spreading in water").
export function parseScenario(statement: string): Scenario | null {
  const text = trimEnd(statement.normalize('NFC').replace(/\s+/g, ' '))
  const leading = LEADING.exec(text)
  if (leading && enoughWords(leading[1], 3)) return { example: trimEnd(leading[1]), claim: null }
  const inline = INLINE.exec(text)
  if (inline && enoughWords(inline[2], 3) && enoughWords(inline[1])) return { example: trimEnd(inline[2]), claim: trimEnd(inline[1]) }
  return null
}

// The concept a claim is about: its subject, before its first verb. Besides the trap dictionary's
// predicate markers, verbs that describe a process or mechanism count here ("Diffusion | moves …",
// "Osmosis | causes …"). Null when no verb is found or the subject would be long or a clause.
const PROCESS_VERBS = [
  'moves', 'move', 'causes', 'cause', 'occurs', 'occur', 'happens', 'happen', 'spreads', 'spread', 'flows', 'flow',
  'turns', 'turn', 'converts', 'convert', 'allows', 'allow', 'uses', 'use', 'requires', 'require', 'transfers', 'transfer',
  'carries', 'carry', 'breaks', 'break', 'builds', 'build', 'forms', 'form', 'changes', 'change', 'raises', 'raise', 'lowers', 'lower',
  'di chuyển', 'gây ra', 'xảy ra', 'chuyển', 'biến đổi', 'cho phép', 'sử dụng', 'tạo thành', 'làm',
]
export function conceptOf(claim: string, predicateMarkers: readonly string[]): string | null {
  const text = claim.normalize('NFC').trim()
  const verbs = [...predicateMarkers, ...PROCESS_VERBS]
  const hits: { at: number; end: number }[] = []
  for (const verb of verbs) {
    for (const m of text.matchAll(new RegExp(`(?<!${WORD})${verb.split(' ').join('\\s+')}(?!${WORD})`, 'giu'))) {
      if (m.index > 0) hits.push({ at: m.index, end: m.index + m[0].length })
    }
  }
  hits.sort((a, b) => a.at - b.at)
  // A verb-like word followed straight away by another verb is part of the subject ("Active
  // transport | consumes ATP"): the cut is at the last of such a run.
  const startsAt = new Set(hits.map((h) => h.at))
  const cut = hits.find((h) => {
    const next = text.slice(h.end).match(/^\s+/)
    return !(next && startsAt.has(h.end + next[0].length))
  })?.at ?? null
  if (cut === null) return null
  const subject = text.slice(0, cut).trim()
  if (!subject || /[,;:]/.test(subject) || subject.split(/\s+/).length > 5) return null
  return subject
}

// ── Formulas and indexed statements ──────────────────────────────────────────

// An indexed variable: a short name with a numeric subscript (D0, D_1, P1).
const INDEXED = new RegExp(`(?<!${WORD})([A-Za-z]{1,3})(_?)(\\d{1,2})(?!${WORD})`, 'gu')
// A time step: t + 1, n - 1.
const STEP = new RegExp(`(?<!${WORD})([a-z])\\s*([+-])\\s*1(?![\\d.])`, 'gu')
// A compounding factor: (1 + r), 1 + r.
const COMPOUND = new RegExp(`\\(\\s*1\\s*\\+\\s*([a-z])\\s*\\)|(?<![\\w.(])1\\s*\\+\\s*([a-z])(?!${WORD})`, 'gu')
// A fraction between two simple operands: x / y, (a + b) / (c - d).
const FRACTION = /(\([^()]+\)|[\p{L}\p{N}_]+)\s*\/\s*(\([^()]+\)|[\p{L}\p{N}_]+)/gu

// Whether a statement is a formula or indexed expression: an equation or a ratio between symbols,
// indexed variables, a time step or a compounding factor.
export function isFormula(statement: string): boolean {
  const text = statement.normalize('NFC')
  INDEXED.lastIndex = STEP.lastIndex = COMPOUND.lastIndex = FRACTION.lastIndex = 0
  return /[=≈]/u.test(text) || INDEXED.test(text) || STEP.test(text) || COMPOUND.test(text) || /[\p{L}\p{N})]\s*\/\s*[\p{L}\p{N}(]/u.test(text)
}

const replaceAt = (text: string, start: number, end: number, by: string) => text.slice(0, start) + by + text.slice(end)

// Distinct well-formed mutations of a formula, each changing one thing:
//   • a time / index anchor: D0 ↔ D1 (an index n becomes n + 1, or n − 1 from 1 up), t + 1 ↔ t
//   • a compounding factor: (1 + r) → r
//   • an operator sign: + ↔ −, × ↔ ÷ (between operands, e.g. r − g → r + g)
//   • a fraction turned upside down: a / b → b / a
export function formulaVariants(statement: string): string[] {
  const text = statement.normalize('NFC')
  if (!isFormula(text)) return []
  const out: string[] = []
  for (const m of text.matchAll(INDEXED)) {
    const n = Number(m[3])
    for (const next of n === 0 ? [1] : [n + 1, n - 1]) out.push(replaceAt(text, m.index, m.index + m[0].length, `${m[1]}${m[2]}${next}`))
  }
  for (const m of text.matchAll(STEP)) out.push(replaceAt(text, m.index, m.index + m[0].length, m[1]))
  for (const m of text.matchAll(COMPOUND)) out.push(replaceAt(text, m.index, m.index + m[0].length, m[1] ?? m[2]))
  out.push(...operatorVariants(text))
  for (const m of text.matchAll(FRACTION)) {
    if (comparable(m[1]) === comparable(m[2])) continue
    out.push(replaceAt(text, m.index, m.index + m[0].length, `${m[2]} / ${m[1]}`))
  }
  const own = comparable(text)
  const seen = new Set<string>()
  return out.filter((v) => {
    const key = comparable(v)
    if (key === own || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
