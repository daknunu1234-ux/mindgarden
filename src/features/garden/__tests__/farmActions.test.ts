import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { placeFarmItem } from '../actions/placeFarmItem'
import { removeFarmPlacement } from '../actions/removeFarmPlacement'

const ME = '11111111-1111-4111-8111-111111111111'
const DECK = '22222222-2222-4222-8222-222222222222'
const ITEM = '33333333-3333-4333-8333-333333333333'

// Fake purchase_and_place_item(): records the call and answers like the SQL (catalogue prices).
function fakeSupabase(viewer: string | null, { coins = 100, taken = false, owned = true, isTree = false } = {}) {
  const calls: Record<string, unknown>[] = []
  const deletes: unknown[] = []
  const excluded: [string, unknown][] = []
  const prices: Record<string, number> = { tree: 0, windmill_small: 60, windmill_large: 100, furniture_factory: 120, seaport: 150, stream: 5, fence: 1, rockery: 2, animal: 5 }
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'purchase_and_place_item') throw new Error(`unexpected rpc ${fn}`)
      calls.push(args)
      const cost = prices[args.p_item_type as string]
      if (taken) return { data: null, error: { code: 'P0001', message: 'TILE_UNAVAILABLE' } }
      if (coins < cost) return { data: null, error: { code: 'P0001', message: 'INSUFFICIENT_COINS' } }
      return { data: [{ placement_id: 'new', remaining_coins: coins - cost, cost }], error: null }
    },
    from: () => {
      const q = {
        delete: () => q,
        eq: (col: string, value: unknown) => {
          if (col === 'id') deletes.push(value)
          return q
        },
        neq: (col: string, value: unknown) => {
          excluded.push([col, value])
          return q
        },
        // Like the database: a tree row never matches the delete's item_type filter.
        select: async () => ({ data: owned && !(isTree && excluded.some(([c, v]) => c === 'item_type' && v === 'tree')) ? [{ id: ITEM }] : [], error: null }),
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return { calls, deletes }
}

beforeEach(() => vi.clearAllMocks())

describe('placeFarmItem', () => {
  it('buys a shop item at the catalogue price (the client never sends a price)', async () => {
    const { calls } = fakeSupabase(ME, { coins: 100 })
    expect(await placeFarmItem({ item: 'windmill_small', x: 3, y: 4, price: 0, cost: 0 })).toEqual({
      success: true,
      data: { placementId: 'new', remainingCoins: 40, cost: 60 },
    })
    expect(calls).toEqual([{ p_item_type: 'windmill_small', p_x: 3, p_y: 4, p_deck_id: null, p_variant: null }])
    // No page re-render: the farm shows the change optimistically (a revalidate would cost seconds).
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('no longer sells the retired Farmer’s House and Woodshop (refused before any call)', async () => {
    const { calls } = fakeSupabase(ME, { coins: 500 })
    for (const item of ['farmer_house', 'woodshop']) {
      expect(await placeFarmItem({ item, x: 3, y: 4 })).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect(calls).toEqual([])
  })

  it('sends animals as item type animal with their variant, and plants trees for free', async () => {
    const { calls } = fakeSupabase(ME)
    await placeFarmItem({ item: 'pig', x: 1, y: 1 })
    await placeFarmItem({ item: 'tree', deckId: DECK, x: 2, y: 2 })
    expect(calls).toEqual([
      { p_item_type: 'animal', p_x: 1, p_y: 1, p_deck_id: null, p_variant: 'pig' },
      { p_item_type: 'tree', p_x: 2, p_y: 2, p_deck_id: DECK, p_variant: null },
    ])
  })

  it('reports a short purse and a taken tile', async () => {
    fakeSupabase(ME, { coins: 3 })
    expect(await placeFarmItem({ item: 'stream', x: 1, y: 1 })).toMatchObject({ success: false, error: { code: 'INSUFFICIENT_COINS' } })
    fakeSupabase(ME, { taken: true })
    expect(await placeFarmItem({ item: 'fence', x: 1, y: 1 })).toMatchObject({ success: false, error: { code: 'TILE_UNAVAILABLE' } })
  })

  it('validates before any query: unknown items, off-grid tiles, a tree without its deck, signed out', async () => {
    const { calls } = fakeSupabase(ME)
    for (const bad of [
      { item: 'castle', x: 1, y: 1 },
      { item: 'fence', x: 16, y: 1 },
      { item: 'fence', x: -1, y: 1 },
      { item: 'tree', x: 1, y: 1 },
      { item: 'fence', x: 1.5, y: 1 },
    ]) {
      expect(await placeFarmItem(bad)).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect(calls).toEqual([])
    const out = fakeSupabase(null)
    expect(await placeFarmItem({ item: 'fence', x: 1, y: 1 })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(out.calls).toEqual([])
  })
})

describe('removeFarmPlacement', () => {
  it('picks up your own item', async () => {
    const { deletes } = fakeSupabase(ME)
    expect(await removeFarmPlacement({ placementId: ITEM })).toEqual({ success: true, data: { id: ITEM } })
    expect(deletes).toEqual([ITEM])
  })

  it('never takes a planted tree off the farm: trees are moved or chopped', async () => {
    fakeSupabase(ME, { isTree: true })
    expect(await removeFarmPlacement({ placementId: ITEM })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
  })

  it("refuses someone else's item (0 rows) and signed-out players", async () => {
    fakeSupabase(ME, { owned: false })
    expect(await removeFarmPlacement({ placementId: ITEM })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    const out = fakeSupabase(null)
    expect(await removeFarmPlacement({ placementId: ITEM })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(out.deletes).toEqual([])
  })
})
