import { describe, expect, it } from 'vitest'
import { findDeckBySlug } from '../services/decks'

// The deck page's first query: the deck and its whole outline (content_nodes) in ONE round trip
// (embedded select), so opening a tree doesn't wait on a second query for its nodes.

const ROW = {
  id: 'deck-1',
  user_id: 'me',
  title: 'Sinh học',
  slug: 'sinh-hoc',
  description: null,
  is_public: false,
  tree_type: 'oak',
  created_at: '2026-10-01T00:00:00Z',
  is_tournament_open: false,
  // Listed out of order on purpose: sort_order decides. r1: i1, i2 (statements), then r2 (a sub-root).
  content_nodes: [
    { id: 'r2', parent_id: 'r1', node_type: 'root', content: 'Ty thể', sort_order: 3, created_at: '2026-10-01T00:00:00Z' },
    { id: 'i2', parent_id: 'r1', node_type: 'statement', content: 'Màng bao tế bào.', sort_order: 2, created_at: '2026-10-01T00:00:02Z' },
    { id: 'r1', parent_id: null, node_type: 'root', content: 'Tế bào', sort_order: 1, created_at: '2026-10-01T00:00:00Z' },
    { id: 'i1', parent_id: 'r1', node_type: 'statement', content: 'Tế bào là đơn vị sống.', sort_order: 1, created_at: '2026-10-01T00:00:01Z' },
  ],
}

function fakeSupabase(row: unknown) {
  const tables: string[] = []
  const selects: string[] = []
  const query = {
    select: (columns: string) => {
      selects.push(columns)
      return query
    },
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return { client: { from: (table: string) => (tables.push(table), query) }, tables, selects }
}

describe('findDeckBySlug', () => {
  it('loads the deck, its roots and their statements in a single query', async () => {
    const { client, tables, selects } = fakeSupabase(ROW)
    const res = await findDeckBySlug(client as never, { slug: 'sinh-hoc' })
    expect(tables).toEqual(['decks'])
    expect(selects[0]).toContain('content_nodes(id, parent_id, node_type, content, sort_order, created_at)')
    // Trap rules never come back from this query.
    expect(selects[0]).not.toMatch(/trap_rules/)
    expect(res.success && res.data.deck).toMatchObject({ id: 'deck-1', title: 'Sinh học', userId: 'me' })
    expect(res.success && res.data.deck).not.toHaveProperty('content_nodes')
  })

  it('nests the roots and keeps each root’s statements in outline order', async () => {
    const { client } = fakeSupabase(ROW)
    const res = await findDeckBySlug(client as never, { slug: 'sinh-hoc' })
    if (!res.success) throw new Error('expected a deck')
    expect(res.data.tree.map((n) => n.id)).toEqual(['r1'])
    expect(res.data.tree[0].children.map((n) => n.id)).toEqual(['r2'])
    expect(res.data.tree[0].items).toEqual([
      { id: 'i1', prompt: 'Tế bào', parentId: null, depth: 0 },
      { id: 'i2', prompt: 'Tế bào', parentId: null, depth: 0 },
    ])
  })

  it('answers DECK_NOT_FOUND for an unknown or unreadable slug', async () => {
    const { client } = fakeSupabase(null)
    expect(await findDeckBySlug(client as never, { slug: 'nope' })).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
  })
})
