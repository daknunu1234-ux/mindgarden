// Question engine for mindmap notes (backend/ARCHITECTURE.md §7). Pure and deterministic: no
// Math.random, no Date, no DB, no network, plain text only. Same deck + note + seed → same question,
// so the server can re-build a question to grade it and the client never learns the answer early.
//
// Every note gets a question (zero drop). For each note the engine lists the question types its
// shape supports, then the seed picks one, so rounds vary:
//   cloze         a term blanked out: [author marks] first, else numbers / years / %, "quoted"
//                 terms, proper nouns and technical terms (ATP, JavaScript, Hà Nội)
//   recall-right  Key: Value / Key = Value / Key - Value / definitions ("X là Y"): "Key: ____"
//   recall-left   the same pair the other way round: "____: Value"
//   statement     which statement is true: trap mutations (trapEngine) of the note's full
//                 proposition (a predicate-only note inherits its root's title as its subject)
//   recognize     a short phrase / bullet item: which of these is filed under this root, with
//                 items from sibling categories as distractors
// Only when none of those fit, the fallbacks: `recognize` across the deck, then `exact` (spot the
// note among copies with two words swapped or one dropped). Every question is multiple choice and
// graded on the server: no self-graded cards, so mastery and coins can't be claimed.

import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import {
  clozeTargets,
  comparable,
  isShortPhrase,
  maskAt,
  numberDistractors,
  pairLine,
  parsePair,
  stripMarks,
  synthesizeProposition,
  type ClozeTarget,
  type Pair,
} from './notePatterns'
import { collectTrapTiers, generateTraps, type DrillChoice, type DrillTag, type TrapRules } from './trapEngine'

// One knowledge item with its place in the mindmap. `path` = root titles from the top-level root
// down to the item's own root (the breadcrumb); `ancestry` = the same roots' ids.
export type DeckNote = {
  id: string
  nodeId: string
  statement: string
  path: readonly string[]
  ancestry: readonly string[]
  rules: TrapRules
}

export type QuestionKind = 'cloze' | 'recall-right' | 'recall-left' | 'statement' | 'recognize' | 'exact'

export type Question = {
  kind: QuestionKind
  // Breadcrumb shown as a badge: [TypeScript › Compiler].
  context: string[]
  // The big line (a sentence with a blank, a key, "Which statement is true?") and the hint under it.
  prompt: string
  instruction: string
  choices: DrillChoice[]
  correctTag: DrillTag
}

export type QuestionResult = { ok: true; question: Question } | { ok: false; reason: 'UNDRILLABLE' }

const TAGS: readonly DrillTag[] = ['A', 'B', 'C', 'D']
const MAX_DISTRACTORS = 3
// Distractors come from the closest notes; a small window keeps them plausible yet varied.
const DISTRACTOR_WINDOW = 6

// ── Deck analysis (once per deck, then reused for every question) ─────────────

type Analyzed = DeckNote & {
  text: string
  key: string
  proposition: string
  inherited: boolean
  pair: Pair | null
  targets: ClozeTarget[]
  marked: boolean
  short: boolean
}

export type PreparedDeck = { notes: readonly Analyzed[]; byId: ReadonlyMap<string, Analyzed> }

export function prepareDeck(notes: readonly DeckNote[]): PreparedDeck {
  const analyzed = notes.map((note): Analyzed => {
    const { text, targets } = clozeTargets(note.statement)
    const proposition = synthesizeProposition(note.statement, note.path)
    return {
      ...note,
      text,
      key: comparable(text),
      proposition: proposition.text,
      inherited: proposition.inherited,
      pair: parsePair(text),
      targets,
      marked: targets.some((t) => t.kind === 'marked'),
      short: isShortPhrase(text),
    }
  })
  // Sorted, so nothing depends on the order rows came back from the database.
  analyzed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { notes: analyzed, byId: new Map(analyzed.map((n) => [n.id, n])) }
}

// How close another note sits in the mindmap: the number of roots their breadcrumbs share.
const closeness = (a: Analyzed, b: Analyzed) => {
  let i = 0
  while (i < a.ancestry.length && i < b.ancestry.length && a.ancestry[i] === b.ancestry[i]) i++
  return i
}

// Unique candidate texts (never the answer, never anything already in the note), closest first.
// When the note's own subject (its top-level root) has candidates, only those are used: a wrong
// answer from another subject ("s / t" for "Ty thể: ____") is too easy to rule out. Fewer, plausible
// choices beat four with an obvious odd one out.
function rankCandidates(note: Analyzed, candidates: { text: string; from: Analyzed }[], answer: string): string[] {
  const answerKey = comparable(answer)
  // The breadcrumb badge already shows these roots: offering one as a wrong answer gives it away.
  const seen = new Set<string>([answerKey, ...note.path.map(comparable)])
  const ranked = candidates
    .map((c) => ({ ...c, key: comparable(c.text), near: closeness(note, c.from) }))
    .filter((c) => c.key && !note.key.includes(c.key) && !answerKey.includes(c.key))
    .sort((a, b) => b.near - a.near || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)))
  const sameSubject = ranked.filter((c) => c.near >= 1)
  return (sameSubject.length > 0 ? sameSubject : ranked).map((c) => c.text)
}

function multipleChoice(answer: string, ranked: readonly string[], random: () => number): { choices: DrillChoice[]; correctTag: DrillTag } {
  const picked = seededShuffle(ranked.slice(0, DISTRACTOR_WINDOW), random).slice(0, MAX_DISTRACTORS)
  const texts = seededShuffle([answer, ...picked], random)
  return { choices: texts.map((text, i) => ({ tag: TAGS[i], text })), correctTag: TAGS[texts.indexOf(answer)] }
}

// ── Plans: one per question type a note supports ─────────────────────────────

type Plan = { kind: QuestionKind; build: (random: () => number, seed: string) => Question }

const others = (deck: PreparedDeck, note: Analyzed) => deck.notes.filter((n) => n.id !== note.id)

function clozePlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  // Wrong terms come from other notes' terms (never root titles: a category name is no plausible
  // filler for a sentence); numbers get plausible wrong numbers instead.
  const termPool = others(deck, note).flatMap((n) => n.targets.filter((t) => t.kind !== 'number').map((t) => ({ text: t.term, from: n })))
  const targets = note.marked ? note.targets.filter((t) => t.kind === 'marked') : note.targets
  const viable = targets
    .map((t) => ({ target: t, ranked: t.kind === 'number' ? numberDistractors(t.term) : rankCandidates(note, termPool, t.term) }))
    .filter((v) => v.ranked.length > 0)
  if (viable.length === 0) return null
  return {
    kind: 'cloze',
    build: (random) => {
      const { target, ranked } = viable[Math.floor(random() * viable.length)]
      return {
        kind: 'cloze',
        context: [...note.path],
        prompt: maskAt(note.text, target),
        instruction: 'Fill in the blank',
        ...multipleChoice(target.term, ranked, random),
      }
    },
  }
}

function pairPlans(deck: PreparedDeck, note: Analyzed): Plan[] {
  const pair = note.pair
  if (!pair) return []
  const pairs = others(deck, note).filter((n) => n.pair)
  const plans: Plan[] = []
  for (const side of ['right', 'left'] as const) {
    const answer = pair[side]
    const ranked = rankCandidates(
      note,
      pairs.map((n) => ({ text: n.pair![side], from: n })),
      answer,
    )
    if (ranked.length === 0) continue
    const kind: QuestionKind = side === 'right' ? 'recall-right' : 'recall-left'
    plans.push({
      kind,
      build: (random) => ({
        kind,
        context: [...note.path],
        prompt: pairLine(pair, side),
        instruction: side === 'right' ? 'Recall what goes with it' : 'Which one is it?',
        ...multipleChoice(answer, ranked, random),
      }),
    })
  }
  return plans
}

function statementPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const siblings = deck.notes.filter((n) => n.nodeId === note.nodeId && n.id !== note.id).map((n) => n.proposition)
  if (collectTrapTiers(note.proposition, note.rules, siblings).every((tier) => tier.length === 0)) return null
  return {
    kind: 'statement',
    build: (_random, seed) => {
      const traps = generateTraps(note.proposition, note.rules, `${seed}:statement`, siblings)
      if (!traps.ok) throw new Error('statementPlan: traps vanished') // unreachable: checked above
      return {
        kind: 'statement',
        context: [...note.path],
        prompt: 'Which statement is true?',
        instruction: note.inherited ? `About ${note.path[note.path.length - 1]}` : '',
        choices: traps.choices,
        correctTag: traps.correctTag,
      }
    },
  }
}

// Notes that aren't filed under this note's root (nor anywhere below it): fair "wrong" answers.
function recognitionPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const sameRoot = new Set(deck.notes.filter((n) => n.nodeId === note.nodeId).map((n) => n.key))
  const outside = others(deck, note).filter((n) => n.nodeId !== note.nodeId && !n.ancestry.includes(note.nodeId) && !sameRoot.has(n.key))
  const ranked = rankCandidates(
    note,
    outside.map((n) => ({ text: n.text, from: n })),
    note.text,
  )
  if (ranked.length === 0 || note.path.length === 0) return null
  const root = note.path[note.path.length - 1]
  return {
    kind: 'recognize',
    build: (random) => ({
      kind: 'recognize',
      context: [...note.path],
      prompt: `Which note belongs under “${root}”?`,
      instruction: 'Pick the one filed under this root',
      ...multipleChoice(note.text, ranked, random),
    }),
  }
}

// Copies of the note with two neighbouring words swapped or one word dropped (one word: two
// neighbouring letters swapped). Distinct from the note, so exactly one choice is the note.
export function exactVariants(text: string): string[] {
  const out = new Set<string>()
  const w = text.split(' ').filter(Boolean)
  if (w.length >= 2) {
    for (let i = 0; i + 1 < w.length; i++) {
      if (comparable(w[i]) === comparable(w[i + 1])) continue
      out.add([...w.slice(0, i), w[i + 1], w[i], ...w.slice(i + 2)].join(' '))
    }
    if (w.length >= 3) for (let i = 0; i < w.length; i++) out.add([...w.slice(0, i), ...w.slice(i + 1)].join(' '))
  } else {
    const chars = [...text]
    for (let i = 0; i + 1 < chars.length; i++) {
      if (chars[i] === chars[i + 1]) continue
      out.add([...chars.slice(0, i), chars[i + 1], chars[i], ...chars.slice(i + 2)].join(''))
    }
  }
  const own = comparable(text)
  return [...out].filter((v) => comparable(v) !== own)
}

function exactPlan(note: Analyzed): Plan | null {
  const variants = exactVariants(note.text)
  if (variants.length === 0) return null
  return {
    kind: 'exact',
    build: (random) => ({
      kind: 'exact',
      context: [...note.path],
      prompt: 'Which is exactly your note?',
      instruction: 'Spot the original',
      ...multipleChoice(note.text, variants, random),
    }),
  }
}

// The question types a note supports: its own (author marks → cloze only), else the fallbacks.
function plansFor(deck: PreparedDeck, note: Analyzed): Plan[] {
  if (note.marked) {
    const cloze = clozePlan(deck, note)
    if (cloze) return [cloze]
  }
  const primary = [
    clozePlan(deck, note),
    ...pairPlans(deck, note),
    statementPlan(deck, note),
    note.short ? recognitionPlan(deck, note) : null,
  ].filter((p): p is Plan => p !== null)
  if (primary.length > 0) return primary
  const fallback = recognitionPlan(deck, note) ?? exactPlan(note)
  return fallback ? [fallback] : []
}

// What a note can be asked as (no seed involved): used to check drillability and in tests.
export function questionKinds(deck: PreparedDeck, noteId: string): QuestionKind[] {
  const note = deck.byId.get(noteId)
  return note ? plansFor(deck, note).map((p) => p.kind) : []
}

// One question for one note. The seed picks the type (when there are several) and the choices.
export function buildQuestion(deck: PreparedDeck, noteId: string, seed: string): QuestionResult {
  const note = deck.byId.get(noteId)
  if (!note) return { ok: false, reason: 'UNDRILLABLE' }
  const plans = plansFor(deck, note)
  if (plans.length === 0) return { ok: false, reason: 'UNDRILLABLE' }
  const random = seededRandom(seed)
  const plan = plans[Math.floor(random() * plans.length)]
  return { ok: true, question: plan.build(random, seed) }
}

// Can this statement always be asked, whatever else is in the deck? Only a note with no two
// distinct words or letters can't (e.g. "aaa"): every other note at least gets the `exact` card.
export const isNoteDrillable = (statement: string): boolean => exactVariants(stripMarks(statement).text).length > 0

// A loaded drill item (decks' DrillSourceItem shape) as an engine note. Every caller that builds or
// grades a question turns the WHOLE deck into notes this way, so they all see the same context.
export const toDeckNote = (item: {
  id: string
  nodeId: string
  nodeTitle?: string
  correctStmt: string
  trapRules: TrapRules
  path?: readonly string[]
  ancestry?: readonly string[]
}): DeckNote => ({
  id: item.id,
  nodeId: item.nodeId,
  statement: item.correctStmt,
  path: item.path ?? (item.nodeTitle ? [item.nodeTitle] : []),
  ancestry: item.ancestry ?? [item.nodeId],
  rules: item.trapRules,
})
