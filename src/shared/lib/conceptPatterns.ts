// Statement shapes for the conceptual question types (pure, deterministic, plain text; no LaTeX, no
// DB, no network). The question engine (questionEngine.ts) asks:
//   • conditional / causal statements ("A does B when C", "When C, A does B", "Khi C, A B") from both
//     angles (what happens under C; under which condition A does B),
//   • statements with a worked example ("…, e.g. …", "Ví dụ: …") as scenarios to name the concept of,
//   • formulas and indexed statements (D0, D1, t + 1, 1 + r, r − g, fractions) with index, compounding,
//     sign and fraction mutations.
// Every variant is a well-formed expression of the same shape as the original: no misspellings, no
// lookalike words, no added negation.

import { comparable, parsePair } from './notePatterns'
import { ACTION_VERBS, CLAUSE_STARTERS, LINKING_WORDS, PREDICATE_MARKERS } from './trapDictionary'
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

// ── Declarative statements: subject, action, object ──────────────────────────

export type Parts = {
  // What the statement is about: "Ribosomes", "Active transport", "Ty thể".
  subject: string
  // Everything after the subject, as written (leading space and final punctuation included): the
  // statement is always subject + rest.
  rest: string
  // The predicate without final punctuation: "synthesize proteins".
  predicate: string
  // The verb as written ("synthesize", "sản sinh") and what follows it ("proteins"; '' when nothing).
  action: string
  object: string
  // 'action': split at a known action verb, so action and object can be asked on their own.
  // 'linking': split at a linking or auxiliary word ("is", "has", "can", "là", "có").
  // 'guess': no known verb; the second word of a short sentence is taken as its verb (or, for a
  // fragment under a root, the whole fragment as the predicate). Only the subject and the whole
  // predicate are used then, always as written.
  // 'note': shorthand, "Term: explanation" / "Term - explanation" / "Term (details)": the term is the
  // subject and the explanation what is said about it (no verb, so no action or object).
  kind: 'action' | 'linking' | 'guess' | 'note'
}

// Shorthand notes: "MBIs: người ngoài mua lại", "Mitochondria - powerhouse of the cell", "NADH
// (electron carrier)". The term (A) is the subject, the explanation (B) its mechanism. Not an equation
// ("v = s / t"), and the term is short (a label, not a clause).
const PARENTHETICAL = /^([^():=]{1,60}?)\s*\(([^()]{3,})\)[.!]?$/u
const MAX_TERM = 6
export function parseShorthand(statement: string): Parts | null {
  const text = statement.normalize('NFC').replace(/\s+/g, ' ').trim()
  const pair = parsePair(text)
  let subject: string | null = null
  let predicate = ''
  if (pair && (pair.joiner === ':' || pair.joiner === '–')) {
    subject = pair.left
    predicate = trimEnd(pair.right)
  } else if (!pair) {
    const m = PARENTHETICAL.exec(text)
    if (m) {
      subject = m[1].trim()
      predicate = m[2].trim()
    }
  }
  if (!subject || !predicate || subject.split(' ').length > MAX_TERM || !text.startsWith(subject)) return null
  if (comparable(subject) === comparable(predicate)) return null
  return { subject, rest: text.slice(subject.length), predicate, action: '', object: '', kind: 'note' }
}

const phraseBody = (p: string) => p.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
// Longest first, so "breaks down" wins over "breaks" and "làm tăng" over "tăng".
const VERB_LIST = [...new Set([...PREDICATE_MARKERS, ...PROCESS_VERBS, ...ACTION_VERBS])].sort((a, b) => b.length - a.length)
const VERBS = new RegExp(`(?<!${WORD})(?:${VERB_LIST.map(phraseBody).join('|')})(?!${WORD})`, 'giu')
const LINKING = new Set(LINKING_WORDS)
// A verb-like word right after one of these is a noun ("the control unit", "các điều khiển").
const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'every', 'its', 'their', 'our', 'your', 'of', 'một', 'các', 'những', 'mỗi', 'sự', 'quá trình'])
const CLAUSES = CLAUSE_STARTERS.map((c) => new RegExp(`^${phraseBody(c)}(?!${WORD})`, 'iu'))
const VIETNAMESE = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/iu
// Words that never are the verb of a guessed split.
const NOT_A_VERB = new Set(['of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'and', 'or', 'the', 'a', 'an', 'that', 'which', 'as', 'than', 'between', 'into', 'during', 'per', 'via', 'not', 'also', 'only'])
const MAX_SUBJECT = 6

const lastWord = (s: string) => s.trim().split(/\s+/).pop()?.toLocaleLowerCase() ?? ''

// Where the predicate of a plain sentence starts: the first known verb that is not part of the
// subject. A verb right after a determiner is a noun; so is one followed straight away by another
// verb ("Active transport | consumes ATP", "Unit tests | verify behaviour"), unless it is a linking
// word ("TypeScript | was released").
function verbCut(text: string): { at: number; end: number } | null {
  const hits = [...text.matchAll(VERBS)].filter((m) => m.index > 0).map((m) => ({ at: m.index, end: m.index + m[0].length, linking: LINKING.has(m[0].toLocaleLowerCase()) }))
  return (
    hits.find((h) => {
      if (DETERMINERS.has(lastWord(text.slice(0, h.at)))) return false
      if (h.linking) return true
      const gap = text.slice(h.end).match(/^\s+/)
      const next = gap ? hits.find((o) => o.at === h.end + gap[0].length) : undefined
      // …but a verb-like word that ends the sentence is the object ("Tariffs | restrict | imports.").
      return !next || trimEnd(text.slice(next.end)) === ''
    }) ?? null
  )
}

// A written sentence with no known verb ("Lysosomes digest waste."): a capitalised one-word subject,
// then the verb. Only for a short English sentence that ends with a full stop (a label such as
// "Golgi apparatus" doesn't), so a noun phrase is never cut in two.
function guessCut(text: string): { at: number; end: number } | null {
  if (VIETNAMESE.test(text) || !/[.!]$/.test(text)) return null
  const w = text.split(' ')
  if (w.length < 3 || w.length > 8 || !/^\p{Lu}[\p{L}\p{N}-]*$/u.test(w[0]) || DETERMINERS.has(w[0].toLocaleLowerCase())) return null
  if (!/^[a-z]{3,}$/.test(w[1]) || NOT_A_VERB.has(w[1])) return null
  const at = w[0].length + 1
  return { at, end: at + w[1].length }
}

// Splits a plain declarative statement into subject, action and object. No connector, example
// marker or special formatting is needed. Null for anything that is not a subject followed by a
// predicate: an equation, a clause ("When …"), a list, a label, a long or punctuated subject.
// `forcedSubject`: the statement is known to start with this subject (a note that inherits its root).
export function decompose(statement: string, forcedSubject?: string): Parts | null {
  const text = statement.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!text || /[=≈]/u.test(text)) return null
  let cut: { at: number; end: number } | null
  let guessed = false
  if (forcedSubject) {
    const subject = forcedSubject.normalize('NFC').replace(/\s+/g, ' ').trim()
    if (!subject || !text.startsWith(`${subject} `)) return null
    const at = subject.length + 1
    VERBS.lastIndex = at
    const m = VERBS.exec(text)
    VERBS.lastIndex = 0
    // A note that opens with a verb gives action and object; any other fragment under a root
    // ("double membrane", "người ngoài mua lại") is taken whole, as what is said about the root.
    cut = m && m.index === at ? { at, end: at + m[0].length } : { at, end: at }
    guessed = cut.end === at
  } else {
    cut = verbCut(text)
    if (!cut) {
      cut = guessCut(text)
      guessed = cut !== null
    }
  }
  if (!cut) return null
  const subject = text.slice(0, cut.at).trim()
  if (!subject || (!forcedSubject && (/[,;:(]/.test(subject) || subject.split(' ').length > MAX_SUBJECT || CLAUSES.some((r) => r.test(subject))))) return null
  const predicate = trimEnd(text.slice(cut.at))
  const action = text.slice(cut.at, cut.end)
  const object = trimEnd(text.slice(cut.end))
  if (!predicate || comparable(predicate) === comparable(subject)) return null
  const kind: Parts['kind'] = guessed ? 'guess' : LINKING.has(action.toLocaleLowerCase()) ? 'linking' : 'action'
  return { subject, rest: text.slice(subject.length), predicate, action, object, kind }
}
