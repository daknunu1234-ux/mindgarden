import { describe, expect, it } from 'vitest'
import { collectTrapCandidates, collectTrapTiers, extractSubject, generateTraps } from '@/shared/lib/trapEngine'

// One mindmap node ("Bào quan") with three organelle statements.
const MITO = 'Ty thể sản sinh ATP cho tế bào.'
const RIBO = 'Ribosome tổng hợp protein.'
const NUCLEUS = 'Nhân tế bào chứa DNA.'
const NODE = [MITO, RIBO, NUCLEUS]
const siblingsOf = (stmt: string) => NODE.filter((s) => s !== stmt)

const seeds = Array.from({ length: 40 }, (_, i) => `item${i}:sess`)

describe('extractSubject', () => {
  it('takes the text before the first predicate word', () => {
    expect(extractSubject(MITO)).toBe('Ty thể')
    expect(extractSubject(RIBO)).toBe('Ribosome')
    expect(extractSubject(NUCLEUS)).toBe('Nhân tế bào')
    expect(extractSubject('Mitochondria produce ATP.')).toBe('Mitochondria')
    expect(extractSubject('The ribosome makes proteins.')).toBe('The ribosome')
  })

  it('picks the earliest marker, even when a later one is longer', () => {
    expect(extractSubject('Lục lạp có diệp lục và tạo ra oxi.')).toBe('Lục lạp')
  })

  it('refuses uncertain shapes', () => {
    expect(extractSubject('Khi nhiệt độ tăng, áp suất khí lớn hơn.')).toBeNull() // clause
    expect(extractSubject('When heated, water is a gas.')).toBeNull() // clause + comma
    expect(extractSubject('Tế bào nhân thực.')).toBeNull() // no predicate marker
    expect(extractSubject('Là đơn vị cơ bản của sự sống.')).toBeNull() // marker at the start
    expect(extractSubject('Một hai ba bốn năm sáu bảy là số.')).toBeNull() // subject too long
  })

  it('does not treat a marker inside another word as the predicate', () => {
    // "làm" starts with "là" but is a different word, so there is no predicate here.
    expect(extractSubject('Họ làm việc.')).toBeNull()
  })
})

describe('sibling concept swaps', () => {
  it('swaps the subject with each sibling subject from the same node', () => {
    expect(collectTrapTiers(MITO, {}, siblingsOf(MITO))[0]).toEqual([
      'Nhân tế bào sản sinh ATP cho tế bào.',
      'Ribosome sản sinh ATP cho tế bào.',
    ])
    expect(collectTrapTiers(RIBO, {}, siblingsOf(RIBO))[0]).toEqual([
      'Nhân tế bào tổng hợp protein.',
      'Ty thể tổng hợp protein.',
    ])
  })

  it('makes a 3-choice question from siblings alone, with no dictionary words', () => {
    // "Ribosome tổng hợp protein." has no opposite pair and no negation rule.
    expect(collectTrapCandidates(RIBO, {})).toEqual([])
    const r = generateTraps(RIBO, {}, 'seed', siblingsOf(RIBO))
    if (!r.ok) throw new Error('expected sibling traps')
    expect(r.choices).toHaveLength(3)
    expect(r.choices.map((c) => c.text).sort()).toEqual(
      ['Nhân tế bào tổng hợp protein.', 'Ribosome tổng hợp protein.', 'Ty thể tổng hợp protein.'].sort(),
    )
  })

  it('is deterministic for the same seed, whatever order the siblings arrive in', () => {
    for (const seed of seeds) {
      const a = generateTraps(MITO, { negate: true }, seed, [RIBO, NUCLEUS])
      const b = generateTraps(MITO, { negate: true }, seed, [NUCLEUS, RIBO, RIBO, `  ${NUCLEUS} `])
      expect(b).toEqual(a)
    }
  })

  it('lets the grader re-derive the same correct tag with the same siblings', () => {
    for (const seed of seeds) {
      const shown = generateTraps(MITO, {}, seed, siblingsOf(MITO))
      const graded = generateTraps(MITO, {}, seed, siblingsOf(MITO))
      if (!shown.ok || !graded.ok) throw new Error('expected traps')
      expect(graded.correctTag).toBe(shown.correctTag)
      expect(shown.choices.find((c) => c.tag === shown.correctTag)?.text).toBe(MITO)
    }
  })

  it('prefers sibling swaps over dictionary opposites and negation', () => {
    // Tier 1 (siblings) has 2 candidates, so tiers 2 and 3 are never used.
    const stmt = 'Ty thể tăng sản sinh ATP.'
    const tiers = collectTrapTiers(stmt, { negate: true }, [RIBO, NUCLEUS])
    expect(tiers[0].length).toBe(2)
    expect(tiers[1].length).toBeGreaterThan(0) // tăng → giảm exists…
    for (const seed of seeds) {
      const r = generateTraps(stmt, { negate: true }, seed, [RIBO, NUCLEUS])
      if (!r.ok) throw new Error('expected traps')
      const traps = r.choices.filter((c) => c.tag !== r.correctTag).map((c) => c.text)
      expect(traps.sort()).toEqual([...tiers[0]].sort()) // …but is never picked
    }
  })

  it('fills the second trap from the next tier when only one sibling fits', () => {
    // One sibling → one sibling trap; the dictionary supplies the other.
    const stmt = 'Ty thể tạo ra ATP.'
    const r = generateTraps(stmt, {}, 'seed', [RIBO])
    if (!r.ok) throw new Error('expected traps')
    const traps = r.choices.filter((c) => c.tag !== r.correctTag).map((c) => c.text).sort()
    expect(traps).toEqual(['Ribosome tạo ra ATP.', 'Ty thể tiêu thụ ATP.'])
  })

  it('falls back to negation when neither siblings nor the dictionary help', () => {
    const r = generateTraps('Ty thể là bào quan.', { negate: true }, 'seed', ['Tế bào nhân thực.'])
    if (!r.ok) throw new Error('expected a 2-choice question')
    expect(r.choices).toHaveLength(2)
    expect(r.choices.map((c) => c.text)).toContain('Ty thể không phải là bào quan.')
  })

  it('never offers a sibling statement as a trap, because it is true', () => {
    // Swapping "Ty thể" → "Lục lạp" recreates the sibling's own (true) statement.
    const sibling = 'Lục lạp sản sinh ATP cho tế bào.'
    expect(collectTrapCandidates(MITO, {}, [sibling])).not.toContain(sibling)
    expect(collectTrapCandidates(MITO, {}, [sibling])).toEqual([])
  })

  it('ignores siblings with the same subject, the statement itself, and unparseable siblings', () => {
    const siblings = [MITO, 'Ty thể có màng kép.', 'Khi đói, tế bào phân giải glucose.', '']
    expect(collectTrapTiers(MITO, {}, siblings)[0]).toEqual([])
  })

  it('keeps the leading capital when the sibling subject is lowercase', () => {
    expect(collectTrapTiers(MITO, {}, ['ribosome tổng hợp protein.'])[0]).toEqual(['Ribosome sản sinh ATP cho tế bào.'])
  })

  it('works in English and keeps the rest of the sentence untouched', () => {
    const tiers = collectTrapTiers('Mitochondria produce ATP for the cell.', {}, ['Ribosomes synthesize proteins.'])
    expect(tiers[0]).toEqual(['Ribosomes produce ATP for the cell.'])
  })
})
