import { describe, expect, it } from 'vitest'
import { formatVisitedAgo, groupVisitedGardens, neighborName, visitHref, type VisitedTreeView } from '../lib/neighbors'

const ME = 'me-0000'
const visit = (deckId: string, ownerId: string, visitedAt: string, statementCount: number | null = 3): VisitedTreeView => ({
  deckId,
  ownerId,
  slug: deckId,
  title: deckId.toUpperCase(),
  treeType: 'oak',
  statementCount,
  visitedAt,
})

describe('groupVisitedGardens', () => {
  const visits = [
    visit('b1', 'binh', '2026-09-20T08:00:00Z'),
    visit('c1', 'chi', '2026-09-25T08:00:00Z'),
    visit('b2', 'binh', '2026-09-28T08:00:00Z', 12),
    visit('mine', ME, '2026-09-29T08:00:00Z'),
  ]

  it('groups visited trees by gardener, the most recently visited garden first', () => {
    const gardens = groupVisitedGardens(visits, ME)
    expect(gardens.map((g) => g.ownerId)).toEqual(['binh', 'chi']) // binh's newest visit (28th) beats chi's (25th)
    expect(gardens[0].lastVisitedAt).toBe('2026-09-28T08:00:00Z')
    expect(gardens[0].name).toBe(neighborName('binh'))
  })

  it('sorts the trees inside a garden by newest visit and keeps their statement counts', () => {
    const [binh] = groupVisitedGardens(visits, ME)
    expect(binh.trees.map((t) => [t.slug, t.statementCount])).toEqual([
      ['b2', 12],
      ['b1', 3],
    ])
  })

  it('never lists my own trees, even if one slipped into the visits', () => {
    const gardens = groupVisitedGardens(visits, ME)
    expect(gardens.map((g) => g.ownerId)).not.toContain(ME)
    expect(gardens.flatMap((g) => g.trees.map((t) => t.deckId))).not.toContain('mine')
  })

  it('keeps only the newest visit of a tree listed twice', () => {
    const gardens = groupVisitedGardens([visit('b1', 'binh', '2026-09-01T00:00:00Z'), visit('b1', 'binh', '2026-09-10T00:00:00Z')], ME)
    expect(gardens[0].trees).toHaveLength(1)
    expect(gardens[0].trees[0].visitedAt).toBe('2026-09-10T00:00:00Z')
  })

  it('is empty without visits', () => {
    expect(groupVisitedGardens([], ME)).toEqual([])
    expect(groupVisitedGardens([visit('mine', ME, '2026-09-29T08:00:00Z')], ME)).toEqual([])
  })
})

describe('formatVisitedAgo', () => {
  const now = Date.parse('2026-09-29T12:00:00Z')

  it('says how long ago in short words', () => {
    expect(formatVisitedAgo('2026-09-29T11:59:30Z', now)).toBe('just now')
    expect(formatVisitedAgo('2026-09-29T11:55:00Z', now)).toBe('5 min ago')
    expect(formatVisitedAgo('2026-09-29T09:00:00Z', now)).toBe('3 h ago')
    expect(formatVisitedAgo('2026-09-28T10:00:00Z', now)).toBe('yesterday')
    expect(formatVisitedAgo('2026-09-25T12:00:00Z', now)).toBe('4 days ago')
  })

  it('shows the date for visits older than a week', () => {
    expect(formatVisitedAgo('2026-09-12T12:00:00Z', now)).toBe('12 Sep 2026')
  })

  it('treats a clock skewed into the future as just now, and a bad date as empty', () => {
    expect(formatVisitedAgo('2026-09-29T12:05:00Z', now)).toBe('just now')
    expect(formatVisitedAgo('not a date', now)).toBe('')
  })
})

describe('neighborName', () => {
  it('is a stable, friendly name that reveals nothing personal', () => {
    const id = '22222222-2222-4222-8222-222222222222'
    expect(neighborName(id)).toBe(neighborName(id))
    expect(neighborName(id)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    expect(neighborName(id)).not.toContain('2222')
  })

  it('usually differs between gardeners', () => {
    const names = new Set(Array.from({ length: 30 }, (_, i) => neighborName(`gardener-${i}`)))
    expect(names.size).toBeGreaterThan(15)
  })
})

describe('visitHref', () => {
  it('links to the farm in visitor mode', () => {
    expect(visitHref('abc')).toBe('/?visit=abc')
  })
})
