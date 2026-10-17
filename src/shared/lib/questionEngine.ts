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
//   4 sibling       which statement is true: the subject swapped for a peer concept's (the same
//                   root first, then sibling roots, then any statement at the same depth)
//   5 scenario      an observed case: which concept is at work? The note's own example when it gives
//                   one ("…, e.g. …"), otherwise its mechanism framed as an observation
//   6 least-likely  true characteristics of the root and one that is not: a property of the topic
//                   with one detail changed, or a statement of a sibling topic
//   7 conditional   "A does B when C": under C, what happens? / under which condition does A do B?
//     element       any other declarative statement, asked by element: the subject responsible, the
//                   effect (the action), the object acted on, or the whole predicate
//   8 formula       which formula is correct: one index, compounding factor, sign or fraction changed
// No marker ("if", "when", "e.g.") is needed for types 5 and 7: a plain statement is split into
// subject, action and object (conceptPatterns decompose). Terse notes work too: a bullet with no
// subject ("- Consumes ATP", "used for background tasks") takes its root's title as subject, and
// shorthand ("Term: explanation", "Term - explanation", "Term (details)") reads as subject and
// mechanism (parseShorthand). A terse note (at most TERSE_WORDS words) also swaps everyday opposites
// in type 1 ("ngoài" ↔ "trong", a final "in" ↔ "out").
// A session spreads its questions evenly over the types (drill lib/trapSchedule) and passes the type
// in the seed (typedSeed). Only when no type fits: `recognize` across the deck, then `exact` (spot
// the note among copies with two words swapped or one dropped), the last resort outside the 8 types.
// Every question is multiple choice and graded on the server: no self-graded cards.

import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import { conceptOf, conditionClause, decompose, formulaVariants, mainSentence, parseConditional, parseScenario, parseShorthand, type Conditional, type Parts, type Scenario } from './conceptPatterns'
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
import { antonymVariants, extractSubject, oppositeVariants, type DrillChoice, type DrillTag, type TrapRules } from './trapEngine'

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
  | 'element-subject'
  | 'element-action'
  | 'element-object'
  | 'element-predicate'
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
const KEY_VALUE_JOINERS: ReadonlySet<string> = new Set([':', '=', '–'])
// A terse note: short enough that everyday words ("trong", "in", "cao") carry its meaning.
export const TERSE_WORDS = 7

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
  // A short fragment or bullet (at most TERSE_WORDS words): loose opposites apply.
  terse: boolean
  // Subject, action and object of a plain declarative statement (null for any other shape).
  parts: Parts | null
}

export type PreparedDeck = { notes: readonly Analyzed[]; byId: ReadonlyMap<string, Analyzed> }

export function prepareDeck(notes: readonly DeckNote[]): PreparedDeck {
  const analyzed = notes.map((note): Analyzed => {
    const { text, targets } = clozeTargets(note.statement)
    const proposition = synthesizeProposition(note.statement, note.path)
    const pair = parsePair(text)
    // A "Key: Value" line is a pair, not a sentence; a definition ("X is Y") is both.
    const sentence = !pair || !KEY_VALUE_JOINERS.has(pair.joiner)
    return {
      ...note,
      text,
      key: comparable(text),
      proposition: proposition.text,
      inherited: proposition.inherited,
      pair,
      targets,
      marked: targets.some((t) => t.kind === 'marked'),
      short: isShortPhrase(text),
      conditional: parseConditional(proposition.text),
      scenario: parseScenario(text),
      terse: text.split(' ').filter(Boolean).length <= TERSE_WORDS,
      // Shorthand first ("Term: explanation"), then a sentence; a note that inherits its root is split
      // after that root.
      parts: proposition.inherited ? decompose(proposition.text, note.path.at(-1)) : (parseShorthand(text) ?? (sentence ? decompose(proposition.text) : null)),
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
  7: 'Condition and element',
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
  'element-subject': 7,
  'element-action': 7,
  'element-object': 7,
  'element-predicate': 7,
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
  truthPlan(deck, note, 'antonym', antonymVariants(note.proposition, note.rules, { loose: note.terse }), 'Which statement is true?', 'Mind what each one claims')

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

// The statements a note's peers are drawn from, nearest first: its own root, the sibling roots (same
// parent, same depth), the rest of its subject at that depth, then any statement at that depth.
function peerTiers(deck: PreparedDeck, note: Analyzed): Analyzed[][] {
  const depth = note.ancestry.length
  const rest = others(deck, note)
  const sameDepth = rest.filter((n) => n.nodeId !== note.nodeId && n.ancestry.length === depth)
  const shared = (n: Analyzed) => sharedPrefix(n.ancestry, note.ancestry)
  return [
    rest.filter((n) => n.nodeId === note.nodeId),
    sameDepth.filter((n) => shared(n) === depth - 1),
    sameDepth.filter((n) => shared(n) < depth - 1 && shared(n) >= 1),
    sameDepth.filter((n) => shared(n) === 0 && depth > 1),
  ]
}

// The roots beside a note's own root: the same depth, nearest first. `near` share its subject (its
// top-level root; for a top-level root, every other one), `far` belong to another subject.
function peerRoots(deck: PreparedDeck, note: Analyzed): { near: string[]; far: string[] } {
  const depth = note.ancestry.length
  const ranked = [...rootsOf(deck).entries()]
    .filter(([id, r]) => id !== note.nodeId && r.ancestry.length === depth)
    .map(([, r]) => ({ title: r.title, near: sharedPrefix(r.ancestry, note.ancestry) }))
    .sort((a, b) => b.near - a.near || (comparable(a.title) < comparable(b.title) ? -1 : comparable(a.title) > comparable(b.title) ? 1 : 0))
  const nearMin = depth === 1 ? 0 : 1
  return { near: ranked.filter((r) => r.near >= nearMin).map((r) => r.title), far: ranked.filter((r) => r.near < nearMin).map((r) => r.title) }
}

// The topics a note that inherits its root is told apart from: the roots beside its own, topped up
// with the next nearest topics until there are three.
function rivalTopics(deck: PreparedDeck, note: Analyzed): string[] {
  const { near, far } = peerRoots(deck, note)
  const all = dedupe([...near, ...far, ...otherTopics(deck, note)], note.path).filter((t) => !note.key.includes(comparable(t)))
  return all.slice(0, Math.max(MAX_DISTRACTORS, near.length))
}

// The entity a statement is about: its subject (decompose), or the trap dictionary's reading of it.
// A fragment that merely sits under a root (no verb of its own) has none.
const subjectOf = (note: Analyzed): string | null => note.parts?.subject ?? (note.inherited ? null : (extractSubject(note.proposition)?.trim() ?? null))
const keepCase = (own: string, other: string) => (/^\p{Lu}/u.test(own) ? capitalize(other) : other)

// Type 4: the same claim made about a peer entity: the subject swapped for the subject of another
// statement at the same depth of the tree. The nearest peers come first (the note's own root, then
// sibling roots, then the rest of the tree at that depth); a note that inherits its root as subject
// is also swapped with the roots beside it.
function siblingPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const own = subjectOf(note)
  if (!own) return null
  const rest = note.parts?.rest ?? note.proposition.slice(note.proposition.indexOf(own) + own.length)
  const roots = note.inherited ? peerRoots(deck, note) : { near: [], far: [] }
  const tiers = peerTiers(deck, note).map((tier) => tier.map(subjectOf).filter((x): x is string => x !== null))
  const truths = deck.notes.map((n) => n.proposition)
  const variants: string[] = []
  const take = (subjects: readonly string[]) => {
    const swapped = dedupe(subjects, [own]).map((other) => keepCase(own, other) + rest)
    variants.push(...dedupe(swapped, [note.proposition, ...truths, ...variants]).slice(0, MAX_DISTRACTORS - variants.length))
  }
  for (const subjects of [tiers[0], roots.near, tiers[1], tiers[2]]) take(subjects)
  // Another subject altogether ("Bond prices consume ATP") is too easy to rule out: only when the
  // note's own subject offers no peer at all.
  if (variants.length === 0) for (const subjects of [roots.far, tiers[3]]) take(subjects)
  return truthPlan(deck, note, 'sibling', variants, 'Which statement is true?', 'Mind which concept does what')
}

// Type 5: an observed case, without naming the concept: which concept is at work? A note that gives
// its own example ("…, e.g. …") shows that example. Any other declarative statement is framed from
// its mechanism (its predicate, as written) as something observed in a system. The concept is the
// statement's subject; for a terse note that inherits its root (or an example of the root itself) it is
// the root, against the topics beside it, and the badge shows only the parent breadcrumb.
const SCENARIO_FRAMES: readonly ((mechanism: string) => string)[] = [
  (m) => `Scenario: in a system, you observe something that “${m}”.`,
  (m) => `Applied case: a component is at work that “${m}”.`,
]
// For a mechanism that is not a verb phrase (shorthand, a verbless fragment under a root).
const NOTE_FRAMES: readonly ((mechanism: string) => string)[] = [
  (m) => `Scenario: in a case, this is what you observe: “${m}”.`,
  (m) => `Applied case: this is at work: “${m}”.`,
]
function scenarioPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const given = note.scenario
  const parts = note.parts
  if (!given && !parts) return null
  const shown = given ? given.example : parts!.predicate
  // A note that inherits its root is about that root: the root is the concept, against the topics beside it.
  const subject = given ? (given.claim ? (decompose(given.claim)?.subject ?? conceptOf(given.claim, PREDICATE_MARKERS)) : null) : note.inherited ? null : parts!.subject
  const frames = !given && (parts!.kind === 'note' || (note.inherited && parts!.kind === 'guess')) ? NOTE_FRAMES : SCENARIO_FRAMES
  const answer = subject?.trim() || rootOf(note)
  if (!answer || comparable(shown).includes(comparable(answer))) return null
  const subjects = subject
    ? rankCandidates(
        note,
        others(deck, note).flatMap((n) => {
          const s = n.inherited ? null : subjectOf(n)
          return s ? [{ text: s, from: n }] : []
        }),
        answer,
      )
    : []
  const topics = !given && note.inherited ? rivalTopics(deck, note) : otherTopics(deck, note)
  const ranked = dedupe([...subjects, ...topics], [answer]).filter((t) => !comparable(shown).includes(comparable(t)))
  if (ranked.length === 0) return null
  return {
    kind: 'scenario',
    build: (random) => {
      const prompt = given ? `Scenario: ${capitalize(given.example)}.` : frames[Math.floor(random() * frames.length)](shown)
      return question('scenario', {
        context: note.path.slice(0, -1),
        prompt,
        instruction: given ? 'Which concept is demonstrated in this scenario?' : 'Which underlying concept is being observed?',
        ...multipleChoice(answer, ranked, random),
      })
    },
  }
}

// A statement with one detail changed (an opposite keyword, a shifted number). Never a negation:
// "is not" stands out. Every statement of a root needs its siblings', so they are kept per note.
const CHANGED = new WeakMap<Analyzed, string[]>()
function changedProperties(source: Analyzed): string[] {
  let changed = CHANGED.get(source)
  if (!changed) CHANGED.set(source, (changed = clauseVariants(source.text, { swaps: source.rules.swaps }, source.terse)))
  return changed
}

// Type 6: true characteristics of the note's root and one that is not: which is LEAST LIKELY a
// characteristic of the root? The odd one out is built to be plausible: a real property of this
// topic with one detail changed (an opposite keyword, a shifted number; its original is then left
// out), or a true statement of a sibling topic. Only when the tree has neither: one from further away.
function leastLikelyPlan(deck: PreparedDeck, note: Analyzed): Plan | null {
  const root = rootOf(note)
  if (!root) return null
  const family = [note, ...others(deck, note).filter((n) => n.nodeId === note.nodeId)].filter((n, i, all) => all.findIndex((o) => o.key === n.key) === i)
  if (family.length < 3) return null
  const truths = deck.notes.flatMap((n) => [n.text, n.proposition])
  const mutated = family.flatMap((source) => dedupe(changedProperties(source), truths).map((text) => ({ text, hide: source.id as string | null })))
  const outside = others(deck, note).filter((n) => n.nodeId !== note.nodeId && !note.ancestry.includes(n.nodeId) && !n.ancestry.includes(note.nodeId))
  const depth = note.ancestry.length
  const siblingTopics = outside.filter((n) => n.ancestry.length === depth && sharedPrefix(n.ancestry, note.ancestry) === depth - 1)
  const foreign = (from: readonly Analyzed[]) =>
    rankCandidates(
      note,
      from.map((n) => ({ text: n.text, from: n })),
      note.text,
    )
      .filter((t) => !family.some((x) => x.key === comparable(t)))
      .map((text) => ({ text, hide: null as string | null }))
  const near = [...mutated, ...foreign(siblingTopics)]
  const pool = (near.length > 0 ? near : foreign(outside)).filter((c, i, all) => all.findIndex((o) => comparable(o.text) === comparable(c.text)) === i)
  if (pool.length === 0) return null
  return {
    kind: 'least-likely',
    build: (random) => {
      const alien = pool[Math.floor(random() * pool.length)]
      // The note itself is always shown, unless it is the property that was changed.
      const kept = family.filter((n) => n.id !== alien.hide)
      const picked = alien.hide === note.id ? seededShuffle(kept, random) : [note, ...seededShuffle(kept.filter((n) => n.id !== note.id), random)]
      const texts = seededShuffle([...picked.slice(0, 3).map((n) => n.text), alien.text], random)
      return question('least-likely', {
        context: [...note.path],
        prompt: `Which of the following is LEAST LIKELY a characteristic of “${root}”?`,
        instruction: 'All but one belong to it',
        choices: texts.map((text, i) => ({ tag: TAGS[i], text })),
        correctTag: TAGS[texts.indexOf(alien.text)],
      })
    },
  }
}

// Plausible near-misses of a clause: one opposite word (an intensity or direction shift) or one
// number moved to an adjacent value (a neighbouring threshold).
function clauseVariants(clause: string, rules: TrapRules, loose = false): string[] {
  const shifted: string[] = []
  for (const m of clause.matchAll(/\d+(?:[.,]\d+)?%?/gu)) {
    for (const n of numberDistractors(m[0]).slice(0, 2)) shifted.push(clause.slice(0, m.index) + n + clause.slice(m.index + m[0].length))
  }
  return dedupe([...antonymVariants(clause, rules, { loose }), ...oppositeVariants(clause, { loose }), ...shifted], [clause])
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

// Type 7 for every other declarative statement (no "if" / "when" needed): the statement is split
// into subject, action and object and one element is asked for: which component is responsible, what
// its effect on the object is, what it acts on, or what is true of it. Wrong answers are the same
// element of the nearest statements (and the action's opposite), never one that makes a true
// statement of the tree.
function elementPlans(deck: PreparedDeck, note: Analyzed): Plan[] {
  const parts = note.parts
  // A definition ("X is Y") is asked both ways by type 2 already; shorthand is asked here as well.
  if (!parts || note.conditional || (note.pair && parts.kind !== 'note')) return []
  const truths = new Set(deck.notes.map((n) => comparable(n.proposition)))
  const peers = others(deck, note).filter((n) => n.parts)
  const element = (pick: (p: Parts, n: Analyzed) => string | null, answer: string, rebuild: (value: string) => string, extra: readonly string[] = []) =>
    dedupe(
      [
        ...extra,
        ...rankCandidates(
          note,
          peers.flatMap((n) => {
            const text = pick(n.parts!, n)
            return text ? [{ text, from: n }] : []
          }),
          answer,
        ),
      ],
      [answer],
    ).filter((value) => !truths.has(comparable(rebuild(value))))
  const plan = (kind: QuestionKind, prompt: string, instruction: string, answer: string, ranked: readonly string[], context: readonly string[] = note.path): Plan[] =>
    ranked.length === 0 ? [] : [{ kind, build: (random) => question(kind, { context: [...context], prompt, instruction, ...multipleChoice(answer, ranked, random) }) }]

  const plans: Plan[] = []
  // The subject, from what is said about it. A note that inherits its root is asked for that root,
  // against the topics beside it, with only the parent breadcrumb on the badge.
  const subjects = note.inherited
    ? rivalTopics(deck, note).filter((topic) => !truths.has(comparable(topic + parts.rest)))
    : element((p, n) => (n.inherited ? null : p.subject), parts.subject, (v) => v + parts.rest)
  plans.push(
    ...plan(
      'element-subject',
      parts.kind === 'action'
        ? `Which component is responsible for “${parts.predicate}”?`
        : parts.kind === 'note'
          ? `Which term matches “${parts.predicate}”?`
          : `Which concept does this describe: “____ ${parts.predicate}”?`,
      'Name the one this is about',
      parts.subject,
      subjects,
      note.inherited ? note.path.slice(0, -1) : note.path,
    ),
  )
  if (parts.kind === 'action' && parts.object) {
    // The same grammatical form as the answer, when the tree has any: "consumes" against "produces".
    const sameForm = (a: string) => a.endsWith('s') === parts.action.endsWith('s')
    const all = element((p) => (p.kind === 'action' ? p.action : null), parts.action, (v) => `${parts.subject} ${v} ${parts.object}`, oppositeVariants(parts.action))
    const actions = all.some(sameForm) ? all.filter(sameForm) : all
    plans.push(...plan('element-action', `What is the primary effect of “${parts.subject}” on “${parts.object}”?`, 'Pick what it does to it', parts.action, actions))
    const objects = element((p) => (p.kind === 'action' && p.object ? p.object : null), parts.object, (v) => `${parts.subject} ${parts.action} ${v}`)
    plans.push(...plan('element-object', `${parts.subject} ${parts.action} ____.`, 'Which object or property completes it?', parts.object, objects))
  }
  // The whole predicate: for a statement whose verb can't be asked alone, and for every terse note
  // under a root ("What does “Active transport” do?").
  if (parts.kind !== 'action' || !parts.object || note.inherited) {
    // Like with like when the tree has it: explanations against explanations, verb phrases against verb phrases.
    const alike = (p: Parts) => (p.kind === 'note') === (parts.kind === 'note')
    const rebuild = (v: string) => (parts.kind === 'note' ? parts.subject + parts.rest.replace(parts.predicate, v) : `${parts.subject} ${v}`)
    const near = clauseVariants(parts.predicate, { swaps: note.rules.swaps }, note.terse)
    const same = element((p) => (alike(p) ? p.predicate : null), parts.predicate, rebuild, near)
    const predicates = same.length > near.length ? same : element((p) => p.predicate, parts.predicate, rebuild, near)
    plans.push(
      ...plan(
        'element-predicate',
        parts.kind === 'action' ? `What does “${parts.subject}” do?` : parts.kind === 'note' ? `What describes “${parts.subject}”?` : `What is true of “${parts.subject}”?`,
        'Pick its role or property',
        parts.predicate,
        predicates,
      ),
    )
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
// enables type 8; a plain declarative statement is eligible for types 4, 5 and 7 as it is (no
// connector or example marker needed), and for the rest by what it holds (cloze, concept mapping, …). Only when no type fits: recognition across the deck, then the
// last-resort exact card.
// Plans are pure (the same deck and note always give the same ones), so a deck builds each note's
// once: a round asks for them three times a statement (drillable? which types? the question).
const PLANS = new WeakMap<PreparedDeck, Map<string, Plan[]>>()
function plansFor(deck: PreparedDeck, note: Analyzed): Plan[] {
  let byNote = PLANS.get(deck)
  if (!byNote) PLANS.set(deck, (byNote = new Map()))
  let plans = byNote.get(note.id)
  if (!plans) byNote.set(note.id, (plans = buildPlans(deck, note)))
  return plans
}

function buildPlans(deck: PreparedDeck, note: Analyzed): Plan[] {
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
    ...elementPlans(deck, note),
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
