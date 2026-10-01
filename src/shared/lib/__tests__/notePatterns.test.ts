import { describe, expect, it } from 'vitest'
import {
  clozeTargets,
  isPredicateOnly,
  isShortPhrase,
  maskAt,
  numberDistractors,
  pairLine,
  parsePair,
  stripMarks,
  synthesizeProposition,
} from '../notePatterns'

describe('contextual inheritance: the root as implicit subject', () => {
  it('prepends the root title to a predicate-only note', () => {
    expect(synthesizeProposition('compiles down to clean JavaScript', ['TypeScript'])).toEqual({
      text: 'TypeScript compiles down to clean JavaScript',
      inherited: true,
    })
    expect(synthesizeProposition('is a superset of JavaScript', ['Web', 'TypeScript']).text).toBe('TypeScript is a superset of JavaScript')
    expect(synthesizeProposition('sản sinh ATP', ['Sinh học', 'Ty thể']).text).toBe('Ty thể sản sinh ATP')
    expect(synthesizeProposition('là bào quan có màng kép', ['Ty thể']).text).toBe('Ty thể là bào quan có màng kép')
  })

  it('uses the deepest root of the breadcrumb (the note’s own root)', () => {
    expect(synthesizeProposition('runs on the server', ['Next.js', 'Server Actions']).text).toBe('Server Actions runs on the server')
  })

  it('leaves notes that have their own subject, clauses, pairs and terms alone', () => {
    for (const note of [
      'Ty thể sản sinh ATP.',
      'TypeScript compiles to JavaScript',
      'khi nhiệt độ tăng, áp suất tăng',
      'when the cache is cold, the first request is slow',
      'Ty thể: nhà máy năng lượng',
      'ATP',
      'mitochondria',
    ]) {
      expect(isPredicateOnly(note), note).toBe(false)
      expect(synthesizeProposition(note, ['Root']).inherited, note).toBe(false)
    }
  })

  it('does nothing without a breadcrumb', () => {
    expect(synthesizeProposition('compiles down to clean JavaScript', [])).toEqual({ text: 'compiles down to clean JavaScript', inherited: false })
  })
})

describe('pairs: Key: Value, Key - Value, Key = Value and definitions', () => {
  it('splits key–value notes on a colon, a spaced dash or a spaced equals sign', () => {
    expect(parsePair('Ty thể: nhà máy năng lượng của tế bào')).toEqual({ left: 'Ty thể', right: 'nhà máy năng lượng của tế bào', joiner: ':' })
    expect(parsePair('HTTP - giao thức truyền siêu văn bản')).toEqual({ left: 'HTTP', right: 'giao thức truyền siêu văn bản', joiner: '–' })
    expect(parsePair('useMemo — caches a computed value')).toEqual({ left: 'useMemo', right: 'caches a computed value', joiner: '–' })
    expect(parsePair('F = m * a')).toEqual({ left: 'F', right: 'm * a', joiner: '=' })
  })

  it('ignores times, URLs, hyphenated words and over-long keys', () => {
    expect(parsePair('Họp lúc 10:30 sáng')).toBeNull()
    expect(parsePair('https://nextjs.org')).toBeNull()
    expect(parsePair('cell-biology basics')).toBeNull()
    expect(parsePair('one two three four five six seven eight nine: value')).toBeNull()
  })

  it('recognises definition markers, longest first', () => {
    expect(parsePair('Photosynthesis is defined as making sugar from light')).toEqual({
      left: 'Photosynthesis',
      right: 'making sugar from light',
      joiner: 'is defined as',
    })
    expect(parsePair('API refers to an application programming interface')?.joiner).toBe('refers to')
    expect(parsePair('Ty thể nghĩa là bào quan năng lượng')).toEqual({ left: 'Ty thể', right: 'bào quan năng lượng', joiner: 'nghĩa là' })
    expect(parsePair('Ty thể là bào quan có màng kép')).toEqual({ left: 'Ty thể', right: 'bào quan có màng kép', joiner: 'là' })
  })

  it('refuses definitions whose "term" is a clause or a long phrase', () => {
    expect(parsePair('khi trời mưa là đường trơn')).toBeNull()
    expect(parsePair('a b c d e f g is something')).toBeNull()
    expect(parsePair('is a superset of JavaScript')).toBeNull()
  })

  it('reads back with either half blanked', () => {
    const pair = parsePair('Ty thể: nhà máy năng lượng')!
    expect(pairLine(pair, 'right')).toBe('Ty thể: ____')
    expect(pairLine(pair, 'left')).toBe('____: nhà máy năng lượng')
    const def = parsePair('Ty thể là bào quan')!
    expect(pairLine(def, 'right')).toBe('Ty thể là ____')
    expect(pairLine(def, 'left')).toBe('____ là bào quan')
  })
})

describe('cloze targets', () => {
  it('finds numbers and years, and technical / proper terms', () => {
    const { text, targets } = clozeTargets('TypeScript was released in 2012 by Microsoft.')
    expect(text).toBe('TypeScript was released in 2012 by Microsoft.')
    expect(targets.map((t) => [t.term, t.kind])).toEqual([
      ['TypeScript', 'term'],
      ['2012', 'number'],
      ['Microsoft', 'term'],
    ])
    expect(maskAt(text, targets[1])).toBe('TypeScript was released in ____ by Microsoft.')
  })

  it('joins multi-word names and skips an ordinary capitalised first word', () => {
    const { targets } = clozeTargets('Thủ đô của Việt Nam là Hà Nội')
    expect(targets.map((t) => t.term)).toEqual(['Việt Nam', 'Hà Nội'])
  })

  it('finds quoted terms, percentages and decimals', () => {
    expect(clozeTargets('Lệnh "git rebase" viết lại lịch sử').targets.map((t) => t.term)).toEqual(['git rebase'])
    expect(clozeTargets('Lãi suất tăng 7,5% trong năm').targets.map((t) => t.term)).toEqual(['7,5%'])
    // "pH" has an inner capital: a technical term, a fair blank too.
    expect(clozeTargets('pH của máu là 7.4').targets.map((t) => t.term)).toEqual(['pH', '7.4'])
    // Digits inside a word (H2O) are not numbers.
    expect(clozeTargets('nước là H2O').targets.map((t) => [t.term, t.kind])).toEqual([['H2O', 'term']])
  })

  it('takes [author marks] first, strips the brackets and never overlaps them', () => {
    const { text, targets } = clozeTargets('[Ty thể]   sản sinh  [ATP] năm 1950')
    expect(text).toBe('Ty thể sản sinh ATP năm 1950')
    expect(targets.filter((t) => t.kind === 'marked').map((t) => text.slice(t.start, t.end))).toEqual(['Ty thể', 'ATP'])
    expect(targets.map((t) => t.term)).toEqual(['Ty thể', 'ATP', '1950'])
    expect(stripMarks('no marks here').marked).toEqual([])
  })

  it('never offers the whole note as a blank', () => {
    expect(clozeTargets('ATP').targets).toEqual([])
    expect(clozeTargets('2024').targets).toEqual([])
  })
})

describe('number distractors', () => {
  it('keeps a year a plausible year', () => {
    expect(numberDistractors('2012')).toEqual(['2013', '2011', '2014', '2010', '2022', '2002'])
  })

  it('keeps precision, decimal commas and percentages, and never goes negative', () => {
    expect(numberDistractors('7.4').slice(0, 2)).toEqual(['7.5', '7.3'])
    expect(numberDistractors('7,5%')).toContain('7,6%')
    expect(numberDistractors('0').every((d) => !d.startsWith('-'))).toBe(true)
    expect(numberDistractors('3')).not.toContain('3')
  })
})

describe('short phrases (bullet items)', () => {
  it('are terms and short labels, not sentences or pairs', () => {
    for (const p of ['Ty thể', 'Golgi apparatus', 'useEffect hook', 'ATP']) expect(isShortPhrase(p), p).toBe(true)
    for (const p of ['Ty thể sản sinh ATP', 'Ty thể: nhà máy', 'is a superset of JavaScript', 'one two three four five six']) {
      expect(isShortPhrase(p), p).toBe(false)
    }
  })
})
