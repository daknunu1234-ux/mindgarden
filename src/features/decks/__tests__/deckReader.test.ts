import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/answers', () => ({
  readAnswersForNodes: vi.fn(async () => ({
    success: true,
    data: [{ itemId: 'i1', nodeId: 'n1', correctStmt: 'Ty thể là bào quan sản sinh ATP.', trapRules: {} }],
  })),
  answersByNode: (answers: { nodeId: string }[]) => {
    const map = new Map<string, typeof answers>()
    for (const a of answers) map.set(a.nodeId, [...(map.get(a.nodeId) ?? []), a])
    return map
  },
}))

import { readAnswersForNodes } from '../services/answers'
import { loadDeckReader } from '../services/authoring'

const OWNER = 'owner-1'

// Minimal user client: one deck row (RLS already applied by the caller's test) and its nodes.
function client(deck: { user_id: string; is_public: boolean; tree_type: string } | null) {
  return {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => (table === 'mindmap_nodes' ? Promise.resolve({ data: [{ id: 'n1', parent_id: null, title: 'Tế bào', sort_order: 0 }], error: null }) : q),
        maybeSingle: async () => ({ data: deck, error: null }),
      }
      return q
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadDeckReader (visitors read a shared tree)', () => {
  it('lets anyone, even signed out, read the statements of a public tree', async () => {
    const res = await loadDeckReader(client({ user_id: OWNER, is_public: true, tree_type: 'oak' }), null, 'd1')
    expect(res).toMatchObject({
      success: true,
      data: { treeType: 'oak', nodes: [{ id: 'n1', title: 'Tế bào', items: [{ id: 'i1', statement: 'Ty thể là bào quan sản sinh ATP.' }] }] },
    })
  })

  it('never reads the answers of someone else’s private tree', async () => {
    const res = await loadDeckReader(client({ user_id: OWNER, is_public: false, tree_type: 'oak' }), 'visitor-2', 'd1')
    expect(res).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
    expect(readAnswersForNodes).not.toHaveBeenCalled()
  })

  it('refuses an invisible tree (RLS returned no row)', async () => {
    expect(await loadDeckReader(client(null), 'visitor-2', 'd1')).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
    expect(readAnswersForNodes).not.toHaveBeenCalled()
  })

  it('lets the owner read their own private tree', async () => {
    const res = await loadDeckReader(client({ user_id: OWNER, is_public: false, tree_type: 'sakura' }), OWNER, 'd1')
    expect(res.success).toBe(true)
  })
})
