import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { fakeContentDb, type FakeNode } from '@/test/fakeContentDb'
import { deleteKnowledgeItem } from '../actions/deleteKnowledgeItem'
import { deleteRootBranch } from '../actions/deleteRootBranch'
import { branchImpact, branchNodeIds, flatBranchImpact } from '../lib/branch'

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const OTHER_DECK = '44444444-4444-4444-8444-444444444444'
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
// Tree: CELL (A) → ORGANELLE (B) → DEEP (D); GENES (C) on its own. OTHER is a root of another deck.
const A = id(1)
const B = id(2)
const C = id(3)
const D = id(4)
const OTHER = id(5)
// Statements: two on A, one each on B, D, C, and one in the other deck.
const [A1, A2, B1, D1, C1, O1] = [101, 102, 103, 104, 105, 106].map(id)

// ─── Pure helpers ──────────────────────────────────────────────────────────────────────────────

describe('branch helpers', () => {
  const flat = [
    { id: A, parentId: null, depth: 0, items: [1, 2] },
    { id: B, parentId: A, depth: 1, items: [1] },
    { id: D, parentId: B, depth: 2, items: [1, 2, 3] },
    { id: C, parentId: null, depth: 0, items: [1] },
  ]
  const nested = [
    { id: A, items: [1, 2], children: [{ id: B, items: [1], children: [{ id: D, items: [1, 2, 3], children: [] }] }] },
    { id: C, items: [1], children: [] },
  ]

  it('branchNodeIds: a root and all its sub-roots, nothing else', () => {
    expect([...branchNodeIds(flat, A)].sort()).toEqual([A, B, D].sort())
    expect([...branchNodeIds(flat, C)]).toEqual([C])
  })

  it('branchImpact / flatBranchImpact: statements and sub-roots a delete takes with it', () => {
    expect(branchImpact(nested, A)).toEqual({ statements: 6, subRoots: 2 })
    expect(branchImpact(nested, B)).toEqual({ statements: 4, subRoots: 1 })
    expect(branchImpact(nested, C)).toEqual({ statements: 1, subRoots: 0 })
    expect(flatBranchImpact(flat, A)).toEqual({ statements: 6, subRoots: 2 })
    expect(flatBranchImpact(flat, B)).toEqual({ statements: 4, subRoots: 1 })
    expect(flatBranchImpact(flat, C)).toEqual({ statements: 1, subRoots: 0 })
    expect(branchImpact(nested, 'missing')).toBeNull()
    expect(flatBranchImpact(flat, 'missing')).toBeNull()
  })
})

// ─── The outline in content_nodes: RLS (owner-only deletes) + ON DELETE CASCADE, like the database ──

// Root A with statements A1, A2 and sub-root B (statement B1) with sub-root D (statement D1); root C
// (statement C1). OTHER (O1) is a root of another tree.
const NODES: FakeNode[] = [
  { id: A, deck_id: DECK, parent_id: null, node_type: 'root', content: 'Tế bào', sort_order: 1 },
  { id: A1, deck_id: DECK, parent_id: A, node_type: 'statement', content: 'Tế bào là đơn vị sống.', sort_order: 1 },
  { id: A2, deck_id: DECK, parent_id: A, node_type: 'statement', content: 'Tế bào có màng.', sort_order: 2 },
  { id: B, deck_id: DECK, parent_id: A, node_type: 'root', content: 'Bào quan', sort_order: 3 },
  { id: B1, deck_id: DECK, parent_id: B, node_type: 'statement', content: 'Ty thể sản sinh ATP.', sort_order: 1 },
  { id: D, deck_id: DECK, parent_id: B, node_type: 'root', content: 'Ty thể', sort_order: 2 },
  { id: D1, deck_id: DECK, parent_id: D, node_type: 'statement', content: 'Ty thể có DNA riêng.', sort_order: 1 },
  { id: C, deck_id: DECK, parent_id: null, node_type: 'root', content: 'Di truyền', sort_order: 2 },
  { id: C1, deck_id: DECK, parent_id: C, node_type: 'statement', content: 'Gen nằm trên NST.', sort_order: 1 },
  { id: OTHER, deck_id: OTHER_DECK, parent_id: null, node_type: 'root', content: 'Khác', sort_order: 1 },
  { id: O1, deck_id: OTHER_DECK, parent_id: OTHER, node_type: 'statement', content: 'Cây khác.', sort_order: 1 },
]

function setup(viewer: string | null) {
  const fake = fakeContentDb({
    viewer,
    // Public, so a visitor can read it but not delete from it (RLS: owner-only writes).
    decks: [
      { id: DECK, user_id: OWNER, slug: 'sinh-hoc', is_public: true },
      { id: OTHER_DECK, user_id: OWNER, slug: 'khac', is_public: true },
    ],
    nodes: NODES,
    progress: [A1, B1, D1, C1, O1].map((item) => ({ user_id: VISITOR, knowledge_item_id: item, mastery_level: 3 })),
    tournamentProgress: [B1, C1].map((item) => ({ user_id: VISITOR, knowledge_item_id: item, mastery_level: 2 })),
  })
  vi.mocked(createClient).mockResolvedValue(fake.client as never)
  return fake
}
const ids = (rows: { id?: unknown; knowledge_item_id?: unknown }[]) => rows.map((r) => String(r.id ?? r.knowledge_item_id)).sort()

beforeEach(() => vi.clearAllMocks())

describe('deleteKnowledgeItem', () => {
  it('deletes the statement and cascades its user_progress and tournament progress (only its own)', async () => {
    const { db } = setup(OWNER)
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: B1 })).toMatchObject({ success: true, data: { id: B1 } })
    expect(db.content_nodes.some((n) => n.id === B1)).toBe(false)
    expect(ids(db.user_progress)).toEqual([A1, D1, C1, O1].sort())
    expect(ids(db.deck_tournament_item_progress)).toEqual([C1])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a statement with statements under it takes them along', async () => {
    const { db } = setup(OWNER)
    db.content_nodes.push({ id: id(200), deck_id: DECK, parent_id: A1, node_type: 'statement', content: 'Nằm dưới A1.', sort_order: 1 })
    await deleteKnowledgeItem({ deckId: DECK, itemId: A1 })
    expect(db.content_nodes.some((n) => n.id === id(200))).toBe(false)
  })

  it('blocks non-owners: AUTH_FORBIDDEN and nothing is deleted', async () => {
    const { db, writes } = setup(VISITOR)
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: B1 })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(db.content_nodes).toHaveLength(NODES.length)
    expect(writes).toEqual([])
  })

  it('blocks signed-out players before any query', async () => {
    const { writes } = setup(null)
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: B1 })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(writes).toEqual([])
  })

  it('refuses a statement of another tree, an unknown statement and malformed ids', async () => {
    const { db } = setup(OWNER)
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: O1 })).toMatchObject({ success: false, error: { code: 'ITEM_NOT_FOUND' } })
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: id(999) })).toMatchObject({ success: false, error: { code: 'ITEM_NOT_FOUND' } })
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: 'nope' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(db.content_nodes).toHaveLength(NODES.length)
  })
})

describe('deleteRootBranch', () => {
  it('deletes the root, its sub-roots, all their statements and every related progress row', async () => {
    const { db } = setup(OWNER)
    expect(await deleteRootBranch({ deckId: DECK, rootId: A })).toMatchObject({ success: true, data: { rootId: A, deletedStatements: 4, deletedSubRoots: 2 } })
    expect(ids(db.content_nodes)).toEqual([C, C1, OTHER, O1].sort())
    expect(ids(db.user_progress)).toEqual([C1, O1].sort())
    expect(ids(db.deck_tournament_item_progress)).toEqual([C1])
  })

  it('deleting a sub-root keeps its parent', async () => {
    const { db } = setup(OWNER)
    expect(await deleteRootBranch({ deckId: DECK, rootId: B })).toMatchObject({ success: true, data: { deletedStatements: 2, deletedSubRoots: 1 } })
    expect(ids(db.content_nodes)).toEqual([A, A1, A2, C, C1, OTHER, O1].sort())
  })

  it('blocks non-owners and signed-out players: nothing is deleted', async () => {
    const visitor = setup(VISITOR)
    expect(await deleteRootBranch({ deckId: DECK, rootId: A })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(visitor.db.content_nodes).toHaveLength(NODES.length)
    const signedOut = setup(null)
    expect(await deleteRootBranch({ deckId: DECK, rootId: A })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(signedOut.db.content_nodes).toHaveLength(NODES.length)
  })

  it('refuses a root of another tree and malformed input', async () => {
    const { db } = setup(OWNER)
    expect(await deleteRootBranch({ deckId: DECK, rootId: OTHER })).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
    expect(await deleteRootBranch({ deckId: DECK, rootId: 'x' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(db.content_nodes).toHaveLength(NODES.length)
  })
})

// ─── The database really cascades (migration contract) ─────────────────────────────────────────

describe('cascade contract in the migrations', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', file), 'utf8')
  const unified = read('20261013000000_content_nodes.sql')

  it('a node takes its branch, and progress and tournament progress go with their statement', () => {
    expect(unified).toMatch(/foreign key \(parent_id, deck_id\) references public\.content_nodes \(id, deck_id\) on delete cascade/i)
    expect(unified).toMatch(/user_progress_content_node_fkey\s+foreign key \(knowledge_item_id\) references public\.content_nodes \(id\) on delete cascade/i)
    expect(unified).toMatch(/deck_tournament_item_progress_content_node_fkey\s+foreign key \(knowledge_item_id\) references public\.content_nodes \(id\) on delete cascade/i)
    expect(unified).toMatch(/deck_id\s+uuid\s+not null references public\.decks \(id\) on delete cascade/i)
  })
})
