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
import { deleteDeck } from '../actions/deleteDeck'

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const DECK = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'
const MISSING = '7a2d3b9f-3c2f-4d9b-8e4a-2b3c4d5e6f70'

type DeckRow = { id: string; user_id: string; slug: string; tree_type: string }

// Minimal in-memory stand-in for the two queries removeDeck makes on `decks`:
//   select(...).eq('id', x).maybeSingle()   and   delete().eq('id', x).select('id')
// `refuseDelete` mimics RLS silently filtering the DELETE (0 rows, no error).
function fakeSupabase({ userId, decks, refuseDelete = false }: { userId: string | null; decks: DeckRow[]; refuseDelete?: boolean }) {
  const rows = [...decks]
  const deleted: string[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
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

const oakDeck: DeckRow = { id: DECK, user_id: OWNER, slug: 'sinh-hoc', tree_type: 'oak' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deleteDeck', () => {
  it('lets the owner uproot the tree, refreshes the pages and redirects to the farm', async () => {
    const db = fakeSupabase({ userId: OWNER, decks: [oakDeck] })

    await expect(deleteDeck({ deckId: DECK })).rejects.toThrow('NEXT_REDIRECT')

    expect(db.deleted).toEqual([DECK])
    expect(db.rows).toHaveLength(0)
    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(['/', '/deck/sinh-hoc', '/profile'])
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('forbids anyone but the owner, and deletes nothing', async () => {
    const db = fakeSupabase({ userId: STRANGER, decks: [oakDeck] })

    const res = await deleteDeck({ deckId: DECK })

    expect(res).toEqual({ success: false, error: { code: 'AUTH_FORBIDDEN', message: expect.any(String) } })
    expect(db.deleted).toEqual([])
    expect(redirect).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns DECK_NOT_FOUND for a deck that does not exist (or is hidden)', async () => {
    const db = fakeSupabase({ userId: OWNER, decks: [oakDeck] })

    const res = await deleteDeck({ deckId: MISSING })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.code).toBe('DECK_NOT_FOUND')
    expect(db.deleted).toEqual([])
    expect(redirect).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    fakeSupabase({ userId: null, decks: [oakDeck] })

    const res = await deleteDeck({ deckId: DECK })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.code).toBe('AUTH_UNAUTHORIZED')
  })

  it('validates the id before touching the database', async () => {
    const res = await deleteDeck({ deckId: 'not-a-uuid' })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.code).toBe('VALIDATION_FAILED')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('does not report success when RLS silently deletes nothing', async () => {
    const db = fakeSupabase({ userId: OWNER, decks: [oakDeck], refuseDelete: true })

    const res = await deleteDeck({ deckId: DECK })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.code).toBe('AUTH_FORBIDDEN')
    expect(db.rows).toHaveLength(1)
    expect(redirect).not.toHaveBeenCalled()
  })
})
