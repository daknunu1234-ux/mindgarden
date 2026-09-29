import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/shared/lib/supabase/server'
import { setTournamentOpen } from '../actions/setTournamentOpen'

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'

type Row = { id: string; user_id: string; title: string; slug: string; description: null; is_public: boolean; tree_type: string; created_at: string; is_tournament_open: boolean }

// In-memory decks table with RLS: read public or own, update own only.
function fakeSupabase(viewer: string | null, { isPublic = true } = {}) {
  const row: Row = { id: DECK, user_id: OWNER, title: 'Bào quan', slug: 'bao-quan', description: null, is_public: isPublic, tree_type: 'oak', created_at: '2026-09-01T00:00:00Z', is_tournament_open: false }
  const updates: Partial<Row>[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: (table: string) => {
      if (table !== 'decks') throw new Error(`unexpected table ${table}`)
      let patch: Partial<Row> | null = null
      const visible = () => (row.is_public || row.user_id === viewer ? row : null)
      const q = {
        select: () => q,
        update: (p: Partial<Row>) => {
          patch = p
          return q
        },
        eq: () => q,
        maybeSingle: async () => ({ data: visible(), error: null }),
        single: async () => {
          if (patch) {
            if (row.user_id !== viewer) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
            updates.push(patch)
            Object.assign(row, patch)
          }
          return { data: row, error: null }
        },
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return { row, updates }
}

beforeEach(() => vi.clearAllMocks())

describe('setTournamentOpen (host switch)', () => {
  it('lets the owner open and close the tournament on a shared tree', async () => {
    const { row } = fakeSupabase(OWNER)
    expect(await setTournamentOpen({ deckId: DECK, isOpen: true })).toMatchObject({ success: true, data: { isTournamentOpen: true } })
    expect(row.is_tournament_open).toBe(true)
    expect(await setTournamentOpen({ deckId: DECK, isOpen: false })).toMatchObject({ success: true, data: { isTournamentOpen: false } })
  })

  it('refuses anyone but the owner, without writing', async () => {
    const { updates } = fakeSupabase(VISITOR)
    expect(await setTournamentOpen({ deckId: DECK, isOpen: true })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(updates).toEqual([])
  })

  it('needs a session', async () => {
    const { updates } = fakeSupabase(null)
    expect(await setTournamentOpen({ deckId: DECK, isOpen: true })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(updates).toEqual([])
  })

  it('opens only on a shared tree (visitors can only reach public trees)', async () => {
    const { updates } = fakeSupabase(OWNER, { isPublic: false })
    expect(await setTournamentOpen({ deckId: DECK, isOpen: true })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(updates).toEqual([])
  })

  it('rejects a malformed payload', async () => {
    fakeSupabase(OWNER)
    expect(await setTournamentOpen({ deckId: 'bao-quan', isOpen: true })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(await setTournamentOpen({ deckId: DECK, isOpen: 'yes' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
  })
})
