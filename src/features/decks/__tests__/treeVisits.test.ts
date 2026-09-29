import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/shared/lib/supabase/server'
import { getVisitedGardens } from '../actions/getVisitedGardens'
import { recordTreeVisit } from '../actions/recordTreeVisit'
import { countsAsVisit } from '../lib/visits'

const ANNA = '11111111-1111-4111-8111-111111111111'
const BINH = '22222222-2222-4222-8222-222222222222'
const CHI = '33333333-3333-4333-8333-333333333333'

const deckId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const ANNA_TREE = deckId(1) // Anna's own public tree
const BINH_SHARED = deckId(2)
const BINH_PRIVATE = deckId(3)
const CHI_SHARED = deckId(4)

type DeckRow = { id: string; user_id: string; title: string; slug: string; tree_type: string; is_public: boolean }
type VisitRow = { user_id: string; deck_id: string; visited_at: string }

// In-memory Supabase with the semantics of migration 20260928000800: record_tree_visit() only
// saves another gardener's PUBLIC tree and refreshes visited_at on a repeat; tree_visits reads are
// own-rows only and the embedded decks go through decks RLS (public or own).
function fakeSupabase(viewer: string | null, { visits = [] as VisitRow[], rpcError = null as { code: string; message: string } | null } = {}) {
  const decks: DeckRow[] = [
    { id: ANNA_TREE, user_id: ANNA, title: 'Anna Oak', slug: 'anna-oak', tree_type: 'oak', is_public: true },
    { id: BINH_SHARED, user_id: BINH, title: 'Sinh học Tế bào', slug: 'sinh-hoc', tree_type: 'sakura', is_public: true },
    { id: BINH_PRIVATE, user_id: BINH, title: 'Binh Secret', slug: 'binh-secret', tree_type: 'pine', is_public: false },
    { id: CHI_SHARED, user_id: CHI, title: 'Hóa học', slug: 'hoa-hoc', tree_type: 'apple', is_public: true },
  ]
  const itemsPerDeck: Record<string, number> = { [BINH_SHARED]: 7, [CHI_SHARED]: 2 }
  const db = { visits: [...visits], rpcCalls: 0, clock: Date.parse('2026-09-29T10:00:00Z'), filters: [] as string[] }
  const readable = (d: DeckRow) => d.is_public || d.user_id === viewer

  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    rpc: async (fn: string, args: { p_deck_id: string }) => {
      if (fn !== 'record_tree_visit') throw new Error(`unexpected rpc ${fn}`)
      db.rpcCalls += 1
      if (rpcError) return { data: null, error: rpcError }
      if (!viewer) return { data: null, error: { code: '28000', message: 'AUTH_UNAUTHORIZED' } }
      const deck = decks.find((d) => d.id === args.p_deck_id)
      if (!deck || !deck.is_public || deck.user_id === viewer) return { data: false, error: null }
      db.clock += 60_000
      const at = new Date(db.clock).toISOString()
      const existing = db.visits.find((v) => v.user_id === viewer && v.deck_id === deck.id)
      if (existing) existing.visited_at = at
      else db.visits.push({ user_id: viewer, deck_id: deck.id, visited_at: at })
      return { data: true, error: null }
    },
    from: (table: string) => {
      if (table === 'tree_visits') {
        // RLS "tree_visits: read own" + inner join through decks RLS.
        let rows = db.visits
          .filter((v) => v.user_id === viewer)
          .map((v) => ({ visited_at: v.visited_at, decks: decks.find((d) => d.id === v.deck_id && readable(d)) ?? null }))
          .filter((r): r is { visited_at: string; decks: DeckRow } => r.decks !== null)
        const q = {
          select: () => q,
          eq: (col: string, value: unknown) => {
            db.filters.push(`eq ${col}`)
            if (col === 'decks.is_public') rows = rows.filter((r) => r.decks.is_public === value)
            return q
          },
          neq: (col: string, value: unknown) => {
            db.filters.push(`neq ${col}`)
            if (col === 'decks.user_id') rows = rows.filter((r) => r.decks.user_id !== value)
            return q
          },
          order: () => {
            rows = [...rows].sort((a, b) => b.visited_at.localeCompare(a.visited_at))
            return q
          },
          limit: (n: number) => {
            rows = rows.slice(0, n)
            return q
          },
          then: (resolve: (v: { data: typeof rows; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
        }
        return q
      }
      if (table === 'mindmap_nodes') {
        const q = {
          select: () => q,
          in: (_col: string, ids: string[]) => {
            const data = ids.map((id) => ({
              id: `node-${id}`,
              deck_id: id,
              knowledge_items: Array.from({ length: itemsPerDeck[id] ?? 0 }, (_, i) => ({ id: `${id}-item-${i}` })),
            }))
            return Promise.resolve({ data, error: null })
          },
        }
        return q
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return db
}

beforeEach(() => vi.clearAllMocks())

describe('countsAsVisit (which tree pages record a visit)', () => {
  it("counts a signed-in player opening someone else's public tree", () => {
    expect(countsAsVisit({ viewerId: ANNA, ownerId: BINH, isPublic: true })).toBe(true)
  })

  it('never counts my own tree, a private tree, or a signed-out reader', () => {
    expect(countsAsVisit({ viewerId: ANNA, ownerId: ANNA, isPublic: true })).toBe(false)
    expect(countsAsVisit({ viewerId: ANNA, ownerId: BINH, isPublic: false })).toBe(false)
    expect(countsAsVisit({ viewerId: null, ownerId: BINH, isPublic: true })).toBe(false)
  })
})

describe('recordTreeVisit', () => {
  it("records a visit to another gardener's shared tree", async () => {
    const db = fakeSupabase(ANNA)
    expect(await recordTreeVisit({ deckId: BINH_SHARED })).toEqual({ success: true, data: { recorded: true } })
    expect(db.visits).toEqual([{ user_id: ANNA, deck_id: BINH_SHARED, visited_at: expect.any(String) }])
  })

  it('refreshes the time of a repeat visit instead of adding a second row', async () => {
    const db = fakeSupabase(ANNA)
    await recordTreeVisit({ deckId: BINH_SHARED })
    const first = db.visits[0].visited_at
    await recordTreeVisit({ deckId: BINH_SHARED })
    expect(db.visits).toHaveLength(1)
    expect(db.visits[0].visited_at > first).toBe(true)
  })

  it('does not record my own tree or a private tree (recorded: false, not an error)', async () => {
    const db = fakeSupabase(ANNA)
    expect(await recordTreeVisit({ deckId: ANNA_TREE })).toEqual({ success: true, data: { recorded: false } })
    expect(await recordTreeVisit({ deckId: BINH_PRIVATE })).toEqual({ success: true, data: { recorded: false } })
    expect(db.visits).toEqual([])
  })

  it('needs a session and never reaches the database without one', async () => {
    const db = fakeSupabase(null)
    expect(await recordTreeVisit({ deckId: BINH_SHARED })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(db.rpcCalls).toBe(0)
  })

  it('rejects a malformed tree id before any query', async () => {
    const db = fakeSupabase(ANNA)
    expect(await recordTreeVisit({ deckId: 'sinh-hoc' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(await recordTreeVisit(null)).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(db.rpcCalls).toBe(0)
  })

  it('reports INTERNAL_ERROR when the migration has not run yet', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    fakeSupabase(ANNA, { rpcError: { code: 'PGRST202', message: 'Could not find the function public.record_tree_visit' } })
    expect(await recordTreeVisit({ deckId: BINH_SHARED })).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('20260928000800_tree_visits.sql'))
    log.mockRestore()
  })
})

describe('getVisitedGardens', () => {
  it('lists the trees I opened, newest visit first, with owner and statement count', async () => {
    fakeSupabase(ANNA)
    await recordTreeVisit({ deckId: CHI_SHARED })
    await recordTreeVisit({ deckId: BINH_SHARED })
    const res = await getVisitedGardens()
    expect(res.success && res.data).toEqual([
      {
        deckId: BINH_SHARED,
        ownerId: BINH,
        title: 'Sinh học Tế bào',
        slug: 'sinh-hoc',
        treeType: 'sakura',
        statementCount: 7,
        visitedAt: expect.any(String),
      },
      expect.objectContaining({ deckId: CHI_SHARED, ownerId: CHI, statementCount: 2 }),
    ])
  })

  it("never lists my own trees or trees that went private, and only my own visits", async () => {
    const at = '2026-09-28T00:00:00Z'
    const db = fakeSupabase(ANNA, {
      visits: [
        { user_id: ANNA, deck_id: ANNA_TREE, visited_at: at }, // can't be recorded, but even if present
        { user_id: ANNA, deck_id: BINH_PRIVATE, visited_at: at }, // Binh made it private after the visit
        { user_id: ANNA, deck_id: CHI_SHARED, visited_at: at },
        { user_id: BINH, deck_id: CHI_SHARED, visited_at: at }, // someone else's visit
      ],
    })
    const res = await getVisitedGardens()
    expect(res.success && res.data.map((t) => t.deckId)).toEqual([CHI_SHARED])
    expect(db.filters).toEqual(expect.arrayContaining(['eq user_id', 'eq decks.is_public', 'neq decks.user_id']))
  })

  it('is empty when signed out, without querying visits', async () => {
    const db = fakeSupabase(null)
    expect(await getVisitedGardens()).toEqual({ success: true, data: [] })
    expect(db.filters).toEqual([])
  })

  it('rejects an out-of-range limit', async () => {
    fakeSupabase(ANNA)
    expect(await getVisitedGardens({ limit: 0 })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
  })
})

describe('migration 20260928000800_tree_visits.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260928000800_tree_visits.sql'), 'utf8')

  it('creates the table with one row per player per tree, cascading with both parents', () => {
    expect(sql).toMatch(/create table if not exists public\.tree_visits/i)
    expect(sql).toMatch(/user_id\s+uuid\s+not null references public\.users \(id\) on delete cascade/i)
    expect(sql).toMatch(/deck_id\s+uuid\s+not null references public\.decks \(id\) on delete cascade/i)
    expect(sql).toMatch(/primary key \(user_id, deck_id\)/i)
  })

  it('enables RLS with read-own only, and players get no write grants', () => {
    expect(sql).toMatch(/alter table public\.tree_visits enable row level security;/i)
    expect(sql).toMatch(/for select to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i)
    expect(sql).toMatch(/revoke all on table public\.tree_visits from anon, authenticated;/i)
    expect(sql).toMatch(/grant select on table public\.tree_visits to authenticated;/i)
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/i)
  })

  it('records only public trees of other gardeners, and refreshes repeats', () => {
    expect(sql).toMatch(/if not found or not v_public or v_owner = v_user then\s+return false;/i)
    expect(sql).toMatch(/on conflict \(user_id, deck_id\) do update set visited_at = excluded\.visited_at/i)
    expect(sql).toMatch(/revoke all on function public\.record_tree_visit\(uuid\) from public, anon;/i)
  })
})
