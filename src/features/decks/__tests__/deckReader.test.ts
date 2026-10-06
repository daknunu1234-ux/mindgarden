import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/answers', () => ({ readTrapRules: vi.fn() }))

import { fakeContentDb } from '@/test/fakeContentDb'
import { readTrapRules } from '../services/answers'
import { loadDeckReader } from '../services/content'

const OWNER = 'owner-1'

// One tree: root "Tế bào" with one statement. Public or private; the viewer varies.
function client(viewer: string | null, deck: { is_public: boolean; tree_type?: string } | null) {
  return fakeContentDb({
    viewer,
    decks: deck ? [{ id: 'd1', user_id: OWNER, ...deck }] : [],
    nodes: [
      { id: 'n1', deck_id: 'd1', parent_id: null, node_type: 'root', content: 'Tế bào', sort_order: 1 },
      { id: 'i1', deck_id: 'd1', parent_id: 'n1', node_type: 'statement', content: 'Ty thể là bào quan sản sinh ATP.', sort_order: 1 },
    ],
  }).client as never
}

describe('loadDeckReader (visitors read a shared tree)', () => {
  it('lets anyone, even signed out, read the statements of a public tree (never the trap rules)', async () => {
    const res = await loadDeckReader(client(null, { is_public: true, tree_type: 'oak' }), null, 'd1')
    expect(res).toMatchObject({
      success: true,
      data: { treeType: 'oak', nodes: [{ id: 'n1', title: 'Tế bào', items: [{ id: 'i1', statement: 'Ty thể là bào quan sản sinh ATP.' }] }] },
    })
    expect(res.success && res.data.rows.map((r) => [r.id, r.type, r.depth])).toEqual([
      ['n1', 'root', 0],
      ['i1', 'statement', 1],
    ])
    expect(readTrapRules).not.toHaveBeenCalled()
  })

  it('never reads someone else’s private tree', async () => {
    expect(await loadDeckReader(client('visitor-2', { is_public: false }), 'visitor-2', 'd1')).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
  })

  it('refuses an invisible tree (RLS returned no row)', async () => {
    expect(await loadDeckReader(client('visitor-2', null), 'visitor-2', 'd1')).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
  })

  it('lets the owner read their own private tree', async () => {
    const res = await loadDeckReader(client(OWNER, { is_public: false, tree_type: 'sakura' }), OWNER, 'd1')
    expect(res.success).toBe(true)
  })
})
