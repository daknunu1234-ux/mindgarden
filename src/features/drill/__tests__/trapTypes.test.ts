import { describe, expect, it } from 'vitest'
import { isFormula, parseConditional, parseScenario } from '@/shared/lib/conceptPatterns'
import {
  buildQuestion,
  prepareDeck,
  questionKinds,
  seedTrapType,
  TRAP_TYPES,
  trapTypes,
  typedSeed,
  type DeckNote,
  type Question,
  type TrapType,
} from '@/shared/lib/questionEngine'
import { NEGATION_PAIRS, OPPOSITE_PAIRS } from '@/shared/lib/trapDictionary'
import { seededRandom } from '@/shared/utils/seededRandom'
import { DrillSubmissionDto } from '@/features/progress/dto/DrillSubmissionDto'
import { scheduleTrapTypes, TRAP_HISTORY, typeCounts } from '../lib/trapSchedule'

// The 8 conceptual trap types (questionEngine), each on representative statements, the quality
// rules every question keeps, the eligible-pool resolver, and the session scheduler (lib/trapSchedule).

const note = (id: string, statement: string, path: string[], ancestry: string[]): DeckNote => ({ id, nodeId: ancestry[ancestry.length - 1], statement, path, ancestry, rules: { negate: true } })

// A small mixed tree: organelles, transport and valuation.
const DECK: DeckNote[] = [
  note('m1', 'Mitochondria produce ATP when oxygen is available.', ['Biology', 'Cell organelles'], ['bio', 'org']),
  note('m2', 'Ribosomes synthesize proteins.', ['Biology', 'Cell organelles'], ['bio', 'org']),
  note('m3', 'Chloroplasts absorb light energy, e.g. a leaf turning sunlight into sugar.', ['Biology', 'Cell organelles'], ['bio', 'org']),
  note('t1', 'Diffusion moves particles down a concentration gradient, e.g. a drop of ink spreading in water.', ['Biology', 'Cell transport'], ['bio', 'tra']),
  note('t2', 'Osmosis moves water across a membrane when solute concentrations differ.', ['Biology', 'Cell transport'], ['bio', 'tra']),
  note('t3', 'Active transport consumes ATP.', ['Biology', 'Cell transport'], ['bio', 'tra']),
  note('f1', 'P0 = D1 / (r - g)', ['Finance', 'Valuation'], ['fin', 'val']),
  note('f2', 'FV = PV × (1 + r)^n', ['Finance', 'Valuation'], ['fin', 'val']),
  note('f3', 'The price of a bond decreases when interest rates rise.', ['Finance', 'Valuation'], ['fin', 'val']),
]
const deck = prepareDeck(DECK)
const SEEDS = Array.from({ length: 30 }, (_, i) => `s${i.toString(36)}`)

function ask(id: string, type: TrapType, base = 'abc'): Question {
  const res = buildQuestion(deck, id, typedSeed(type, base))
  if (!res.ok) throw new Error(`no question for ${id}`)
  return res.question
}
const answerOf = (q: Question) => q.choices.find((c) => c.tag === q.correctTag)!.text
const wrongOf = (q: Question) => q.choices.filter((c) => c.tag !== q.correctTag).map((c) => c.text)

// Every word a question may use: the tree's own words, the opposites and negation dictionaries, and
// indexed symbols / numbers (a mutated index such as D2). Anything else would be an invented word.
const tokens = (s: string) => s.normalize('NFC').toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []
const VOCAB = new Set([
  ...DECK.flatMap((n) => [...tokens(n.statement), ...n.path.flatMap(tokens)]),
  ...[...OPPOSITE_PAIRS, ...NEGATION_PAIRS].flat().flatMap(tokens),
  // The engine's own question words.
  ...tokens('Which statement is true formula is correct topic does this belong to scenario concept demonstrated in least likely a characteristic of the following under condition what happens when'),
])
// (Plus the cloze blank "____".)
const known = (word: string) => VOCAB.has(word) || /^[a-z]{1,3}_?\d+$/.test(word) || /^\d+$/.test(word) || /^_+$/.test(word)
const NEGATION = /(?<![\p{L}\p{M}\p{N}])(không|chẳng|chưa|not|no|never|cannot)(?![\p{L}\p{M}\p{N}])/giu

describe('the 8 trap types, one by one', () => {
  it('Type 1, semantic antonym: a defining keyword swapped for its direct opposite', () => {
    const q = ask('t3', 1)
    expect(q).toMatchObject({ kind: 'antonym', trapType: 1, prompt: 'Which statement is true?' })
    expect(answerOf(q)).toBe('Active transport consumes ATP.')
    // "consumes" ↔ "produces": the only difference, an opposite pair.
    expect(wrongOf(q)).toContain('Active transport produces ATP.')
  })

  it('Type 2, cloze: the key term masked for active recall', () => {
    const q = ask('t3', 2)
    expect(q).toMatchObject({ kind: 'cloze', trapType: 2, instruction: 'Fill in the blank' })
    expect(q.prompt).toContain('____')
    expect(q.prompt.replace('____', answerOf(q))).toBe('Active transport consumes ATP.')
  })

  it('Type 3, concept mapping: which topic the statement belongs to', () => {
    const q = ask('m2', 3)
    expect(q).toMatchObject({ kind: 'category', trapType: 3, prompt: 'Ribosomes synthesize proteins.', instruction: 'Which topic does this belong to?' })
    expect(answerOf(q)).toBe('Cell organelles')
    // Sibling topics first; never its own breadcrumb ("Biology" contains it too).
    expect(wrongOf(q)).toContain('Cell transport')
    expect(wrongOf(q)).not.toContain('Biology')
    expect(q.context).toEqual(['Biology'])
  })

  it('Type 4, sibling swap: the same claim made about a sibling concept', () => {
    const q = ask('m2', 4)
    expect(q).toMatchObject({ kind: 'sibling', trapType: 4, prompt: 'Which statement is true?' })
    expect(answerOf(q)).toBe('Ribosomes synthesize proteins.')
    for (const w of wrongOf(q)) {
      expect(w.endsWith(' synthesize proteins.')).toBe(true)
      expect(['Mitochondria', 'Chloroplasts']).toContain(w.replace(' synthesize proteins.', ''))
    }
  })

  it('Type 5, scenario: the worked example, unnamed: which concept is demonstrated?', () => {
    const q = ask('t1', 5)
    expect(q).toMatchObject({ kind: 'scenario', trapType: 5, prompt: 'Scenario: A drop of ink spreading in water.', instruction: 'Which concept is demonstrated in this scenario?' })
    expect(answerOf(q)).toBe('Diffusion')
    for (const w of wrongOf(q)) expect(q.prompt.toLocaleLowerCase()).not.toContain(w.toLocaleLowerCase())
    // Wrong answers are other concepts of the tree; the sibling process (osmosis) is among them.
    const concepts = ['Osmosis', 'Active transport', 'Mitochondria', 'Ribosomes', 'Chloroplasts', 'The price of a bond', 'Cell organelles', 'Valuation']
    const wrong = new Set(SEEDS.flatMap((s) => wrongOf(ask('t1', 5, s))))
    for (const w of wrong) expect(concepts).toContain(w)
    expect(wrong).toContain('Osmosis')
  })

  it('Type 6, least likely: three characteristics of the root and one alien', () => {
    const q = ask('m2', 6)
    expect(q).toMatchObject({ kind: 'least-likely', trapType: 6, prompt: 'Which of the following is LEAST LIKELY a characteristic of “Cell organelles”?' })
    expect(q.choices).toHaveLength(4)
    const organelles = DECK.filter((n) => n.nodeId === 'org').map((n) => n.statement)
    expect(organelles).not.toContain(answerOf(q))
    expect(wrongOf(q).every((t) => organelles.includes(t))).toBe(true)
  })

  it('Type 7, conditional: under the condition, what happens? and under which condition?', () => {
    const outcome = [...SEEDS].map((s) => ask('f3', 7, s)).find((q) => q.kind === 'conditional-outcome')!
    expect(outcome).toMatchObject({ trapType: 7, prompt: 'When interest rates rise: what happens?' })
    expect(answerOf(outcome)).toBe('The price of a bond decreases.')
    // An intensity / direction shift of the same clause.
    expect(wrongOf(outcome)).toContain('The price of a bond increases.')

    const condition = [...SEEDS].map((s) => ask('f3', 7, s)).find((q) => q.kind === 'conditional-condition')!
    expect(condition).toMatchObject({ trapType: 7, prompt: 'The price of a bond decreases ____.' })
    expect(answerOf(condition)).toBe('when interest rates rise')
    // The opposite condition, and sibling mechanisms' conditions.
    expect(wrongOf(condition)).toEqual(expect.arrayContaining([expect.stringMatching(/^when /)]))
    expect(condition.choices.some((c) => c.text === 'when oxygen is available' || c.text === 'when solute concentrations differ')).toBe(true)
  })

  it('Type 8, formula: index, compounding, sign and fraction mutations', () => {
    const gordon = new Set(SEEDS.flatMap((s) => wrongOf(ask('f1', 8, s))))
    expect(ask('f1', 8)).toMatchObject({ kind: 'formula', trapType: 8, prompt: 'Which formula is correct?' })
    expect(answerOf(ask('f1', 8))).toBe('P0 = D1 / (r - g)')
    expect(gordon).toContain('P0 = D0 / (r - g)') // time anchor D1 → D0
    expect(gordon).toContain('P0 = D1 / (r + g)') // sign in the denominator
    expect(gordon).toContain('P0 = (r - g) / D1') // numerator / denominator inverted
    const compound = new Set(SEEDS.flatMap((s) => wrongOf(ask('f2', 8, s))))
    expect(compound).toContain('FV = PV × r^n') // (1 + r) → r
  })
})

describe('quality: conceptual traps only', () => {
  it('never invents a word: every choice of every type uses the tree’s words, the dictionaries or an index', () => {
    for (const n of DECK) {
      for (const type of trapTypes(deck, n.id)) {
        for (const s of SEEDS) {
          const q = ask(n.id, type, s)
          for (const text of [q.prompt, ...q.choices.map((c) => c.text)]) {
            for (const word of tokens(text)) expect(known(word), `${n.id} type ${type}: "${word}" in "${text}"`).toBe(true)
          }
        }
      }
    }
  })

  it('never a double negative, never two identical choices, always exactly one right answer', () => {
    for (const n of DECK) {
      for (const type of trapTypes(deck, n.id)) {
        for (const s of SEEDS) {
          const q = ask(n.id, type, s)
          for (const c of q.choices) expect([...c.text.matchAll(NEGATION)].length, c.text).toBeLessThan(2)
          expect(new Set(q.choices.map((c) => c.text.toLocaleLowerCase())).size).toBe(q.choices.length)
          expect(q.choices.filter((c) => c.tag === q.correctTag)).toHaveLength(1)
        }
      }
    }
  })
})

describe('the eligible pool', () => {
  it('a formula makes type 8 eligible; anything else omits it', () => {
    expect(isFormula('P0 = D1 / (r - g)')).toBe(true)
    expect(trapTypes(deck, 'f1')).toContain(8)
    for (const id of ['m1', 'm2', 't1', 't2', 't3', 'f3']) expect(trapTypes(deck, id)).not.toContain(8)
  })

  it('a conditional or causal statement makes type 7 eligible; anything else omits it', () => {
    expect(parseConditional('Mitochondria produce ATP when oxygen is available.')).not.toBeNull()
    for (const id of ['m1', 't2', 'f3']) expect(trapTypes(deck, id)).toContain(7)
    for (const id of ['m2', 't3', 'f1', 'f2']) expect(trapTypes(deck, id)).not.toContain(7)
  })

  it('an example makes type 5 eligible', () => {
    expect(parseScenario(DECK[3].statement)).toEqual({ example: 'a drop of ink spreading in water', claim: 'Diffusion moves particles down a concentration gradient' })
    expect(trapTypes(deck, 't1')).toContain(5)
    expect(trapTypes(deck, 'm2')).not.toContain(5)
  })

  it('without a formula or a condition, falls back cleanly to cloze or concept mapping', () => {
    const plain = prepareDeck([note('a', 'Ribosomes synthesize proteins.', ['Cell organelles'], ['org']), note('b', 'Lysosomes digest waste.', ['Cell parts'], ['parts'])])
    const types = trapTypes(plain, 'a')
    expect(types).not.toContain(7)
    expect(types).not.toContain(8)
    expect(types.some((t) => t === 2 || t === 3)).toBe(true)
    // A typed seed for an ineligible type still builds a fair question of an eligible type.
    const res = buildQuestion(plain, 'a', typedSeed(8, 'abc'))
    expect(res.ok && res.question.trapType !== 8 && res.question.trapType !== null).toBe(true)
  })

  it('every statement of the mixed tree has several types; across the tree all 8 are reachable', () => {
    for (const n of DECK) expect(trapTypes(deck, n.id).length, n.id).toBeGreaterThanOrEqual(2)
    expect(new Set(DECK.flatMap((n) => trapTypes(deck, n.id)))).toEqual(new Set(TRAP_TYPES))
    for (const n of DECK) expect(questionKinds(deck, n.id)).not.toContain('exact')
  })
})

describe('scheduling: an even spread, no type twice within 2 questions', () => {
  it('100 questions over statements eligible for all 8: 12–13 of each, never a repeat in the window', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ item: i, eligible: TRAP_TYPES }))
    const plan = scheduleTrapTypes(items, seededRandom('batch'))
    const counts = typeCounts(plan.map((p) => p.type))
    for (const t of TRAP_TYPES) expect([12, 13]).toContain(counts.get(t))
    for (let i = 1; i < plan.length; i++) {
      for (let k = 1; k <= TRAP_HISTORY && i - k >= 0; k++) expect(plan[i].type, `question ${i}`).not.toBe(plan[i - k].type)
    }
    expect(plan.map((p) => p.item).sort((a, b) => a - b)).toEqual(items.map((x) => x.item))
  })

  it('mixed pools (each statement 3–8 types, as real notes): balanced and no repeats in the window', () => {
    const random = seededRandom('pools')
    const items = Array.from({ length: 100 }, (_, i) => ({ item: i, eligible: TRAP_TYPES.filter(() => random() < 0.6).concat([2, 3]).filter((t, k, a) => a.indexOf(t) === k).sort() as TrapType[] }))
    const plan = scheduleTrapTypes(items, seededRandom('mixed'))
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].type).not.toBe(plan[i - 1].type)
      if (i >= 2) expect(plan[i].type).not.toBe(plan[i - 2].type)
    }
    for (const p of plan) expect(items[p.item].eligible).toContain(p.type)
    const counts = [...typeCounts(plan.map((p) => p.type)).values()]
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(8)
  })

  it('statements with a single type: the next ones move up to avoid a repeat, a repeat only when nothing else can go', () => {
    const items = [
      { item: 'a', eligible: [2] as TrapType[] },
      { item: 'b', eligible: [2] as TrapType[] },
      { item: 'c', eligible: [3] as TrapType[] },
      { item: 'd', eligible: [5] as TrapType[] },
    ]
    const plan = scheduleTrapTypes(items, seededRandom('x'))
    expect(plan.map((p) => p.item)).toEqual(['a', 'c', 'd', 'b'])
    expect(plan.map((p) => p.type)).toEqual([2, 3, 5, 2])
    // Nothing else to ask: the repeat is unavoidable.
    expect(scheduleTrapTypes([{ item: 1, eligible: [2] }, { item: 2, eligible: [2] }], seededRandom('y')).map((p) => p.type)).toEqual([2, 2])
    // The last-resort card has no type and keeps its place.
    expect(scheduleTrapTypes([{ item: 'z', eligible: [] }], seededRandom('z'))).toEqual([{ item: 'z', type: null }])
  })
})

describe('a simulated 100-drill batch on the mixed tree', () => {
  // Ten rounds over the tree's 9 statements (+1), each scheduled and built the way drillSession does.
  const batch = Array.from({ length: 100 }, (_, i) => DECK[i % DECK.length].id)
  const plan = scheduleTrapTypes(
    batch.map((id) => ({ item: id, eligible: trapTypes(deck, id) })),
    seededRandom('session-1:types'),
  )
  const questions = plan.map(({ item, type }, i) => {
    const seed = typedSeed(type!, (1000 + i).toString(36))
    const res = buildQuestion(deck, item, seed)
    if (!res.ok) throw new Error('unbuildable')
    return { id: item, seed, type, q: res.question }
  })

  it('asks every question as its scheduled type, never the same type twice within 2 questions', () => {
    for (const { type, q } of questions) expect(q.trapType).toBe(type)
    for (let i = 1; i < questions.length; i++) {
      expect(questions[i].q.trapType).not.toBe(questions[i - 1].q.trapType)
      if (i >= 2) expect(questions[i].q.trapType).not.toBe(questions[i - 2].q.trapType)
    }
  })

  it('spreads the batch over all 8 types, each well represented', () => {
    const counts = typeCounts(questions.map((x) => x.q.trapType))
    expect([...counts.keys()].sort()).toEqual([...TRAP_TYPES])
    for (const t of TRAP_TYPES) expect(counts.get(t)!, `type ${t}`).toBeGreaterThanOrEqual(6)
    // Types every statement supports (cloze, concept mapping) don't crowd the rest out.
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(20)
  })

  it('grading rebuilds each question exactly from its typed seed, which passes the answer DTO', () => {
    for (const { id, seed, q } of questions) {
      expect(seedTrapType(seed)).toBe(q.trapType)
      expect(DrillSubmissionDto.safeParse({ itemId: '00000000-0000-4000-8000-000000000000', seed, tag: 'A' }).success).toBe(true)
      const again = buildQuestion(prepareDeck([...DECK].reverse()), id, seed)
      expect(again.ok && again.question).toEqual(q)
    }
  })
})
