// Question engine for mindmap notes (backend/ARCHITECTURE.md §7). Pure and deterministic: no
// Math.random, no Date, no DB, no network, plain text only. Same deck + note + seed → same question,
// so the server can re-build a question to grade it and the client never learns the answer early.
//
// Every note gets a question (zero drop). For each note the engine lists the questions its shape
// supports (its eligible pool), grouped in 8 conceptual trap types. No misspellings, lookalike words,
// double negatives or surface tricks: every wrong answer is a well-formed statement that differs in
// meaning, mechanism or mathematics.
//   1 antonym       which statement is true: one defining keyword swapped for its opposite
//                   (dictionary opposites, the author's trap_rules.swaps; never a negation)
//   2 cloze         a term blanked out ([author marks] first, else numbers / years / %, "quoted"
//                   terms, proper nouns and technical terms); recall-right / recall-left: either side
//                   of a key–value or definition note
//   3 category      which topic a statement belongs to (its root against unrelated roots);
//                   recognize: which short item is filed under the root
//   4 sibling       which statement is true: the subject swapped for a sibling concept's
//   5 scenario      the note's worked example ("…, e.g. …", "Ví dụ: …") as a scenario: which concept
//                   is demonstrated?
//   6 least-likely  three characteristics of the root and one of another concept: which is least
//                   likely a characteristic?
//   7 conditional   "A does B when C": under C, what happens? / under which condition does A do B?
//                   with near-miss clauses (opposite words, adjacent thresholds, sibling mechanisms)
//   8 formula       which formula is correct: one index, compounding factor, sign or fraction changed
// A session spreads its questions evenly over the types (drill lib/trapSchedule) and passes the type
// in the seed (typedSeed). Only when no type fits: `recognize` across the deck, then `exact` (spot
// the note among copies with two words swapped or one dropped), the last resort outside the 8 types.
// Every question is multiple choice and graded on the server: no self-graded cards.

import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import { conceptOf, conditionClause, formulaVariants, mainSentence, parseConditional, parseScenario, type Conditional, type Scenario } from './conceptPatterns'
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
import { PREDICATE_MARKERS } from './trapDictionary'
import { antonymVariants, oppositeVariants, siblingSwapVariants, type DrillChoice, type DrillTag, type TrapRules } from './trapEngine'

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

export type QuestionKind =
  | 'antonym'
  | 'cloze'
  | 'recall-right'
  | 'recall-left'
  | 'category'
  | 'recognize'
  | 'sibling'
  | 'scenario'
  | 'least-likely'
  | 'conditional-outcome'
  | 'conditional-condition'
  | 'formula'
  | 'exact'

export type Question = {
  kind: QuestionKind
  // Its trap type (1–8); null for the last-resort `exact` card.
  trapType: TrapType | null
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
  conditional: Conditional | null
  scenario: Scenario | null
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
      conditional: parseConditional(proposition.text),
      scenario: parseScenario(text),
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

// ── The 8 trap types ─────────────────────────────────────────────────────────

// The conceptual question types. Each plan below belongs to one; a session spreads its questions
// evenly over the types each note supports (drill lib/trapSchedule) and carries the chosen type in
// the question's seed (typedSeed), so grading rebuilds exactly that question.
export type TrapType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export const TRAP_TYPES: readonly TrapType[] = [1, 2, 3, 4, 5, 6, 7, 8]
export const TRAP_TYPE_NAMES: Readonly<Record<TrapType, string>> = {
  1: 'Semantic antonym',
  2: 'Fill in the blank',
  3: 'Concept mapping',
  4: 'Sibling swap',
  5: 'Scenario',
  6: 'Least likely',
  7: 'Condition',
  8: 'Formula',
}
const KIND_TYPE: Readonly<Record<QuestionKind, TrapType | null>> = {
  antonym: 1,
  cloze: 2,
  'recall-right': 2,
  'recall-left': 2,
  category: 3,
  recognize: 3,
  sibling: 4,
  scenario: 5,
  'least-likely': 6,
  'conditional-outcome': 7,
  'conditional-condition': 7,
  formula: 8,
  exact: null,
}
export const trapTypeOf = (kind: QuestionKind): TrapType | null => KIND_TYPE[kind]

// A question's seed with its scheduled type: "t3" + the base seed (base36). A plain seed (the Daily
// Rush, older sessions) lets the seed pick the type itself.
export const typedSeed = (type: TrapType, base: string): string => `t${type}${base}`
export function seedTrapType(seed: string): TrapType | null {
  const m = /^t([1-8])[0-9a-z]+$/.exec(seed)
  return m ? (Number(m[1]) as TrapType) : null
}

// ── Plans: one per question a note supports ─────────────────────────────────

type Plan = { kind: QuestionKind; build: (random: () => number, seed: string) => Question }

const others = (deck: PreparedDeck, note: Analyzed) => deck.notes.filter((n) => n.id !== note.id)
const rootOf = (note: Analyzed) => note.path[note.path.length - 1] ?? null
const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)
const dedupe = (texts: readonly string[], exclude: readonly string[] = []) => {
  const seen = new Set(exclude.map(comparable))
  return texts.filter((t) => {
    const key = comparable(t)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
const question = (kind: QuestionKind, q: Omit<Question, 'kind' | 'trapType'>): Question => ({ kind, trapType: trapTypeOf(kind), ...q })

// The roots of the deck (from every note's breadcrumb): id → title and its own breadcrumb ids.
function rootsOf(deck: PreparedDeck): Map<string, { title: string; ancestry: readonly string[] }> {
  const roots = new Map<string, { title: string; ancestry: readonly string[] }>()
  for (const n of deck.notes) {
    n.ancestry.forEach((id, i) => {
      if (!roots.has(id) && n.path[i]) roots.set(id, { title: n.path[i], ancestry: n.ancestry.slice(0, i + 1) })
    })
  }
  return roots
}
const sharedPrefix = (a: readonly string[], b: readonly string[]) => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

// Root titles that are fair wrong topics for a note: not its own root, an ancestor or a descendant
// (the statement belongs to those too), closest roots first.
function otherTopics(deck: PreparedDeck, note: Analyzed): string[] {
  const ranked = [...rootsOf(deck).entries()]
    .filter(([id, r]) => !note.ancestry.includes(id) && !r.ancestry.includes(note.nodeId))
    .map(([, r]) => ({ title: r.title, near: sharedPrefix(r.ancestry, note.ancestry) }))
    .sort((a, b) => b.near - a.near || (comparable(a.title) < comparable(b.title) ? -1 : comparable(a.title) > comparable(b.title) ? 1 : 0))
    .map((r) => r.title)
  return dedupe(ranked, note.path).filter((t) => !note.key.includes(comparable(t)))
}

// Types 1, 4, 8: which statement is true, the others each one conceptual change away. A variant that
// is a true note of the deck is never offered as wrong.
function truthPlan(deck: PreparedDeck, note: Analyzed, kind: QuestionKind, variants: readonly string[], prompt: string, instruction: string): Plan | null {
  const truths = deck.notes.map((n) => n.proposition)
  const usable = dedupe(variants, [note.proposition, ...truths])
  if (usable.length === 0) return null
  const answer = note.proposition.normalize('NFC')
  const root = rootOf(note)
  return {
    kind,
    build: (random) =>
      question(kind, {
        context: [...note.path],
        prompt,
        instruction: note.inherited && root ? `About ${root}` : instruction,
        ...multipleChoice(answer, usable, random),
      }),
  }
}

// Type 1: a defining keyword swapped for its opposite (dictionary opposites, the author's swaps).
const antonymPlan = (deck: PreparedDeck, note: Analyzed) =>
  truthPlan(deck, note, 'antonym', antonymVariants(note.proposition, note.rules), 'Which statement is true?', 'Mind what each one claims')

// Type 2: the cloze (a term, a number, the author's [marks]) …
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
      return question('cloze', {
        context: [...note.path],
        prompt: maskAt(note.text, target),
        instruction: 'Fill in the blank',
        ...multipleChoice(target.term, ranked, random),
      })
    },
  }
}

// … and the key–value recall, both ways (a cloze of either side of the pair).
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
      build: (random) =>
        question(kind, {
          context: [...note.path],
          prompt: pairLine(pair, side),
          instruction: side === 'right' ? 'Recall what goes with it' : 'Which one is it?',
          ...multipleChoice(answer, ranked, random),
        }),
    })
  }
  return plans
}

// Type 3: which topic a statement belongs to (its own root against unrelated roots). Not for a
// statement that names its own topic. The badge shows only the parent breadcrumb.
function categoryPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const answer = rootOf(note)
  if (!answer || note.key.includes(comparable(answer))) return null
  const ranked = otherTopics(deck, note)
  if (ranked.length === 0) return null
  return {
    kind: 'category',
    build: (random) =>
      question('category', {
        context: note.path.slice(0, -1),
        prompt: note.text,
        instruction: 'Which topic does this belong to?',
        ...multipleChoice(answer, ranked, random),
      }),
  }
}

// Type 3, the other way round (short phrases): which item is filed under the root. Notes that
// aren't under this note's root (nor anywhere below it) are the wrong answers.
function recognitionPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const sameRoot = new Set(deck.notes.filter((n) => n.nodeId === note.nodeId).map((n) => n.key))
  const outside = others(deck, note).filter((n) => n.nodeId !== note.nodeId && !n.ancestry.includes(note.nodeId) && !sameRoot.has(n.key))
  const ranked = rankCandidates(
    note,
    outside.map((n) => ({ text: n.text, from: n })),
    note.text,
  )
  const root = rootOf(note)
  if (ranked.length === 0 || !root) return null
  return {
    kind: 'recognize',
    build: (random) =>
      question('recognize', {
        context: [...note.path],
        prompt: `Which note belongs under “${root}”?`,
        instruction: 'Pick the one filed under this root',
        ...multipleChoice(note.text, ranked, random),
      }),
  }
}

// Type 4: the same claim made about a sibling concept (the subject swapped for one from the same
// root; failing that, from a sibling root under the same parent).
function siblingPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const sameRoot = others(deck, note).filter((n) => n.nodeId === note.nodeId)
  const parent = note.ancestry.length >= 2 ? others(deck, note).filter((n) => n.nodeId !== note.nodeId && n.ancestry.length === note.ancestry.length && sharedPrefix(n.ancestry, note.ancestry) === note.ancestry.length - 1) : []
  let variants = siblingSwapVariants(note.proposition, sameRoot.map((n) => n.proposition))
  if (variants.length === 0) variants = siblingSwapVariants(note.proposition, parent.map((n) => n.proposition))
  return truthPlan(deck, note, 'sibling', variants, 'Which statement is true?', 'Mind which concept does what')
}

// Type 5: the note's worked example as a scenario, without naming the concept: which concept is
// demonstrated? The concept is the claim's subject (or the root, when the note is an example of it).
function scenarioPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const scenario = note.scenario
  if (!scenario) return null
  const subject = scenario.claim ? conceptOf(scenario.claim, PREDICATE_MARKERS) : null
  const answer = subject?.trim() || rootOf(note)
  if (!answer || comparable(scenario.example).includes(comparable(answer))) return null
  const subjects = subject
    ? rankCandidates(
        note,
        others(deck, note).flatMap((n) => {
          const s = conceptOf(n.proposition, PREDICATE_MARKERS)
          return s ? [{ text: s.trim(), from: n }] : []
        }),
        answer,
      )
    : []
  const ranked = dedupe([...subjects, ...otherTopics(deck, note)], [answer]).filter((t) => !comparable(scenario.example).includes(comparable(t)))
  if (ranked.length === 0) return null
  return {
    kind: 'scenario',
    build: (random) =>
      question('scenario', {
        context: note.path.slice(0, -1),
        prompt: `Scenario: ${capitalize(scenario.example)}.`,
        instruction: 'Which concept is demonstrated in this scenario?',
        ...multipleChoice(answer, ranked, random),
      }),
  }
}

// Type 6: three true characteristics of the note's root (the note and two of its siblings) and one
// that belongs to another concept: which is LEAST LIKELY a characteristic of the root?
function leastLikelyPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const root = rootOf(note)
  if (!root) return null
  const siblings = dedupe(
    others(deck, note)
      .filter((n) => n.nodeId === note.nodeId)
      .map((n) => n.text),
    [note.text],
  )
  if (siblings.length < 2) return null
  const taken = [note.text, ...siblings]
  const aliens = rankCandidates(
    note,
    others(deck, note)
      .filter((n) => n.nodeId !== note.nodeId && !note.ancestry.includes(n.nodeId) && !n.ancestry.includes(note.nodeId))
      .map((n) => ({ text: n.text, from: n })),
    note.text,
  ).filter((t) => !taken.some((x) => comparable(x) === comparable(t)))
  if (aliens.length === 0) return null
  return {
    kind: 'least-likely',
    build: (random) => {
      const alien = seededShuffle(aliens.slice(0, DISTRACTOR_WINDOW), random)[0]
      const valid = [note.text, ...seededShuffle(siblings, random).slice(0, 2)]
      const texts = seededShuffle([...valid, alien], random)
      return question('least-likely', {
        context: [...note.path],
        prompt: `Which of the following is LEAST LIKELY a characteristic of “${root}”?`,
        instruction: 'Three belong to it; one does not',
        choices: texts.map((text, i) => ({ tag: TAGS[i], text })),
        correctTag: TAGS[texts.indexOf(alien)],
      })
    },
  }
}

// Plausible near-misses of a clause: one opposite word (an intensity or direction shift) or one
// number moved to an adjacent value (a neighbouring threshold).
function clauseVariants(clause: string, rules: TrapRules): string[] {
  const shifted: string[] = []
  for (const m of clause.matchAll(/\d+(?:[.,]\d+)?%?/gu)) {
    for (const n of numberDistractors(m[0]).slice(0, 2)) shifted.push(clause.slice(0, m.index) + n + clause.slice(m.index + m[0].length))
  }
  return dedupe([...antonymVariants(clause, rules), ...oppositeVariants(clause), ...shifted], [clause])
}

// Type 7: a conditional or causal statement (A does B when C), asked from both angles: under C, what
// happens? and: under which condition does A do B? Wrong answers are near-misses of the same clause
// and the other conditionals' clauses (sibling mechanisms).
function conditionalPlans(deck: PreparedDeck, note: Analyzed): Plan[] {
  const c = note.conditional
  if (!c) return []
  const plans: Plan[] = []
  const peers = others(deck, note).filter((n) => n.conditional)

  const outcome = mainSentence(c)
  const outcomes = dedupe(
    [
      ...clauseVariants(c.main, note.rules).map((m) => mainSentence({ main: m })),
      ...rankCandidates(
        note,
        peers.map((n) => ({ text: mainSentence(n.conditional!), from: n })),
        outcome,
      ),
    ],
    [outcome],
  )
  if (outcomes.length > 0) {
    plans.push({
      kind: 'conditional-outcome',
      build: (random) =>
        question('conditional-outcome', {
          context: [...note.path],
          prompt: `${capitalize(conditionClause(c))}: what happens?`,
          instruction: 'Under this condition, what happens?',
          ...multipleChoice(outcome, outcomes, random),
        }),
    })
  }

  const condition = conditionClause(c)
  const conditions = dedupe(
    [
      ...clauseVariants(c.condition, note.rules).map((cond) => conditionClause({ connector: c.connector, condition: cond })),
      ...rankCandidates(
        note,
        peers.map((n) => ({ text: conditionClause(n.conditional!), from: n })),
        condition,
      ),
    ],
    [condition],
  )
  if (conditions.length > 0) {
    plans.push({
      kind: 'conditional-condition',
      build: (random) =>
        question('conditional-condition', {
          context: [...note.path],
          prompt: `${capitalize(c.main)} ____.`,
          instruction: 'Under which condition?',
          ...multipleChoice(condition, conditions, random),
        }),
    })
  }
  return plans
}

// Type 8: a formula or indexed statement, against copies with one index, compounding factor, sign
// or fraction changed.
const formulaPlan = (deck: PreparedDeck, note: Analyzed) =>
  truthPlan(deck, note, 'formula', formulaVariants(note.proposition), 'Which formula is correct?', 'Check every index, sign and fraction')

// Copies of the note with two neighbouring words swapped or one word dropped (one word: two
// neighbouring letters swapped). Distinct from the note, so exactly one choice is the note. Only the
// last resort, for a note no conceptual type can be built for (it is outside the 8 types).
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
    build: (random) =>
      question('exact', {
        context: [...note.path],
        prompt: 'Which is exactly your note?',
        instruction: 'Spot the original',
        ...multipleChoice(note.text, variants, random),
      }),
  }
}

// The questions a note supports (the eligible pool). Author [marks] → only that cloze. A formula
// enables type 8, a condition type 7, an example type 5; without them the note is asked by the other
// types (cloze, concept mapping, …). Only when no type fits: recognition across the deck, then the
// last-resort exact card.
function plansFor(deck: PreparedDeck, note: Analyzed): Plan[] {
  if (note.marked) {
    const cloze = clozePlan(deck, note)
    if (cloze) return [cloze]
  }
  const primary = [
    antonymPlan(deck, note),
    clozePlan(deck, note),
    ...pairPlans(deck, note),
    categoryPlan(deck, note),
    note.short ? recognitionPlan(deck, note) : null,
    siblingPlan(deck, note),
    scenarioPlan(deck, note),
    leastLikelyPlan(deck, note),
    ...conditionalPlans(deck, note),
    formulaPlan(deck, note),
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

// The trap types a note is eligible for (sorted). Empty for a note asked only by the last resort.
export function trapTypes(deck: PreparedDeck, noteId: string): TrapType[] {
  const types = new Set(questionKinds(deck, noteId).map(trapTypeOf).filter((t): t is TrapType => t !== null))
  return TRAP_TYPES.filter((t) => types.has(t))
}

// One question for one note. A typed seed (typedSeed) asks the scheduled type when the note supports
// it; otherwise the seed picks a type (each type equally likely), then one of its questions, then
// the choices. Same deck + note + seed → same question, so grading rebuilds it exactly.
export function buildQuestion(deck: PreparedDeck, noteId: string, seed: string): QuestionResult {
  const note = deck.byId.get(noteId)
  if (!note) return { ok: false, reason: 'UNDRILLABLE' }
  const plans = plansFor(deck, note)
  if (plans.length === 0) return { ok: false, reason: 'UNDRILLABLE' }
  const byType = new Map<TrapType | 0, Plan[]>()
  for (const plan of plans) {
    const type = trapTypeOf(plan.kind) ?? 0
    byType.set(type, [...(byType.get(type) ?? []), plan])
  }
  const random = seededRandom(seed)
  const forced = seedTrapType(seed)
  const types = [...byType.keys()]
  const type = forced !== null && byType.has(forced) ? forced : types[Math.floor(random() * types.length)]
  const group = byType.get(type)!
  const plan = group[Math.floor(random() * group.length)]
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
