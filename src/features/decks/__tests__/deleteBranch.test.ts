import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
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

// ─── In-memory database: RLS (owner-only deletes) + ON DELETE CASCADE like the migrations ──────

type Row = Record<string, unknown>

function fakeDb(viewer: string | null) {
  const db: Record<string, Row[]> = {
    decks: [
      { id: DECK, user_id: OWNER, slug: 'sinh-hoc', tree_type: 'oak' },
      { id: OTHER_DECK, user_id: OWNER, slug: 'khac', tree_type: 'oak' },
    ],
    mindmap_nodes: [
      { id: A, deck_id: DECK, parent_id: null, title: 'Tế bào' },
      { id: B, deck_id: DECK, parent_id: A, title: 'Bào quan' },
      { id: D, deck_id: DECK, parent_id: B, title: 'Sâu' },
      { id: C, deck_id: DECK, parent_id: null, title: 'Di truyền' },
      { id: OTHER, deck_id: OTHER_DECK, parent_id: null, title: 'Khác' },
    ],
    knowledge_items: [
      { id: A1, node_id: A },
      { id: A2, node_id: A },
      { id: B1, node_id: B },
      { id: D1, node_id: D },
      { id: C1, node_id: C },
      { id: O1, node_id: OTHER },
    ],
    // Progress of the owner and of other players (clones never share items, but old rows may exist).
    user_progress: [
      { user_id: OWNER, knowledge_item_id: A1 },
      { user_id: VISITOR, knowledge_item_id: B1 },
      { user_id: OWNER, knowledge_item_id: D1 },
      { user_id: OWNER, knowledge_item_id: C1 },
    ],
    deck_tournament_item_progress: [
      { participant_id: 'p-visitor', knowledge_item_id: A2 },
      { participant_id: 'p-visitor', knowledge_item_id: D1 },
      { participant_id: 'p-visitor', knowledge_item_id: C1 },
    ],
  }
  const deckOf = (table: string, row: Row): Row | undefined => {
    if (table === 'decks') return row
    const node = table === 'mindmap_nodes' ? row : db.mindmap_nodes.find((n) => n.id === row.node_id)
    return db.decks.find((d) => d.id === node?.deck_id)
  }

  // FK cascades: nodes → sub-nodes (parent_id) → knowledge_items → user_progress / tournament item progress.
  const cascadeDelete = (table: string, rows: Row[]) => {
    if (rows.length === 0) return
    db[table] = db[table].filter((r) => !rows.includes(r))
    if (table === 'mindmap_nodes') {
      const ids = new Set(rows.map((r) => r.id))
      cascadeDelete(
        'mindmap_nodes',
        db.mindmap_nodes.filter((n) => ids.has(n.parent_id)),
      )
      cascadeDelete(
        'knowledge_items',
        db.knowledge_items.filter((i) => ids.has(i.node_id)),
      )
    }
    if (table === 'knowledge_items') {
      const ids = new Set(rows.map((r) => r.id))
      db.user_progress = db.user_progress.filter((p) => !ids.has(p.knowledge_item_id))
      db.deck_tournament_item_progress = db.deck_tournament_item_progress.filter((p) => !ids.has(p.knowledge_item_id))
    }
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      let mode: 'select' | 'delete' = 'select'
      let head = false
      const run = () => {
        const rows = db[table].filter((r) => filters.every((f) => f(r)))
        if (mode === 'select') return { data: head ? null : rows, count: rows.length, error: null }
        // RLS "delete if deck owner": other players' deletes touch 0 rows.
        const allowed = rows.filter((r) => deckOf(table, r)?.user_id === viewer)
        cascadeDelete(table, allowed)
        return { data: allowed.map((r) => ({ id: r.id })), count: allowed.length, error: null }
      }
      const q = {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          head = opts?.head ?? false
          return q
        },
        delete: () => {
          mode = 'delete'
          return q
        },
        eq: (col: string, value: unknown) => {
          filters.push((r) => r[col] === value)
          return q
        },
        in: (col: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[col]))
          return q
        },
        maybeSingle: async () => {
          const res = run()
          return { data: (res.data as Row[] | null)?.[0] ?? null, error: null }
        },
        then: (resolve: (v: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return db
}

const ids = (rows: Row[], key = 'id') => rows.map((r) => r[key]).sort()

beforeEach(() => vi.clearAllMocks())

// ─── deleteKnowledgeItem ───────────────────────────────────────────────────────────────────────

describe('deleteKnowledgeItem', () => {
  it('deletes the statement and cascades its user_progress and tournament progress (only its own)', async () => {
    const db = fakeDb(OWNER)
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: D1 })).toEqual({
      success: true,
      data: { id: D1 },
    })
    expect(ids(db.knowledge_items)).not.toContain(D1)
    expect(db.user_progress.map((p) => p.knowledge_item_id)).not.toContain(D1)
    expect(db.deck_tournament_item_progress.map((p) => p.knowledge_item_id)).not.toContain(D1)
    // Everything else is untouched.
    expect(db.knowledge_items).toHaveLength(5)
    expect(db.user_progress).toHaveLength(3)
    expect(db.deck_tournament_item_progress).toHaveLength(2)
    // No page re-render: the deck page already removed it (deck draft).
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('blocks non-owners: AUTH_FORBIDDEN and nothing is deleted', async () => {
    const db = fakeDb(VISITOR)
    const before = db.knowledge_items.length
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: A1 })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(db.knowledge_items).toHaveLength(before)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('blocks signed-out players before any query', async () => {
    const db = fakeDb(null)
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: A1 })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(db.knowledge_items).toHaveLength(6)
  })

  it('refuses a statement of another tree, an unknown statement and malformed ids', async () => {
    const db = fakeDb(OWNER)
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: O1 })).toMatchObject({ success: false, error: { code: 'ITEM_NOT_FOUND' } })
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: id(99) })).toMatchObject({ success: false, error: { code: 'ITEM_NOT_FOUND' } })
    expect(await deleteKnowledgeItem({ itemId: A1 })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(await deleteKnowledgeItem({ deckId: DECK, itemId: 'not-a-uuid' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(db.knowledge_items).toHaveLength(6)
  })
})

// ─── deleteRootBranch ──────────────────────────────────────────────────────────────────────────

describe('deleteRootBranch', () => {
  it('deletes the root, its sub-roots, all their statements and every related progress row', async () => {
    const db = fakeDb(OWNER)
    const res = await deleteRootBranch({ deckId: DECK, rootId: A })
    expect(res).toEqual({ success: true, data: { rootId: A, deletedStatements: 4, deletedSubRoots: 2 } })
    expect(ids(db.mindmap_nodes)).toEqual([C, OTHER].sort())
    expect(ids(db.knowledge_items)).toEqual([C1, O1].sort())
    expect(db.user_progress.map((p) => p.knowledge_item_id)).toEqual([C1])
    expect(db.deck_tournament_item_progress.map((p) => p.knowledge_item_id)).toEqual([C1])
    expect(revalidatePath).toHaveBeenCalledWith('/deck/sinh-hoc')
  })

  it('deleting a sub-root keeps its parent', async () => {
    const db = fakeDb(OWNER)
    expect(await deleteRootBranch({ deckId: DECK, rootId: B })).toMatchObject({ success: true, data: { deletedStatements: 2, deletedSubRoots: 1 } })
    expect(ids(db.mindmap_nodes)).toEqual([A, C, OTHER].sort())
  })

  it('blocks non-owners and signed-out players: nothing is deleted', async () => {
    const visitorDb = fakeDb(VISITOR)
    expect(await deleteRootBranch({ deckId: DECK, rootId: A })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(visitorDb.mindmap_nodes).toHaveLength(5)
    const outDb = fakeDb(null)
    expect(await deleteRootBranch({ deckId: DECK, rootId: A })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(outDb.mindmap_nodes).toHaveLength(5)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a root of another tree and malformed input', async () => {
    const db = fakeDb(OWNER)
    expect(await deleteRootBranch({ deckId: DECK, rootId: OTHER })).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
    expect(await deleteRootBranch({ deckId: DECK, rootId: 'nope' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(db.mindmap_nodes).toHaveLength(5)
  })
})

// ─── The database really cascades (migration contract) ─────────────────────────────────────────

describe('cascade contract in the migrations', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', file), 'utf8')
  const base = read('20260928000000_initial_schema.sql')
  const tournament = read('20260928000900_mind_tournament.sql')

  it('statements, progress and tournament progress go with their root / statement', () => {
    expect(base).toMatch(/node_id\s+uuid\s+not null references public\.mindmap_nodes \(id\) on delete cascade/i)
    expect(base).toMatch(/knowledge_item_id uuid\s+not null references public\.knowledge_items \(id\) on delete cascade/i)
    expect(base).toMatch(/foreign key \(parent_id, deck_id\) references public\.mindmap_nodes \(id, deck_id\) on delete cascade/i)
    expect(tournament).toMatch(/knowledge_item_id uuid\s+not null references public\.knowledge_items \(id\) on delete cascade/i)
  })
})

