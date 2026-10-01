import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/decks/server', () => ({ listDrillItems: vi.fn() }))

import { listDrillItems } from '@/features/decks/server'
import { GetDrillSessionDto, GetTournamentSessionDto } from '../dto/GetDrillSessionDto'
import { drillHref, tournamentHref } from '../lib/drillHref'
import {
  DEFAULT_DRILL_SIZE,
  drillSizeOptions,
  effectiveDrillSize,
  normalizeDrillSize,
  resolveDrillSize,
  withDrillSize,
  type DrillSize,
} from '../lib/drillSize'
import { orderByMastery } from '../lib/queue'
import { buildDrillSession } from '../services/drillSession'

// ─── Pure size rules ──────────────────────────────────────────────────────────────────────────

describe('normalizeDrillSize', () => {
  it('accepts 5, 10 and 20, as numbers or URL strings', () => {
    expect([5, '10', ['20']].map(normalizeDrillSize)).toEqual([5, 10, 20])
  })

  it('defaults to 10 when missing or invalid', () => {
    expect(DEFAULT_DRILL_SIZE).toBe(10)
    for (const bad of [undefined, null, '', '7', 7, 50, 0, -5, 'abc', '5.5', {}, [], true]) {
      expect(normalizeDrillSize(bad)).toBe(10)
    }
  })

  it('lets the URL win over the saved choice, and the saved choice over the default', () => {
    expect(resolveDrillSize('5', '20')).toBe(5)
    expect(resolveDrillSize(undefined, '20')).toBe(20)
    expect(resolveDrillSize(undefined, undefined)).toBe(10)
    expect(resolveDrillSize('99', '20')).toBe(10) // a bad ?limit= doesn't fall through to the cookie
  })
})

describe('drillSizeOptions (the selector against the tree)', () => {
  const view = (available: number) => drillSizeOptions(available).map((o) => `${o.size}:${o.enabled ? (o.short ? 'short' : 'on') : 'off'}`)

  it('offers every size on a big tree', () => {
    expect(view(30)).toEqual(['5:on', '10:on', '20:on'])
    expect(view(20)).toEqual(['5:on', '10:on', '20:on'])
  })

  it('with 4 questions only 5 is offered, badged as short', () => {
    expect(view(4)).toEqual(['5:short', '10:off', '20:off'])
  })

  it('with 7 questions, 10 is the last useful size (it asks all 7)', () => {
    expect(view(7)).toEqual(['5:on', '10:short', '20:off'])
    expect(view(10)).toEqual(['5:on', '10:on', '20:off'])
    expect(view(12)).toEqual(['5:on', '10:on', '20:short'])
  })

  it('offers nothing when there is nothing to ask', () => {
    expect(view(0)).toEqual(['5:off', '10:off', '20:off'])
  })

  it('falls back to the largest offered size when the saved one is disabled', () => {
    expect(effectiveDrillSize(20, 4)).toBe(5)
    expect(effectiveDrillSize(20, 7)).toBe(10)
    expect(effectiveDrillSize(5, 7)).toBe(5)
    expect(effectiveDrillSize(10, 0)).toBe(10)
  })
})

describe('round URLs', () => {
  it('carry ?limit= next to the other parameters', () => {
    expect(drillHref('bao-quan', { limit: 5 })).toBe('/deck/bao-quan/drill?limit=5')
    expect(drillHref('bao-quan', { rootId: 'n1', review: true, limit: 20 })).toBe('/deck/bao-quan/drill?rootId=n1&review=1&limit=20')
    expect(drillHref('bao-quan')).toBe('/deck/bao-quan/drill')
    expect(tournamentHref('bao-quan', { limit: 10 })).toBe('/deck/bao-quan/tournament?limit=10')
  })

  it('withDrillSize sets (or replaces) the size and keeps the rest', () => {
    expect(withDrillSize('/deck/x/drill?review=1', 5)).toBe('/deck/x/drill?review=1&limit=5')
    expect(withDrillSize('/deck/x/tournament?limit=20#top', 10)).toBe('/deck/x/tournament?limit=10#top')
  })

  it('the DTOs parse ?limit= strings and default a missing or bad one to 10', () => {
    expect(GetDrillSessionDto.parse({ slug: 'x', limit: '5' }).limit).toBe(5)
    expect(GetDrillSessionDto.parse({ slug: 'x' }).limit).toBe(10)
    expect(GetTournamentSessionDto.parse({ slug: 'x', limit: '20' }).limit).toBe(20)
    expect(GetTournamentSessionDto.parse({ slug: 'x', limit: 'lots' }).limit).toBe(10)
  })
})

describe('orderByMastery', () => {
  it('puts the lowest mastery first and keeps the given order within a level', () => {
    const queue = ['a', 'b', 'c', 'd', 'e'].map((itemId) => ({ itemId }))
    const levels = new Map([
      ['a', 3],
      ['b', 1],
      ['d', 1],
      ['e', 4],
    ])
    expect(orderByMastery(queue, levels).map((q) => q.itemId)).toEqual(['c', 'b', 'd', 'a', 'e'])
  })
})

// ─── Session builder: slicing to the chosen size ─────────────────────────────────────────────

const HOST = 'host'
const LINH = 'linh'

// n drillable statements, one per root (each flips tăng ↔ giảm).
function tree(n: number) {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `i${i}`,
    nodeId: `n${i}`,
    nodeTitle: `Gốc ${i}`,
    prompt: `Gốc ${i}`,
    correctStmt: `Chỉ số ${i} tăng khi trời nóng.`,
    trapRules: { negate: true },
    siblingStatements: [],
    path: [`Gốc ${i}`],
    ancestry: [`n${i}`],
  }))
  vi.mocked(listDrillItems).mockResolvedValue({
    success: true,
    data: {
      deck: { id: 'd1', slug: 'chi-so', title: 'Chỉ số', treeType: 'oak', ownerId: HOST, isPublic: true, isTournamentOpen: true },
      nodes: items.map((i) => ({ id: i.nodeId, parentId: null, title: i.nodeTitle })),
      items,
    },
  })
}

const round = (limit: DrillSize) => ({ slug: 'chi-so', limit, includeMastered: false })

beforeEach(() => vi.clearAllMocks())

describe('buildDrillSession round size', () => {
  it.each([5, 10, 20] as const)('asks exactly %i questions when the tree has enough', async (limit) => {
    tree(25)
    const res = await buildDrillSession({} as never, round(limit), 'sess', { viewerId: HOST })
    expect(res.success && res.data.questions).toHaveLength(limit)
    expect(res.success && new Set(res.data.questions.map((q) => q.itemId)).size).toBe(limit)
  })

  it('returns every available question, without an error, when the pool is smaller than the size', async () => {
    tree(4)
    const res = await buildDrillSession({} as never, round(20), 'sess', { viewerId: HOST })
    expect(res).toMatchObject({ success: true })
    expect(res.success && res.data.questions.map((q) => q.itemId).sort()).toEqual(['i0', 'i1', 'i2', 'i3'])
  })

  it('defaults to 10 questions when the page passes no (or a bad) size', async () => {
    tree(25)
    const input = GetDrillSessionDto.parse({ slug: 'chi-so', limit: 'nope' })
    const res = await buildDrillSession({} as never, input, 'sess', { viewerId: HOST })
    expect(res.success && res.data.questions).toHaveLength(10)
  })

  it('a short round takes the least-mastered statements first; resting 5/5 ones stay out', async () => {
    tree(8)
    const levels = new Map([
      ['i0', 5],
      ['i1', 4],
      ['i2', 4],
      ['i3', 3],
      ['i4', 0],
      ['i5', 1],
      ['i6', 2],
      ['i7', 4],
    ])
    const res = await buildDrillSession({} as never, round(5), 'sess', { viewerId: HOST, loadLevels: async () => levels })
    expect(res.success && res.data.questions.map((q) => q.itemId)).toEqual(['i4', 'i5', 'i6', 'i3', expect.stringMatching(/^i[127]$/)])
    expect(res.success && res.data.masteredCount).toBe(1)
  })

  it('tournament rounds respect the size too, from the contestant\'s tournament levels only', async () => {
    tree(25)
    const loadLevels = vi.fn(async () => new Map([['i0', 5]]))
    const res = await buildDrillSession({} as never, round(5), 'sess', { viewerId: LINH, mode: 'tournament', loadLevels })
    expect(res).toMatchObject({ success: true, data: { mode: 'tournament', includeMastered: false } })
    expect(res.success && res.data.questions).toHaveLength(5)
    expect(res.success && res.data.questions.map((q) => q.itemId)).not.toContain('i0')
    // Answers are still graded on the server: questions carry choices + seed (and how to show
    // them: kind, breadcrumb, prompt, instruction), never the answer.
    expect(res.success && Object.keys(res.data.questions[0]).sort()).toEqual(['choices', 'context', 'instruction', 'itemId', 'kind', 'nodeTitle', 'prompt', 'seed'])
  })

  it('the same session id gives the same round (seeded), whatever the size', async () => {
    tree(25)
    const a = await buildDrillSession({} as never, round(10), 'same', { viewerId: HOST })
    const b = await buildDrillSession({} as never, round(10), 'same', { viewerId: HOST })
    expect(a.success && a.data.questions.map((q) => q.itemId)).toEqual(b.success && b.data.questions.map((q) => q.itemId))
  })
})
