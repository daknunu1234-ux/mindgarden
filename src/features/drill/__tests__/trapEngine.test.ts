import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectTrapCandidates, generateTraps } from '@/shared/lib/trapEngine'
import { hashString, seededRandom, seededShuffle } from '@/shared/utils/seededRandom'

const STMT = 'Khi nhiệt độ tăng, áp suất khí lớn hơn.'
const MITO = 'Mitochondria produce ATP through cellular respiration.'
const MITO_RULES = {
  swaps: [
    { from: 'ATP', to: 'DNA' },
    { from: 'cellular respiration', to: 'photosynthesis' },
  ],
}

const seeds = Array.from({ length: 60 }, (_, i) => `item${i}:sess7`)

afterEach(() => vi.restoreAllMocks())

describe('generateTraps', () => {
  it('is deterministic for the same seed', () => {
    expect(generateTraps(STMT, {}, 'item42:sess7')).toEqual(generateTraps(STMT, {}, 'item42:sess7'))
  })

  it('returns 3 unique choices tagged A/B/C with the original as correctTag', () => {
    const r = generateTraps(STMT, {}, 'item42:sess7')
    if (!r.ok) throw new Error('expected traps')
    expect(r.choices.map((c) => c.tag)).toEqual(['A', 'B', 'C'])
    expect(new Set(r.choices.map((c) => c.text)).size).toBe(3)
    expect(r.choices.find((c) => c.tag === r.correctTag)?.text).toBe(STMT)
  })

  it('uses only candidates from the pool as traps', () => {
    const pool = collectTrapCandidates(MITO, MITO_RULES)
    for (const seed of seeds) {
      const r = generateTraps(MITO, MITO_RULES, seed)
      if (!r.ok) throw new Error('expected traps')
      const traps = r.choices.filter((c) => c.tag !== r.correctTag).map((c) => c.text)
      for (const trap of traps) expect(pool).toContain(trap)
    }
  })

  it('spreads the correct answer across A, B and C over many seeds', () => {
    const tags = new Set(
      seeds.map((seed) => {
        const r = generateTraps(STMT, {}, seed)
        if (!r.ok) throw new Error('expected traps')
        return r.correctTag
      }),
    )
    expect(tags).toEqual(new Set(['A', 'B', 'C']))
  })

  it('reports INSUFFICIENT_MUTATIONS with fewer than 2 candidates', () => {
    expect(generateTraps('Mitochondria produce ATP.', {}, 's')).toEqual({
      ok: false,
      reason: 'INSUFFICIENT_MUTATIONS',
    })
    expect(generateTraps('Nhiệt độ tăng.', {}, 's')).toEqual({ ok: false, reason: 'INSUFFICIENT_MUTATIONS' })
    expect(generateTraps('', {}, 's').ok).toBe(false)
  })

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random')
    generateTraps(STMT, MITO_RULES, 'item42:sess7')
    generateTraps(MITO, MITO_RULES, 'item42:sess7')
    expect(spy).not.toHaveBeenCalled()
  })

  it('normalizes NFD input so the correct choice is the NFC statement', () => {
    const r = generateTraps(STMT.normalize('NFD'), {}, 'seed')
    if (!r.ok) throw new Error('expected traps')
    expect(r.choices.find((c) => c.tag === r.correctTag)?.text).toBe(STMT)
  })
})

describe('collectTrapCandidates: swaps', () => {
  it('applies each configured swap, one mutation per candidate', () => {
    expect(collectTrapCandidates(MITO, MITO_RULES)).toEqual([
      'Mitochondria produce ATP through photosynthesis.',
      'Mitochondria produce DNA through cellular respiration.',
    ])
  })

  it('matches case-insensitively on whole words only', () => {
    const rules = { swaps: [{ from: 'atp', to: 'DNA' }] }
    expect(collectTrapCandidates('ATPase uses ATP.', rules)).toEqual(['ATPase uses DNA.'])
  })

  it('creates one candidate per occurrence', () => {
    const rules = { swaps: [{ from: 'ATP', to: 'DNA' }] }
    expect(collectTrapCandidates('ATP makes ATP.', rules)).toEqual(['DNA makes ATP.', 'ATP makes DNA.'])
  })

  it('matches multi-word phrases across extra whitespace', () => {
    const rules = { swaps: [{ from: 'cellular respiration', to: 'photosynthesis' }] }
    expect(collectTrapCandidates('Via cellular   respiration.', rules)).toEqual(['Via photosynthesis.'])
  })

  it('prefers the longer swap when phrases overlap', () => {
    const rules = {
      swaps: [
        { from: 'respiration', to: 'fermentation' },
        { from: 'cellular respiration', to: 'photosynthesis' },
      ],
    }
    expect(collectTrapCandidates('Energy from cellular respiration.', rules)).toEqual([
      'Energy from photosynthesis.',
    ])
  })

  it('ignores empty swaps and swaps that change nothing', () => {
    const rules = {
      swaps: [
        { from: '   ', to: 'x' },
        { from: 'ATP', to: 'atp' },
      ],
    }
    expect(collectTrapCandidates('Cells use ATP.', rules)).toEqual([])
  })
})

describe('collectTrapCandidates: opposite pairs', () => {
  it('swaps Vietnamese opposites in both directions', () => {
    expect(collectTrapCandidates(STMT, {})).toEqual([
      'Khi nhiệt độ tăng, áp suất khí nhỏ hơn.',
      'Khi nhiệt độ giảm, áp suất khí lớn hơn.',
    ])
    expect(collectTrapCandidates('Áp suất giảm.', {})).toEqual(['Áp suất tăng.'])
  })

  it('respects Vietnamese word boundaries (no \\b diacritic bugs)', () => {
    // "tăng" inside "tăngx" or "xtăng" is not a word on its own.
    expect(collectTrapCandidates('tăngx xtăng', {})).toEqual([])
  })

  it('keeps a leading capital', () => {
    expect(collectTrapCandidates('Tăng nhiệt độ.', {})).toEqual(['Giảm nhiệt độ.'])
    expect(collectTrapCandidates('Always true.', {})).toEqual(['Never true.'])
  })

  it('does not match inside English words', () => {
    expect(collectTrapCandidates('Furthermore, we explore.', {})).toEqual([])
  })
})

describe('collectTrapCandidates: negation', () => {
  it('only negates when trap_rules.negate is true', () => {
    expect(collectTrapCandidates('ATP is energy.', {})).toEqual([])
    expect(collectTrapCandidates('ATP is energy.', { negate: true })).toEqual(['ATP is not energy.'])
  })

  it('removes an existing negation (longest phrase first)', () => {
    expect(collectTrapCandidates('ATP is not DNA.', { negate: true })).toEqual(['ATP is DNA.'])
    expect(collectTrapCandidates('Cells cannot divide.', { negate: true })).toEqual(['Cells can divide.'])
  })

  it('negates Vietnamese statements', () => {
    expect(collectTrapCandidates('Ty thể là bào quan.', { negate: true })).toEqual([
      'Ty thể không phải là bào quan.',
    ])
    expect(collectTrapCandidates('Tế bào không thể phân chia.', { negate: true })).toEqual([
      'Tế bào có thể phân chia.',
    ])
  })

  it('does not match "là" inside "làm"', () => {
    expect(collectTrapCandidates('Họ làm việc.', { negate: true })).toEqual([])
  })
})

describe('collectTrapCandidates: operators', () => {
  it('swaps spaced operators', () => {
    expect(collectTrapCandidates('F = m * a', {})).toEqual(['F = m / a'])
    expect(collectTrapCandidates('v = s / t', {})).toEqual(['v = s * t'])
    expect(collectTrapCandidates('c = a + b', {})).toEqual(['c = a - b'])
  })

  it('swaps tight operators between operands', () => {
    expect(collectTrapCandidates('x = a+b', {})).toEqual(['x = a-b'])
    expect(collectTrapCandidates('3-4', {})).toEqual(['3+4'])
    expect(collectTrapCandidates('1/2', {})).toEqual(['1*2'])
  })

  it('leaves hyphenated words, units and signs alone', () => {
    expect(collectTrapCandidates('A cell-biology deck.', {})).toEqual([])
    expect(collectTrapCandidates('Speed in km/h.', {})).toEqual([])
    expect(collectTrapCandidates('x = -3', {})).toEqual([])
    expect(collectTrapCandidates('a +b', {})).toEqual([])
  })

  it('creates one candidate per operator', () => {
    expect(collectTrapCandidates('y = a * b + c', {})).toEqual(['y = a / b + c', 'y = a * b - c'])
  })
})

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom('abc')
    const b = seededRandom('abc')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('stays within [0, 1)', () => {
    const r = seededRandom('range')
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('hashes different strings differently', () => {
    expect(hashString('item1:sess')).not.toBe(hashString('item2:sess'))
  })

  it('shuffles without mutating the input and keeps every item', () => {
    const input = [1, 2, 3, 4, 5]
    const out = seededShuffle(input, seededRandom('s'))
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect([...out].sort()).toEqual(input)
  })
})
