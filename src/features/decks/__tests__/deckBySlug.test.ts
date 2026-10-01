import { describe, expect, it } from 'vitest'
import { findDeckBySlug } from '../services/decks'

// The deck page's first query: deck + roots + statements in ONE round trip (embedded select), so
// opening a tree doesn't wait on a second query for its nodes.

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
  mindmap_nodes: [
    { id: 'r2', parent_id: 'r1', title: 'Ty thể', sort_order: 0, knowledge_items: [] },
    {
      id: 'r1',
      parent_id: null,
      title: 'Tế bào',
      sort_order: 0,
      knowledge_items: [
        { id: 'i2', prompt: 'Tế bào', created_at: '2026-10-01T00:00:02Z' },
        { id: 'i1', prompt: 'Tế bào', created_at: '2026-10-01T00:00:01Z' },
      ],
    },
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
    expect(selects[0]).toContain('mindmap_nodes(')
    expect(selects[0]).toContain('knowledge_items(id, prompt, created_at)')
    // Answers never come back from this query.
    expect(selects[0]).not.toMatch(/correct_stmt|trap_rules/)
    expect(res.success && res.data.deck).toMatchObject({ id: 'deck-1', title: 'Sinh học', userId: 'me' })
    expect(res.success && res.data.deck).not.toHaveProperty('mindmap_nodes')
  })

  it('nests the roots and orders statements by creation', async () => {
    const { client } = fakeSupabase(ROW)
    const res = await findDeckBySlug(client as never, { slug: 'sinh-hoc' })
    if (!res.success) throw new Error('expected a deck')
    expect(res.data.tree.map((n) => n.id)).toEqual(['r1'])
    expect(res.data.tree[0].children.map((n) => n.id)).toEqual(['r2'])
    expect(res.data.tree[0].items.map((i) => i.id)).toEqual(['i1', 'i2'])
  })

  it('answers DECK_NOT_FOUND for an unknown or unreadable slug', async () => {
    const { client } = fakeSupabase(null)
    expect(await findDeckBySlug(client as never, { slug: 'nope' })).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
  })
})
