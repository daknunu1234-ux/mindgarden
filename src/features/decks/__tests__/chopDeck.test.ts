import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Like the real redirect(), the mock throws: code after it must not run.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/shared/lib/supabase/server'
import { chopDeck } from '../actions/chopDeck'

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const DECK = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'
const MISSING = '7a2d3b9f-3c2f-4d9b-8e4a-2b3c4d5e6f70'

type DeckRow = { id: string; user_id: string; slug: string; tree_type: string }

// Minimal in-memory stand-in for the two queries removeDeck makes on `decks`:
//   select(...).eq('id', x).maybeSingle()   and   delete().eq('id', x).select('id')
// `refuseDelete` mimics RLS silently filtering the DELETE (0 rows, no error).
// `uproot`: the uproot_deck() RPC (migration 20260930000000). 'missing' = before that migration, so
// removeDeck falls back to the plain delete; { refund } = the RPC chops the deck and pays the refund.
function fakeSupabase({
  userId,
  decks,
  refuseDelete = false,
  uproot = 'missing',
}: {
  userId: string | null
  decks: DeckRow[]
  refuseDelete?: boolean
  uproot?: 'missing' | { refund: number }
}) {
  const rows = [...decks]
  const deleted: string[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    rpc: async (fn: string, args: { p_deck_id: string }) => {
      if (fn !== 'uproot_deck') throw new Error(`unexpected rpc ${fn}`)
      if (uproot === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.uproot_deck' } }
      const index = rows.findIndex((r) => r.id === args.p_deck_id)
      const [row] = rows.splice(index, 1)
      deleted.push(row.id)
      return { data: [{ deck_id: row.id, refund: uproot.refund, total_coins: 100 + uproot.refund }], error: null }
    },
    from(table: string) {
      if (table !== 'decks') throw new Error(`unexpected table ${table}`)
      let deleting = false
      let id: string | undefined
      const query = {
        select: () => query,
        delete: () => {
          deleting = true
          return query
        },
        eq: (_column: string, value: string) => {
          id = value
          return query
        },
        maybeSingle: async () => ({ data: rows.find((r) => r.id === id) ?? null, error: null }),
        // Awaiting delete().eq().select() resolves the DELETE ... RETURNING id.
        then: (resolve: (value: { data: { id: string }[]; error: null }) => unknown) => {
          const index = rows.findIndex((r) => r.id === id)
          if (!deleting || index === -1 || refuseDelete) return Promise.resolve({ data: [], error: null }).then(resolve)
          const [row] = rows.splice(index, 1)
          deleted.push(row.id)
          return Promise.resolve({ data: [{ id: row.id }], error: null }).then(resolve)
        },
      }
      return query
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return { deleted, rows }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('chopDeck (the farm\'s 🪓 Chop and the deck page\'s Danger Zone)', () => {
  const tree = { id: DECK, user_id: OWNER, slug: 'hoa-hoc', tree_type: 'oak' }

  it('chops and answers with the refund and the purse, without redirecting or re-rendering the farm', async () => {
    const { deleted } = fakeSupabase({ userId: OWNER, decks: [tree], uproot: { refund: 12 } })
    expect(await chopDeck({ deckId: DECK })).toEqual({ success: true, data: { id: DECK, refund: 12, totalCoins: 112 } })
    expect(deleted).toEqual([DECK])
    expect(redirect).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports no purse before the farm-grid migration (plain delete, no refund)', async () => {
    fakeSupabase({ userId: OWNER, decks: [tree] })
    expect(await chopDeck({ deckId: DECK })).toEqual({ success: true, data: { id: DECK, refund: 0, totalCoins: null } })
  })

  it('refuses strangers, missing trees, bad ids and signed-out players, deleting nothing', async () => {
    const stranger = fakeSupabase({ userId: STRANGER, decks: [tree], uproot: { refund: 5 } })
    expect(await chopDeck({ deckId: DECK })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(stranger.deleted).toEqual([])
    fakeSupabase({ userId: OWNER, decks: [tree] })
    expect(await chopDeck({ deckId: MISSING })).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
    expect(await chopDeck({ deckId: 'nope' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    fakeSupabase({ userId: null, decks: [tree] })
    expect(await chopDeck({ deckId: DECK })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
  })

  it('validates the id before touching the database', async () => {
    expect(await chopDeck({ deckId: 'not-a-uuid' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('does not report success when RLS silently deletes nothing (plain delete path)', async () => {
    const db = fakeSupabase({ userId: OWNER, decks: [tree], refuseDelete: true })
    expect(await chopDeck({ deckId: DECK })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(db.rows).toHaveLength(1)
  })
})
