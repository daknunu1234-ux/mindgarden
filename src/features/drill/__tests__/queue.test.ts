import { describe, expect, it, vi } from 'vitest'
import { drillHref, isReviewParam } from '../lib/drillHref'
import { emptyRoundReason, selectPracticeItems } from '../lib/queue'

// ── Pure queue rule ──────────────────────────────────────────────────────────

const q = (itemId: string) => ({ itemId })
const CANDIDATES = [q('seed'), q('sapling'), q('old-top'), q('mastered'), q('never')]
const LEVELS = new Map([
  ['seed', 0],
  ['sapling', 3],
  ['old-top', 3], // a former 3/3 item: 3/5 now, still practised
  ['mastered', 5],
])

describe('selectPracticeItems', () => {
  it('leaves 5/5 items out of a normal round', () => {
    const { queue, masteredCount } = selectPracticeItems(CANDIDATES, LEVELS, false)
    expect(queue.map((c) => c.itemId)).toEqual(['seed', 'sapling', 'old-top', 'never'])
    expect(masteredCount).toBe(1)
  })

  it('mixes 5/5 items back in with includeMastered = true', () => {
    const { queue, masteredCount } = selectPracticeItems(CANDIDATES, LEVELS, true)
    expect(queue.map((c) => c.itemId)).toEqual(['seed', 'sapling', 'old-top', 'mastered', 'never'])
    expect(masteredCount).toBe(1)
  })

  it('excludes nothing without progress (signed out)', () => {
    expect(selectPracticeItems(CANDIDATES, new Map(), false).queue).toHaveLength(5)
  })
})

describe('emptyRoundReason', () => {
  it('tells "nothing drillable" apart from "fully cultivated"', () => {
    expect(emptyRoundReason(0, 0)).toBe('no-items')
    expect(emptyRoundReason(3, 0)).toBe('all-mastered')
    expect(emptyRoundReason(3, 2)).toBeNull()
  })
})

describe('drillHref / isReviewParam', () => {
  it('builds round URLs with optional branch and review mode', () => {
    expect(drillHref('bio')).toBe('/deck/bio/drill')
    expect(drillHref('bio', { review: true })).toBe('/deck/bio/drill?review=1')
    expect(drillHref('bio', { nodeId: 'n1', review: true })).toBe('/deck/bio/drill?nodeId=n1&review=1')
  })

  it('reads ?review= strictly', () => {
    expect(isReviewParam('1')).toBe(true)
    expect(isReviewParam('true')).toBe(true)
    expect(isReviewParam('0')).toBe(false)
    expect(isReviewParam(undefined)).toBe(false)
    expect(isReviewParam(['1'])).toBe(false)
  })
})

// ── buildDrillSession with a stubbed deck ────────────────────────────────────

// Three drillable statements in one root (the dictionary flips tăng/giảm, là, …).
const ITEMS = [
  { id: 'i-seed', stmt: 'Khi nhiệt độ tăng, áp suất khí lớn hơn.' },
  { id: 'i-mastered', stmt: 'Ty thể là bào quan sản sinh ATP.' },
  { id: 'i-half', stmt: 'Khi áp suất giảm, thể tích khí tăng.' },
].map(({ id, stmt }, _, all) => ({
  id,
  nodeId: 'n1',
  nodeTitle: 'Khí',
  prompt: 'Khí',
  correctStmt: stmt,
  trapRules: { negate: true },
  siblingStatements: all.filter((o) => o.id !== id).map((o) => o.stmt),
}))

const OWNER = 'owner-1'

vi.mock('@/features/decks/server', () => ({
  listDrillItems: vi.fn(async () => ({
    success: true,
    data: {
      deck: { id: 'd1', slug: 'bio', title: 'Bio', treeType: 'oak', ownerId: OWNER },
      nodes: [{ id: 'n1', parentId: null, title: 'Khí' }],
      items: ITEMS,
    },
  })),
}))

import { buildDrillSession } from '../services/drillSession'

const input = (includeMastered: boolean) => ({ slug: 'bio', limit: 20, includeMastered })
const levels = (map: Record<string, number>) => async () => new Map(Object.entries(map))
const asOwner = (map: Record<string, number>) => ({ viewerId: OWNER, loadLevels: levels(map) })

describe('buildDrillSession queue', () => {
  it('rests the mastered item by default', async () => {
    const res = await buildDrillSession({} as never, input(false), 'sess', asOwner({ 'i-mastered': 5, 'i-half': 3 }))
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.questions.map((x) => x.itemId).sort()).toEqual(['i-half', 'i-seed'])
    expect(res.data).toMatchObject({ masteredCount: 1, includeMastered: false })
  })

  it('includes it in review mode', async () => {
    const res = await buildDrillSession({} as never, input(true), 'sess', asOwner({ 'i-mastered': 5 }))
    expect(res.success && res.data.questions.map((x) => x.itemId).sort()).toEqual(['i-half', 'i-mastered', 'i-seed'])
  })

  it('reports a fully cultivated deck instead of an empty round', async () => {
    const all = asOwner({ 'i-seed': 5, 'i-mastered': 5, 'i-half': 5 })
    const res = await buildDrillSession({} as never, input(false), 'sess', all)
    expect(res).toMatchObject({ success: false, error: { code: 'DRILL_ALL_MASTERED' } })
    const review = await buildDrillSession({} as never, input(true), 'sess', all)
    expect(review.success && review.data.questions).toHaveLength(3)
  })
})

describe('buildDrillSession visitor guard', () => {
  it('refuses a visitor (non-owner) with FORBIDDEN_VISITOR_PRACTICE', async () => {
    const loadLevels = vi.fn(levels({}))
    const res = await buildDrillSession({} as never, input(false), 'sess', { viewerId: 'visitor-2', loadLevels })
    expect(res).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN_VISITOR_PRACTICE', message: 'You must clone this tree to your garden to practice it!' },
    })
    expect(loadLevels).not.toHaveBeenCalled()
  })

  it('refuses a signed-out visitor too, even in review mode', async () => {
    const res = await buildDrillSession({} as never, input(true), 'sess', { viewerId: null })
    expect(res).toMatchObject({ success: false, error: { code: 'FORBIDDEN_VISITOR_PRACTICE' } })
  })

  it('a freshly cloned tree (cloner owns it, no progress rows) practises every statement from 0/5', async () => {
    // clone_deck copies nodes + items but never user_progress, so the cloner starts with no levels.
    const res = await buildDrillSession({} as never, input(false), 'sess', asOwner({}))
    expect(res.success && res.data).toMatchObject({ masteredCount: 0 })
    expect(res.success && res.data.questions).toHaveLength(3)
  })
})
