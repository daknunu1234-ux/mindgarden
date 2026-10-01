import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrillSourceItem } from '@/features/decks/server'

// The session shows a question; grading rebuilds it on the server from the item's seed. Both must see
// the same context (the WHOLE deck, even for a one-branch round), or a right answer would be graded
// wrong. These tests build real rounds and grade every question through the real grading service.

const OWNER = 'owner-1'
// Sinh học (n-bio) ─┬─ Bào quan (n-org)
//                   └─ Phân tử  (n-mol)
const ANCESTRY: Record<string, string[]> = { 'n-bio': ['n-bio'], 'n-org': ['n-bio', 'n-org'], 'n-mol': ['n-bio', 'n-mol'] }
const item = (id: string, nodeId: string, path: string[], correctStmt: string): DrillSourceItem => ({
  id,
  nodeId,
  nodeTitle: path[path.length - 1],
  prompt: path[path.length - 1],
  correctStmt,
  trapRules: { negate: true },
  siblingStatements: [],
  path,
  ancestry: ANCESTRY[nodeId],
})

const ITEMS: DrillSourceItem[] = [
  item('i1', 'n-org', ['Sinh học', 'Bào quan'], 'Ty thể: nhà máy năng lượng'),
  item('i2', 'n-org', ['Sinh học', 'Bào quan'], 'Ribosome: tổng hợp protein'),
  item('i3', 'n-org', ['Sinh học', 'Bào quan'], 'là nơi diễn ra hô hấp tế bào'),
  item('i4', 'n-mol', ['Sinh học', 'Phân tử'], 'ATP'),
  item('i5', 'n-mol', ['Sinh học', 'Phân tử'], 'Glucose'),
  item('i6', 'n-bio', ['Sinh học'], 'Tế bào được phát hiện năm 1665'),
]

vi.mock('@/features/decks/server', () => ({
  listDrillItems: vi.fn(async () => ({
    success: true,
    data: {
      deck: { id: 'd1', slug: 'sinh-hoc', title: 'Sinh học', treeType: 'oak', ownerId: OWNER, isPublic: false, isTournamentOpen: false },
      nodes: [
        { id: 'n-bio', parentId: null, title: 'Sinh học' },
        { id: 'n-org', parentId: 'n-bio', title: 'Bào quan' },
        { id: 'n-mol', parentId: 'n-bio', title: 'Phân tử' },
      ],
      items: ITEMS,
    },
  })),
  findDrillItem: vi.fn(async (_supabase: unknown, itemId: string) => {
    const own = ITEMS.find((i) => i.id === itemId)!
    return {
      success: true,
      data: { id: own.id, correctStmt: own.correctStmt, trapRules: own.trapRules, siblingStatements: own.siblingStatements, ownerId: OWNER, deckItems: ITEMS },
    }
  }),
}))

import { gradeSubmission } from '@/features/progress/server'
import { buildDrillSession } from '../services/drillSession'

beforeEach(() => vi.clearAllMocks())

async function gradeAll(nodeId?: string) {
  const res = await buildDrillSession({} as never, { slug: 'sinh-hoc', nodeId, limit: 20, includeMastered: true }, 'sess-1', { viewerId: OWNER })
  if (!res.success) throw new Error(res.error.message)
  const results = []
  for (const q of res.data.questions) {
    // Exactly one choice grades as correct: the one the server says.
    const verdicts = await Promise.all(q.choices.map((c) => gradeSubmission({} as never, { itemId: q.itemId, seed: q.seed, tag: c.tag }, OWNER)))
    const correct = verdicts.filter((v) => v.success && v.data.isCorrect)
    results.push({ q, correct: correct.length, expected: verdicts[0].success ? verdicts[0].data.correctTag : null })
  }
  return { session: res.data, results }
}

describe('session ↔ grading consistency', () => {
  it('every question of a whole-tree round has exactly one right answer when graded', async () => {
    const { session, results } = await gradeAll()
    expect(session.questions).toHaveLength(ITEMS.length)
    expect(session.skippedCount).toBe(0)
    for (const r of results) {
      expect(r.correct, `${r.q.itemId} ${r.q.kind}`).toBe(1)
      expect(r.q.choices.map((c) => c.tag)).toContain(r.expected)
    }
  })

  it('a one-branch round is graded against the same whole-deck context', async () => {
    const { session, results } = await gradeAll('n-org')
    expect(session.questions.map((q) => q.itemId).sort()).toEqual(['i1', 'i2', 'i3'])
    for (const r of results) expect(r.correct, `${r.q.itemId} ${r.q.kind}`).toBe(1)
  })

  it('shows the breadcrumb and, for a predicate-only note, the inherited subject', async () => {
    const { session } = await gradeAll()
    const q3 = session.questions.find((q) => q.itemId === 'i3')!
    expect(q3.context).toEqual(['Sinh học', 'Bào quan'])
    if (q3.kind === 'statement') expect(q3.choices.some((c) => c.text.startsWith('Bào quan là nơi'))).toBe(true)
  })
})
