import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { STARTING_COINS } from '@/shared/lib/economy'
import { createClient } from '@/shared/lib/supabase/server'
import { createDeck } from '../actions/createDeck'

const USER = '11111111-1111-4111-8111-111111111111'

type DeckRow = { id: string; user_id: string; title: string; slug: string; description: string | null; is_public: boolean; tree_type: string; created_at: string }

// In-memory stand-in for plant_deck() with the migration's semantics: charge 100 only if the purse
// has it, insert the deck, and roll the charge back on a duplicate slug (one transaction).
function fakeSupabase({ userId, coins, takenSlugs = [] }: { userId: string | null; coins: number; takenSlugs?: string[] }) {
  const db = { coins, decks: [] as DeckRow[], taken: new Set(takenSlugs), rpcCalls: 0 }
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    rpc: async (fn: string, args: { p_title: string; p_slug: string; p_description: string | null; p_is_public: boolean; p_tree_type: string }) => {
      if (fn !== 'plant_deck') throw new Error(`unexpected rpc ${fn}`)
      db.rpcCalls += 1
      if (db.coins < 100) return { data: null, error: { code: 'P0001', message: 'INSUFFICIENT_COINS' } }
      const before = db.coins
      db.coins -= 100
      if (db.taken.has(args.p_slug)) {
        db.coins = before // rolled back with the failed insert
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_decks_slug"' } }
      }
      const row: DeckRow = {
        id: `deck-${db.decks.length + 1}`,
        user_id: userId!,
        title: args.p_title,
        slug: args.p_slug,
        description: args.p_description,
        is_public: args.p_is_public,
        tree_type: args.p_tree_type,
        created_at: '2026-09-29T00:00:00Z',
      }
      db.decks.push(row)
      db.taken.add(row.slug)
      return { data: [{ deck_id: row.id, remaining_coins: db.coins }], error: null }
    },
    from: (table: string) => {
      if (table !== 'decks') throw new Error(`unexpected table ${table}`)
      let id = ''
      const q = {
        select: () => q,
        eq: (_col: string, value: string) => {
          id = value
          return q
        },
        single: async () => {
          const row = db.decks.find((d) => d.id === id)
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        },
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createDeck (seed economy)', () => {
  it('a new gardener (300 coins) plants a tree for 100 and keeps 200', async () => {
    const db = fakeSupabase({ userId: USER, coins: STARTING_COINS })

    const res = await createDeck({ title: 'Sinh học Tế bào', treeType: 'sakura' })

    expect(res).toMatchObject({ success: true, data: { remainingCoins: 200, deck: { slug: 'sinh-hoc-te-bao', treeType: 'sakura', userId: USER } } })
    expect(db.coins).toBe(200)
    expect(db.decks).toHaveLength(1)
    expect(vi.mocked(revalidatePath).mock.calls.map(([p]) => p)).toEqual(['/', '/profile'])
  })

  it('rejects planting with fewer than 100 coins, and plants nothing', async () => {
    const db = fakeSupabase({ userId: USER, coins: 99 })

    const res = await createDeck({ title: 'Hoá học' })

    expect(res).toEqual({
      success: false,
      error: { code: 'INSUFFICIENT_COINS', message: 'You need 100 coins to buy a seed for a new tree!' },
    })
    expect(db.coins).toBe(99)
    expect(db.decks).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('succeeds with exactly 100 coins and leaves 0', async () => {
    const db = fakeSupabase({ userId: USER, coins: 100 })
    const res = await createDeck({ title: 'Physics' })
    expect(res.success && res.data.remainingCoins).toBe(0)
    expect(db.coins).toBe(0)
  })

  it('charges once even when the first slugs are taken', async () => {
    const db = fakeSupabase({ userId: USER, coins: 300, takenSlugs: ['physics', 'physics-2'] })
    const res = await createDeck({ title: 'Physics' })
    expect(res.success && res.data.deck.slug).toBe('physics-3')
    expect(db.coins).toBe(200)
    expect(db.rpcCalls).toBe(3)
  })

  it('three seeds, then the purse is empty', async () => {
    const db = fakeSupabase({ userId: USER, coins: STARTING_COINS })
    for (const title of ['A', 'B', 'C']) expect((await createDeck({ title })).success).toBe(true)
    const fourth = await createDeck({ title: 'D' })
    expect(fourth.success).toBe(false)
    if (!fourth.success) expect(fourth.error.code).toBe('INSUFFICIENT_COINS')
    expect(db.decks).toHaveLength(3)
    expect(db.coins).toBe(0)
  })

  it('requires a session and valid input before touching coins', async () => {
    fakeSupabase({ userId: null, coins: 300 })
    const res = await createDeck({ title: 'X' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.code).toBe('AUTH_UNAUTHORIZED')

    const bad = await createDeck({ title: '   ' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error.code).toBe('VALIDATION_FAILED')
  })
})
