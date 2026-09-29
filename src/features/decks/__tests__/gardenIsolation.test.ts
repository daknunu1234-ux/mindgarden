import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/shared/lib/supabase/server'
import { getCommunityDecks } from '../actions/getCommunityDecks'
import { getDecks } from '../actions/getDecks'
import { getNeighborGarden } from '../actions/getNeighborGarden'

const ANNA = '11111111-1111-4111-8111-111111111111'
const BINH = '22222222-2222-4222-8222-222222222222'
const CHI = '33333333-3333-4333-8333-333333333333'

type Row = { id: string; user_id: string; title: string; slug: string; description: null; is_public: boolean; tree_type: string; created_at: string }
const row = (id: string, user_id: string, is_public: boolean, day: number): Row => ({
  id,
  user_id,
  title: id,
  slug: id,
  description: null,
  is_public,
  tree_type: 'oak',
  created_at: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`,
})

const ROWS: Row[] = [
  row('anna-private', ANNA, false, 1),
  row('anna-shared', ANNA, true, 2),
  row('binh-shared', BINH, true, 3),
  row('binh-private', BINH, false, 4),
  row('chi-shared', CHI, true, 5),
]

// In-memory Supabase: RLS (public or own) + the eq / neq / order / range / limit filters the
// services use. Records every filter so tests can assert what was asked.
function fakeSupabase(viewer: string | null) {
  const calls: string[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: (table: string) => {
      if (table !== 'decks') throw new Error(`unexpected table ${table}`)
      // RLS "decks: read public or own".
      let rows = ROWS.filter((r) => r.is_public || r.user_id === viewer)
      const q = {
        select: () => q,
        eq: (col: keyof Row, value: unknown) => {
          calls.push(`eq ${col}`)
          rows = rows.filter((r) => r[col] === value)
          return q
        },
        neq: (col: keyof Row, value: unknown) => {
          calls.push(`neq ${col}`)
          rows = rows.filter((r) => r[col] !== value)
          return q
        },
        order: () => {
          rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
          return q
        },
        range: (from: number, to: number) => {
          rows = rows.slice(from, to + 1)
          return q
        },
        limit: (n: number) => {
          rows = rows.slice(0, n)
          return q
        },
        then: (resolve: (v: { data: Row[]; error: null; count: number }) => unknown) =>
          Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve),
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return calls
}

const slugs = (res: Awaited<ReturnType<typeof getDecks>>) => (res.success ? res.data.map((d) => d.slug) : [])

beforeEach(() => vi.clearAllMocks())

describe('getDecks: my own garden only', () => {
  it("shows only the signed-in player's trees, private ones included, never a neighbour's public tree", async () => {
    const calls = fakeSupabase(ANNA)
    expect(slugs(await getDecks())).toEqual(['anna-shared', 'anna-private'])
    expect(calls).toContain('eq user_id')
  })

  it('switching accounts shows a different island', async () => {
    fakeSupabase(BINH)
    expect(slugs(await getDecks())).toEqual(['binh-private', 'binh-shared'])
    fakeSupabase(CHI)
    expect(slugs(await getDecks())).toEqual(['chi-shared'])
  })

  it('is an empty garden when signed out (no query at all)', async () => {
    const calls = fakeSupabase(null)
    expect(await getDecks()).toMatchObject({ success: true, data: [], meta: { total: 0 } })
    expect(calls).toEqual([])
  })
})

describe('getCommunityDecks: other gardeners’ shared trees', () => {
  it('lists public trees of others, never my own and never anyone’s private ones', async () => {
    const calls = fakeSupabase(ANNA)
    expect(slugs(await getCommunityDecks())).toEqual(['chi-shared', 'binh-shared'])
    expect(calls).toEqual(expect.arrayContaining(['eq is_public', 'neq user_id']))
  })

  it('shows every public tree to a signed-out visitor', async () => {
    fakeSupabase(null)
    expect(slugs(await getCommunityDecks())).toEqual(['chi-shared', 'binh-shared', 'anna-shared'])
  })
})

describe('getNeighborGarden: visiting one island', () => {
  it("shows only that gardener's shared trees, even to a visitor who asks for their private ones", async () => {
    fakeSupabase(ANNA)
    expect(slugs(await getNeighborGarden({ ownerId: BINH }))).toEqual(['binh-shared'])
  })

  it('rejects a malformed gardener id', async () => {
    fakeSupabase(ANNA)
    expect((await getNeighborGarden({ ownerId: 'nope' })).success).toBe(false)
  })
})
