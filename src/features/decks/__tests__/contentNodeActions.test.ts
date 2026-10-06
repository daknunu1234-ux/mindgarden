import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/shared/lib/supabase/server'
import { createContentNode, indentContentNode, toggleNodeType } from '../actions/contentNodes'
import { moveKnowledgeItem } from '../actions/moveKnowledgeItem'
import { fakeContentDb } from '@/test/fakeContentDb'

// The Workshop's outline actions on content_nodes (fake client with RLS and the shape rules): Enter
// (a sibling of the same type, right below), Alt (one UPDATE of node_type), Tab / Shift+Tab (the
// RPC), 📂 Move. Every one checks the owner and touches only the row it names.

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const OTHER_DECK = '44444444-4444-4444-8444-444444444444'
const ROOT = '55555555-5555-4555-8555-555555555555'
const S1 = '66666666-6666-4666-8666-666666666661'
const S2 = '66666666-6666-4666-8666-666666666662'
const SUB = '77777777-7777-4777-8777-777777777777'
const ELSEWHERE = '88888888-8888-4888-8888-888888888888'

function fakeSupabase(viewer: string | null, rpc = vi.fn(async () => ({ data: [{ node_id: S2, parent_id: S1, moved_children: 0 }], error: null }))) {
  const fake = fakeContentDb({
    viewer,
    decks: [
      { id: DECK, user_id: OWNER, slug: 'sinh-hoc', is_public: true },
      { id: OTHER_DECK, user_id: OWNER, slug: 'khac', is_public: true },
    ],
    nodes: [
      { id: ROOT, deck_id: DECK, parent_id: null, node_type: 'root', content: 'Bào quan', sort_order: 1 },
      { id: S1, deck_id: DECK, parent_id: ROOT, node_type: 'statement', content: 'Ty thể sản sinh ATP.', sort_order: 1 },
      { id: S2, deck_id: DECK, parent_id: ROOT, node_type: 'statement', content: 'Ribosome tổng hợp protein.', sort_order: 2 },
      { id: SUB, deck_id: DECK, parent_id: ROOT, node_type: 'root', content: 'Màng', sort_order: 3 },
      { id: ELSEWHERE, deck_id: OTHER_DECK, parent_id: null, node_type: 'root', content: 'Khác', sort_order: 1 },
    ],
    progress: [{ user_id: OWNER, knowledge_item_id: S1, mastery_level: 3 }],
    rpc,
  })
  vi.mocked(createClient).mockResolvedValue(fake.client as never)
  return { ...fake, rpc, count: () => fake.db.content_nodes.length }
}

beforeEach(() => vi.clearAllMocks())

describe('createContentNode (Enter)', () => {
  it('puts the new sibling right after the row (midpoint sort_order), with its type', async () => {
    const fake = fakeSupabase(OWNER)
    const res = await createContentNode({ deckId: DECK, parentId: ROOT, type: 'statement', content: 'Lục lạp quang hợp.', afterId: S1 })
    expect(res).toMatchObject({ success: true, data: { drillable: true } })
    const added = fake.node(res.success ? res.data.id : '')!
    expect(added).toMatchObject({ parent_id: ROOT, node_type: 'statement', sort_order: 1.5, trap_rules: { negate: true } })
    const root = await createContentNode({ deckId: DECK, parentId: ROOT, type: 'root', content: 'Nhân' })
    expect(fake.node(root.success ? root.data.id : '')).toMatchObject({ node_type: 'root', sort_order: 4, trap_rules: {} })
    // A top-level line is a root.
    const top = await createContentNode({ deckId: DECK, parentId: null, type: 'root', content: 'Năng lượng' })
    expect(fake.node(top.success ? top.data.id : '')).toMatchObject({ parent_id: null, sort_order: 2 })
  })

  it('refuses a top-level statement, a parent in another tree, visitors and signed-out players', async () => {
    const fake = fakeSupabase(OWNER)
    const before = fake.count()
    expect(await createContentNode({ deckId: DECK, parentId: null, type: 'statement', content: 'Lạc lõng ở ngoài.' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(await createContentNode({ deckId: DECK, parentId: ELSEWHERE, type: 'statement', content: 'Sai cây rồi.' })).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
    fakeSupabase(VISITOR)
    expect(await createContentNode({ deckId: DECK, parentId: ROOT, type: 'statement', content: 'Khách viết.' })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    fakeSupabase(null)
    expect(await createContentNode({ deckId: DECK, parentId: ROOT, type: 'statement', content: 'Chưa đăng nhập.' })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(fake.count()).toBe(before)
  })
})

describe('toggleNodeType (Alt)', () => {
  it('flips node_type in place: one UPDATE, no insert or delete, progress kept', async () => {
    const fake = fakeSupabase(OWNER)
    expect(await toggleNodeType({ deckId: DECK, nodeId: S1 })).toEqual({ success: true, data: { id: S1, type: 'root', drillable: false } })
    expect(fake.node(S1)).toMatchObject({ node_type: 'root', parent_id: ROOT, sort_order: 1 })
    expect(await toggleNodeType({ deckId: DECK, nodeId: S1 })).toMatchObject({ success: true, data: { type: 'statement', drillable: true } })
    expect(fake.writes.map((w) => w.op)).toEqual(['update', 'update'])
    expect(fake.db.user_progress).toHaveLength(1)
  })

  it('a top-level root stays a root; only the owner may toggle', async () => {
    const fake = fakeSupabase(OWNER)
    expect(await toggleNodeType({ deckId: DECK, nodeId: ROOT })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    fakeSupabase(VISITOR)
    expect(await toggleNodeType({ deckId: DECK, nodeId: S1 })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(fake.writes).toEqual([])
  })
})

describe('indentContentNode (Tab / Shift+Tab)', () => {
  it('sends only the node and the direction to indent_content_node', async () => {
    const fake = fakeSupabase(OWNER)
    expect(await indentContentNode({ deckId: DECK, nodeId: S2, direction: 'in' })).toEqual({ success: true, data: { id: S2, parentId: S1, movedChildren: 0 } })
    expect(fake.rpc).toHaveBeenCalledWith('indent_content_node', { p_node_id: S2, p_direction: 'in' })
    expect(fake.writes).toEqual([])
  })

  it('turns the database refusals into messages', async () => {
    for (const [raised, message] of [
      ['NO_ROW_ABOVE', /Nothing above/],
      ['ALREADY_TOP', /top-level root/],
    ] as const) {
      fakeSupabase(OWNER, vi.fn(async () => ({ data: null, error: { code: 'P0001', message: raised } })) as never)
      expect(await indentContentNode({ deckId: DECK, nodeId: S1, direction: 'in' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED', message: expect.stringMatching(message) } })
    }
  })

  it('validates the direction, and refuses visitors before calling the database', async () => {
    const fake = fakeSupabase(VISITOR)
    expect(await indentContentNode({ deckId: DECK, nodeId: S2, direction: 'sideways' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(await indentContentNode({ deckId: DECK, nodeId: S2, direction: 'in' })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(fake.rpc).not.toHaveBeenCalled()
  })
})

describe('moveKnowledgeItem (📂 Move)', () => {
  it('moves a statement under another root of the tree, last, progress kept', async () => {
    const fake = fakeSupabase(OWNER)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1, toNodeId: SUB })).toMatchObject({ success: true, data: { id: S1, nodeId: SUB } })
    expect(fake.node(S1)).toMatchObject({ parent_id: SUB, sort_order: 1 })
    expect(fake.db.user_progress).toHaveLength(1)
  })

  it('refuses a target in another tree, or a statement as target', async () => {
    const fake = fakeSupabase(OWNER)
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1, toNodeId: ELSEWHERE })).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
    expect(await moveKnowledgeItem({ deckId: DECK, itemId: S1, toNodeId: S2 })).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
    expect(fake.node(S1)).toMatchObject({ parent_id: ROOT })
  })
})
