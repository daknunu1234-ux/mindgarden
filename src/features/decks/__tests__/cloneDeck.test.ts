import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { cloneCost, CLONE_COST_CAP, STARTING_COINS } from '@/shared/lib/economy'
import { createClient } from '@/shared/lib/supabase/server'
import { canPractice } from '@/shared/lib/visitor'
import { cloneDeck } from '../actions/cloneDeck'

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const SOURCE = '33333333-3333-4333-8333-333333333333'

type DeckRow = { id: string; user_id: string; title: string; slug: string; description: string | null; is_public: boolean; tree_type: string; created_at: string }

// In-memory stand-in for clone_deck() with the migration's semantics: public-only, not your own,
// charge min(100 + n, 150) only if the purse has it, roll everything back on a duplicate slug.
function fakeSupabase({
  userId,
  coins,
  statements,
  isPublic = true,
  takenSlugs = [],
}: { userId: string | null; coins: number; statements: number; isPublic?: boolean; takenSlugs?: string[] }) {
  const source: DeckRow = {
    id: SOURCE,
    user_id: OWNER,
    title: 'Sinh học Tế bào',
    slug: 'sinh-hoc-te-bao',
    description: 'Ty thể, lục lạp',
    is_public: isPublic,
    tree_type: 'sakura',
    created_at: '2026-09-01T00:00:00Z',
  }
  const db = { coins, decks: [source] as DeckRow[], taken: new Set([source.slug, ...takenSlugs]), rpcCalls: 0 }
  const visible = (d: DeckRow) => d.is_public || d.user_id === userId
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    rpc: async (fn: string, args: { p_source_deck_id: string; p_slug: string }) => {
      if (fn !== 'clone_deck') throw new Error(`unexpected rpc ${fn}`)
      db.rpcCalls += 1
      const src = db.decks.find((d) => d.id === args.p_source_deck_id)
      if (!src || !src.is_public) return { data: null, error: { code: 'P0002', message: 'DECK_NOT_FOUND' } }
      if (src.user_id === userId) return { data: null, error: { code: 'P0001', message: 'CANNOT_CLONE_OWN_DECK' } }
      const cost = Math.min(100 + statements, 150)
      if (db.coins < cost) {
        return { data: null, error: { code: 'P0001', message: 'INSUFFICIENT_COINS', hint: `Cloning this tree costs ${cost} coins` } }
      }
      // A duplicate slug fails the deck insert and rolls the charge back with it.
      if (db.taken.has(args.p_slug)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_decks_slug"' } }
      }
      db.coins -= cost
      const row: DeckRow = { ...src, id: `clone-${db.decks.length}`, user_id: userId!, slug: args.p_slug, is_public: false, created_at: '2026-09-29T00:00:00Z' }
      db.decks.push(row)
      db.taken.add(row.slug)
      return { data: [{ deck_id: row.id, remaining_coins: db.coins, cost }], error: null }
    },
    from: (table: string) => {
      if (table !== 'decks') throw new Error(`unexpected table ${table}`)
      let id = ''
      // RLS: a deck is readable when it's public or yours.
      const find = () => db.decks.find((d) => d.id === id && visible(d)) ?? null
      const q = {
        select: () => q,
        eq: (_col: string, value: string) => {
          id = value
          return q
        },
        single: async () => {
          const row = find()
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        },
        maybeSingle: async () => ({ data: find(), error: null }),
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

describe('cloneCost / canPractice', () => {
  it('costs 100 + one coin per statement, capped at 150', () => {
    expect(cloneCost(0)).toBe(100)
    expect(cloneCost(12)).toBe(112)
    expect(cloneCost(50)).toBe(CLONE_COST_CAP)
    expect(cloneCost(400)).toBe(150)
    expect(cloneCost(-3)).toBe(100)
    expect(cloneCost(Number.NaN)).toBe(100)
  })

  it('only the owner may practise', () => {
    expect(canPractice(OWNER, OWNER)).toBe(true)
    expect(canPractice(OWNER, VISITOR)).toBe(false)
    expect(canPractice(OWNER, null)).toBe(false)
    expect(canPractice(OWNER, undefined)).toBe(false)
  })
})

describe('cloneDeck', () => {
  it('charges min(100 + n, 150) and plants a private copy owned by the cloner', async () => {
    const db = fakeSupabase({ userId: VISITOR, coins: STARTING_COINS, statements: 12 })

    const res = await cloneDeck({ deckId: SOURCE })

    expect(res).toMatchObject({
      success: true,
      data: { cost: 112, remainingCoins: 188, deck: { userId: VISITOR, isPublic: false, title: 'Sinh học Tế bào', treeType: 'sakura' } },
    })
    expect(db.coins).toBe(188)
    // The copy is the cloner's, so they can practise it (from 0/5: see the drill queue tests).
    if (res.success) expect(canPractice(res.data.deck.userId, VISITOR)).toBe(true)
    expect(vi.mocked(revalidatePath).mock.calls.map(([p]) => p)).toEqual(['/', '/profile'])
  })

  it('caps the fee at 150 for a big tree', async () => {
    fakeSupabase({ userId: VISITOR, coins: 150, statements: 90 })
    expect(await cloneDeck({ deckId: SOURCE })).toMatchObject({ success: true, data: { cost: 150, remainingCoins: 0 } })
  })

  it('refuses a short purse with the exact fee, charging nothing', async () => {
    const db = fakeSupabase({ userId: VISITOR, coins: 110, statements: 20 })

    const res = await cloneDeck({ deckId: SOURCE })

    expect(res).toEqual({ success: false, error: { code: 'INSUFFICIENT_COINS', message: 'You need 120 coins to clone this tree!' } })
    expect(db.coins).toBe(110)
    expect(db.decks).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('tries the next slug on a collision without charging twice', async () => {
    const db = fakeSupabase({ userId: VISITOR, coins: 300, statements: 0, takenSlugs: ['sinh-hoc-te-bao-2'] })

    const res = await cloneDeck({ deckId: SOURCE })

    expect(res).toMatchObject({ success: true, data: { deck: { slug: 'sinh-hoc-te-bao-3' }, remainingCoins: 200 } })
    expect(db.rpcCalls).toBe(3)
    expect(db.coins).toBe(200)
  })

  it('refuses your own tree, a private tree, a signed-out player and a bad id', async () => {
    fakeSupabase({ userId: OWNER, coins: 300, statements: 3 })
    expect(await cloneDeck({ deckId: SOURCE })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })

    fakeSupabase({ userId: VISITOR, coins: 300, statements: 3, isPublic: false })
    expect(await cloneDeck({ deckId: SOURCE })).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })

    fakeSupabase({ userId: null, coins: 300, statements: 3 })
    expect(await cloneDeck({ deckId: SOURCE })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })

    expect(await cloneDeck({ deckId: 'nope' })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
  })
})

describe('clone_deck migration contract', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260928000700_clone_deck.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('charges least(100 + n, 150) atomically and only from a sufficient purse', () => {
    expect(body).toMatch(/least\(100 \+ v_items, 150\)/)
    expect(body).toMatch(/coins >= v_cost/)
    expect(body).toMatch(/security definer/)
    expect(body).toMatch(/auth\.uid\(\)/)
  })

  it('clones only public trees of others, into a private copy, without progress', () => {
    expect(body).toMatch(/not v_source\.is_public/)
    expect(body).toMatch(/CANNOT_CLONE_OWN_DECK/)
    expect(body).toMatch(/v_source\.description, false, v_source\.tree_type/)
    expect(body).not.toMatch(/insert into public\.user_progress/)
    expect(body).toMatch(/revoke all on function public\.clone_deck\(uuid, text\) from public, anon/)
  })
})
