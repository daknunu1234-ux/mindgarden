import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { renameDeck } from '../actions/renameDeck'

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'

// One tree in a fake database: the owner check reads it, the rename updates it.
function fakeSupabase(viewer: string | null) {
  const deck = {
    id: DECK,
    user_id: OWNER,
    title: 'Oak Tree',
    slug: 'oak-tree',
    description: null,
    is_public: false,
    tree_type: 'oak',
    created_at: '2026-10-06T00:00:00Z',
    is_tournament_open: false,
  }
  const updates: Record<string, unknown>[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from: () => {
      let patch: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        eq: () => q,
        update: (p: Record<string, unknown>) => ((patch = p), q),
        maybeSingle: async () => ({ data: deck, error: null }),
        single: async () => {
          if (patch) {
            updates.push(patch)
            Object.assign(deck, patch)
          }
          return { data: deck, error: null }
        },
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return { deck, updates }
}

beforeEach(() => vi.clearAllMocks())

describe('renameDeck', () => {
  it("renames the owner's tree with the cleaned name, keeping the slug, without re-rendering pages", async () => {
    const db = fakeSupabase(OWNER)
    expect(await renameDeck({ deckId: DECK, title: '  Sinh   học 101 ' })).toEqual({ success: true, data: { id: DECK, title: 'Sinh học 101' } })
    expect(db.updates).toEqual([{ title: 'Sinh học 101' }])
    expect(db.deck.slug).toBe('oak-tree')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses empty and over-long names before any query', async () => {
    const db = fakeSupabase(OWNER)
    for (const title of ['', '   ', 'x'.repeat(101), 42]) {
      expect(await renameDeck({ deckId: DECK, title })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect((await renameDeck({ deckId: DECK, title: 'x'.repeat(100) })).success).toBe(true)
    expect(db.updates).toHaveLength(1)
  })

  it("refuses someone else's tree and signed-out players", async () => {
    const db = fakeSupabase(VISITOR)
    expect(await renameDeck({ deckId: DECK, title: 'Mine now' })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    fakeSupabase(null)
    expect(await renameDeck({ deckId: DECK, title: 'Mine now' })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(db.updates).toEqual([])
  })
})
