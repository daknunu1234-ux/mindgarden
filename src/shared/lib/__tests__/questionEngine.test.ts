import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import { comparable, stripMarks } from '../notePatterns'
import {
  buildQuestion,
  exactVariants,
  isNoteDrillable,
  prepareDeck,
  questionKinds,
  toDeckNote,
  type DeckNote,
  type Question,
  type QuestionKind,
} from '../questionEngine'

// A note in a root (path = breadcrumb titles, ancestry = the same roots' ids).
const note = (id: string, statement: string, path: string[], ancestry = path.map((p) => `n:${p}`)): DeckNote => ({
  id,
  nodeId: ancestry[ancestry.length - 1],
  statement,
  path,
  ancestry,
  rules: { negate: true },
})

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed${i}`)

function ask(notes: DeckNote[], id: string, seed = 'seed0'): Question {
  const res = buildQuestion(prepareDeck(notes), id, seed)
  if (!res.ok) throw new Error(`expected a question for ${id}`)
  return res.question
}
const answerOf = (q: Question) => q.choices.find((c) => c.tag === q.correctTag)!.text
// Every question type a note produces over many seeds.
const kindsOver = (notes: DeckNote[], id: string) => new Set(SEEDS.map((s) => ask(notes, id, s).kind))

// Shared shape checks: 2–4 choices tagged A, B, C, D in order, all different, one correct.
function expectWellFormed(q: Question) {
  expect(q.choices.length).toBeGreaterThanOrEqual(2)
  expect(q.choices.length).toBeLessThanOrEqual(4)
  expect(q.choices.map((c) => c.tag)).toEqual(['A', 'B', 'C', 'D'].slice(0, q.choices.length))
  expect(new Set(q.choices.map((c) => comparable(c.text))).size).toBe(q.choices.length)
  expect(q.choices.some((c) => c.tag === q.correctTag)).toBe(true)
}

describe('contextual inheritance in questions', () => {
  const deck = [note('ts1', 'is a superset of JavaScript', ['Web', 'TypeScript']), note('ts2', 'compiles down to clean JavaScript', ['Web', 'TypeScript'])]

  it('asks a predicate-only note as its full proposition, with the breadcrumb badge', () => {
    const q = ask(deck, 'ts1')
    expect(q.kind).toBe('statement')
    expect(q.context).toEqual(['Web', 'TypeScript'])
    expect(answerOf(q)).toBe('TypeScript is a superset of JavaScript')
    expect(q.choices.every((c) => c.text.startsWith('TypeScript '))).toBe(true)
    expect(q.instruction).toBe('About TypeScript')
    expectWellFormed(q)
  })

  it('always carries the breadcrumb, whatever the question type', () => {
    for (const s of SEEDS) expect(ask(deck, 'ts2', s).context).toEqual(['Web', 'TypeScript'])
  })
})

describe('key–value and definition notes: dual-direction recall', () => {
  const root = ['Sinh học', 'Bào quan']
  const deck = [
    note('k1', 'Ty thể: nhà máy năng lượng', root),
    note('k2', 'Ribosome: nơi tổng hợp protein', root),
    note('k3', 'Lục lạp: nơi quang hợp', root),
    note('k4', 'Nhân: chứa DNA', root),
  ]

  it('offers both directions', () => {
    const kinds = questionKinds(prepareDeck(deck), 'k1')
    expect(kinds).toContain('recall-right')
    expect(kinds).toContain('recall-left')
  })

  it('key → value: blanks the value, other notes’ values are the wrong choices', () => {
    const q = SEEDS.map((s) => ask(deck, 'k1', s)).find((x) => x.kind === 'recall-right')!
    expect(q.prompt).toBe('Ty thể: ____')
    expect(answerOf(q)).toBe('nhà máy năng lượng')
    for (const c of q.choices) expect(['nhà máy năng lượng', 'nơi tổng hợp protein', 'nơi quang hợp', 'chứa DNA']).toContain(c.text)
    expectWellFormed(q)
  })

  it('value → key: blanks the key, other notes’ keys are the wrong choices', () => {
    const q = SEEDS.map((s) => ask(deck, 'k1', s)).find((x) => x.kind === 'recall-left')!
    expect(q.prompt).toBe('____: nhà máy năng lượng')
    expect(answerOf(q)).toBe('Ty thể')
    for (const c of q.choices) expect(['Ty thể', 'Ribosome', 'Lục lạp', 'Nhân']).toContain(c.text)
    expect(q.choices).toHaveLength(4)
  })

  it('works for "X là Y" / "X is defined as Y" definitions and spaced dashes / equals signs', () => {
    const defs = [
      note('d1', 'Ty thể là bào quan có màng kép', root),
      note('d2', 'Ribosome là bào quan không có màng', root),
      note('d3', 'HTTP - giao thức web', ['Mạng']),
      note('d4', 'DNS = hệ thống phân giải tên miền', ['Mạng']),
    ]
    expect(questionKinds(prepareDeck(defs), 'd1')).toEqual(expect.arrayContaining(['recall-right', 'recall-left']))
    const q = SEEDS.map((s) => ask(defs, 'd1', s)).find((x) => x.kind === 'recall-right')!
    expect(q.prompt).toBe('Ty thể là ____')
    expect(answerOf(q)).toBe('bào quan có màng kép')
    const dash = SEEDS.map((s) => ask(defs, 'd3', s)).find((x) => x.kind === 'recall-left')!
    expect(dash.prompt).toBe('____ – giao thức web')
    expect(answerOf(dash)).toBe('HTTP')
  })
})

describe('cloze masking', () => {
  it('blanks a number with plausible wrong numbers, even alone in the deck (4 choices)', () => {
    const deck = [note('y1', 'Việt Nam tuyên bố độc lập năm 1945', ['Lịch sử'])]
    const qs = SEEDS.map((s) => ask(deck, 'y1', s)).filter((q) => q.kind === 'cloze' && answerOf(q) === '1945')
    expect(qs.length).toBeGreaterThan(0)
    const q = qs[0]
    expect(q.prompt).toBe('Việt Nam tuyên bố độc lập năm ____')
    expect(q.instruction).toBe('Fill in the blank')
    expect(q.choices).toHaveLength(4)
    for (const c of q.choices) expect(c.text).toMatch(/^\d{4}$/)
    expectWellFormed(q)
  })

  it('blanks a keyword using terms from the rest of the deck, never one already in the sentence', () => {
    const deck = [
      note('c1', 'TypeScript was created by Microsoft', ['Languages']),
      note('c2', 'Go was created by Google', ['Languages']),
      note('c3', 'Swift was created by Apple', ['Languages']),
    ]
    const qs = SEEDS.map((s) => ask(deck, 'c1', s)).filter((q) => q.kind === 'cloze')
    expect(qs.length).toBeGreaterThan(0)
    for (const q of qs) {
      expectWellFormed(q)
      expect(q.prompt).toContain('____')
      const visible = q.prompt.replace('____', '')
      // A wrong choice never already appears in the sentence (no giveaways).
      for (const c of q.choices) if (c.tag !== q.correctTag) expect(visible).not.toContain(c.text)
      expect(q.prompt.replace('____', answerOf(q))).toBe('TypeScript was created by Microsoft')
    }
  })

  it('[author marks] win: the note is only ever asked as that cloze', () => {
    const deck = [note('m1', '[Ty thể] sản sinh ATP', ['Bào quan']), note('m2', '[Ribosome] tổng hợp protein', ['Bào quan'])]
    expect(questionKinds(prepareDeck(deck), 'm1')).toEqual(['cloze'])
    for (const s of SEEDS) {
      const q = ask(deck, 'm1', s)
      expect(q.prompt).toBe('____ sản sinh ATP')
      expect(answerOf(q)).toBe('Ty thể')
      expect(q.choices.map((c) => c.text).sort()).toEqual(['Ribosome', 'Ty thể'])
    }
  })
})

describe('plausible distractors', () => {
  const deck = [
    note('s1', 'Ty thể: nhà máy năng lượng', ['Sinh học', 'Bào quan']),
    note('s2', 'Ribosome: tổng hợp protein', ['Sinh học', 'Bào quan']),
    note('s3', 'v = s / t', ['Vật lý']),
    note('s4', 'compiles down to clean JavaScript', ['TypeScript']),
    note('s5', 'TypeScript was released by Microsoft', ['TypeScript']),
  ]

  it('stays within the note’s own subject when it has candidates there (fewer choices, no odd one out)', () => {
    for (const s of SEEDS) {
      const q = ask(deck, 's1', s)
      expect(q.choices.map((c) => c.text)).not.toContain('s / t')
    }
  })

  it('never offers a root title from the breadcrumb, nor a category name, as a wrong answer', () => {
    for (const s of SEEDS) {
      const q = ask(deck, 's4', s)
      const wrong = q.choices.filter((c) => c.tag !== q.correctTag).map((c) => c.text)
      expect(wrong).not.toContain('TypeScript')
      expect(wrong).not.toContain('Vật lý')
    }
  })
})

describe('short phrases: recognition with sibling categories as distractors', () => {
  const deck = [
    note('o1', 'Ty thể', ['Tế bào', 'Bào quan']),
    note('o2', 'Ribosome', ['Tế bào', 'Bào quan']),
    note('o3', 'Golgi', ['Tế bào', 'Bào quan']),
    note('p1', 'ATP', ['Tế bào', 'Phân tử']),
    note('p2', 'Glucose', ['Tế bào', 'Phân tử']),
    note('p3', 'Protein', ['Tế bào', 'Phân tử']),
  ]

  it('asks which item is filed under the root, never offering another item of that same root', () => {
    const q = ask(deck, 'o1')
    expect(q.kind).toBe('recognize')
    expect(q.prompt).toBe('Which note belongs under “Bào quan”?')
    expect(answerOf(q)).toBe('Ty thể')
    for (const c of q.choices) expect(['Ribosome', 'Golgi']).not.toContain(c.text)
    expectWellFormed(q)
  })

  it('never uses notes from deeper inside the same branch as wrong answers', () => {
    const nested = [
      note('a1', 'Ty thể', ['Tế bào'], ['n:cell']),
      note('a2', 'Màng kép', ['Tế bào', 'Ty thể'], ['n:cell', 'n:mito']),
      note('a3', 'Glucose', ['Phân tử'], ['n:mol']),
    ]
    for (const s of SEEDS) {
      const q = ask(nested, 'a1', s)
      if (q.kind === 'recognize') expect(q.choices.map((c) => c.text)).not.toContain('Màng kép')
    }
  })
})

describe('zero-drop fallback', () => {
  it('asks a note no pattern fits by recognition across the deck', () => {
    const deck = [note('f1', 'xem lại ghi chú này nha', ['Việc cần làm']), note('f2', 'Ty thể sản sinh ATP', ['Sinh học'])]
    expect(questionKinds(prepareDeck(deck), 'f1')).toEqual(['recognize'])
    const q = ask(deck, 'f1')
    expect(q.context).toEqual(['Việc cần làm'])
    expect(answerOf(q)).toBe('xem lại ghi chú này nha')
    expectWellFormed(q)
  })

  it('alone in its deck, asks "spot your exact note" (front: the root, back: the note)', () => {
    const q = ask([note('e1', 'ghi chú nhanh về bài', ['Ôn tập'])], 'e1')
    expect(q.kind).toBe('exact')
    expect(q.context).toEqual(['Ôn tập'])
    expect(answerOf(q)).toBe('ghi chú nhanh về bài')
    expectWellFormed(q)
  })

  it('even a lone single word is askable (letter-swapped copies)', () => {
    expect(exactVariants('ATP')).toEqual(['TAP', 'APT'])
    expect(answerOf(ask([note('w1', 'ATP', ['Phân tử'])], 'w1'))).toBe('ATP')
  })

  it('drops nothing: formulas, shorthand, symbols, Vietnamese and English fragments all get a question', () => {
    const odd = [
      'E=mc^2',
      'v = s / t',
      '→ dùng khi cần nhanh',
      'O(n log n) worst case',
      'xem slide 12',
      'Cells need water.',
      'Ty thể của tế bào.',
      'TODO!!!',
      '🙂 vui',
      'a + b',
      'Ribosome tổng hợp protein.',
    ]
    for (const [i, statement] of odd.entries()) {
      // Alone in its deck: the hardest case.
      const res = buildQuestion(prepareDeck([note(`z${i}`, statement, ['Ghi chú'])]), `z${i}`, 'seed')
      expect(res.ok, statement).toBe(true)
      expect(isNoteDrillable(statement), statement).toBe(true)
    }
  })

  it('only a note with no two distinct words or letters cannot be asked on its own', () => {
    expect(isNoteDrillable('aaa')).toBe(false)
    expect(buildQuestion(prepareDeck([note('x', 'aaa', ['R'])]), 'x', 's').ok).toBe(false)
    expect(buildQuestion(prepareDeck([]), 'missing', 's').ok).toBe(false)
  })
})

describe('determinism and grading', () => {
  const deck = [
    note('g1', 'Ty thể: nhà máy năng lượng', ['Bào quan']),
    note('g2', 'Ribosome: tổng hợp protein', ['Bào quan']),
    note('g3', 'TypeScript was released in 2012', ['Web']),
    note('g4', 'is a superset of JavaScript', ['Web', 'TypeScript']),
    note('g5', 'ATP', ['Phân tử']),
    note('g6', 'Glucose', ['Phân tử']),
  ]

  it('same deck + note + seed → same question, whatever order the rows came in', () => {
    for (const shuffleSeed of ['x', 'y', 'z']) {
      const shuffled = seededShuffle(deck, seededRandom(shuffleSeed))
      for (const n of deck) for (const s of SEEDS.slice(0, 8)) expect(ask(shuffled, n.id, s)).toEqual(ask(deck, n.id, s))
    }
  })

  it('the correct tag always points at the true answer for that question type', () => {
    for (const n of deck) {
      const text = stripMarks(n.statement).text
      for (const s of SEEDS) {
        const q = ask(deck, n.id, s)
        expectWellFormed(q)
        const answer = answerOf(q)
        const truth: Record<QuestionKind, () => boolean> = {
          cloze: () => q.prompt.replace('____', answer) === text,
          'recall-right': () => q.prompt.replace('____', answer) === text,
          'recall-left': () => q.prompt.replace('____', answer).replace(' – ', ' - ') === text || q.prompt.replace('____', answer) === text,
          statement: () => answer.endsWith(text),
          recognize: () => answer === text,
          exact: () => answer === text,
        }
        expect(truth[q.kind](), `${n.id} ${s} ${q.kind}: ${q.prompt} → ${answer}`).toBe(true)
      }
    }
  })

  it('varies the question type across sessions for notes that support several', () => {
    expect(kindsOver(deck, 'g1').size).toBeGreaterThan(1)
  })

  it('turns loaded drill items into notes, defaulting the breadcrumb to the root title', () => {
    expect(toDeckNote({ id: 'i', nodeId: 'n', nodeTitle: 'Bào quan', correctStmt: 'ATP', trapRules: {} })).toEqual({
      id: 'i',
      nodeId: 'n',
      statement: 'ATP',
      path: ['Bào quan'],
      ancestry: ['n'],
      rules: {},
    })
  })
})

describe('purity (hard rule 8: deterministic, no DB, no network)', () => {
  it('never calls Math.random or reads the clock', () => {
    const random = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')
    const deck = [note('p1', 'TypeScript was released in 2012', ['Web']), note('p2', 'Ty thể: nhà máy', ['Bào quan']), note('p3', 'ATP', ['Phân tử'])]
    for (const n of deck) for (const s of SEEDS.slice(0, 5)) ask(deck, n.id, s)
    expect(random).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
  })

  it('imports nothing but other pure modules', () => {
    for (const file of ['questionEngine.ts', 'notePatterns.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8')
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
      expect(imports.every((i) => ['./trapEngine', './trapDictionary', './notePatterns', '@/shared/utils/seededRandom'].includes(i)), `${file}: ${imports}`).toBe(true)
      // Code only: the header comments mention what the engine must never do.
      expect(source.replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|new Date|Date\.now|fetch\(|supabase/)
    }
  })
})
