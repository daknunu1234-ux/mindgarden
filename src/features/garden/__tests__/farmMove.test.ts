import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { moveFarmPlacement } from '../actions/moveFarmPlacement'
import { treeBuff } from '../lib/farmBuffs'
import { checkMove, fenceLinks, streamLinks, withMoved, type Placement } from '../lib/farmGrid'

const ME = '11111111-1111-4111-8111-111111111111'
const ITEM = '33333333-3333-4333-8333-333333333333'

const at = (id: string, itemType: Placement['itemType'], x: number, y: number, size = 1): Placement => ({
  id,
  itemType,
  deckId: itemType === 'tree' ? `deck-${id}` : null,
  x,
  y,
  width: size,
  height: size,
  variant: null,
})

describe('checkMove / withMoved', () => {
  const farm = [at('house', 'farmer_house', 4, 4, 2), at('tree', 'tree', 7, 4), at('rock', 'rockery', 4, 7)]

  it('lets a 2 × 2 shuffle one tile over its own footprint', () => {
    expect(checkMove(farm, 'house', { x: 5, y: 5 })).toBe('ok')
    expect(checkMove(farm, 'house', { x: 3, y: 3 })).toBe('ok')
    expect(checkMove(farm, 'house', { x: 4, y: 4 })).toBe('ok')
  })

  it('refuses spots on something else or off the grid, and unknown items', () => {
    expect(checkMove(farm, 'house', { x: 6, y: 4 })).toBe('occupied')
    expect(checkMove(farm, 'house', { x: 4, y: 6 })).toBe('occupied')
    expect(checkMove(farm, 'house', { x: 15, y: 3 })).toBe('out-of-bounds')
    expect(checkMove(farm, 'tree', { x: 15, y: 15 })).toBe('ok')
    expect(checkMove(farm, 'nope', { x: 0, y: 0 })).toBe('occupied')
  })

  it('moves one placement without touching the others or the input', () => {
    const moved = withMoved(farm, 'tree', { x: 1, y: 2 })
    expect(moved.find((p) => p.id === 'tree')).toMatchObject({ x: 1, y: 2, width: 1 })
    expect(farm.find((p) => p.id === 'tree')).toMatchObject({ x: 7, y: 4 })
    expect(moved.filter((p) => p.id !== 'tree')).toEqual(farm.filter((p) => p.id !== 'tree'))
  })

  it('retiles streams and fences at both the old and the new spot', () => {
    const river = [at('a', 'stream', 2, 2), at('b', 'stream', 3, 2), at('c', 'stream', 3, 5)]
    const after = withMoved(river, 'b', { x: 3, y: 4 })
    // Old spot: 'a' loses its east arm. New spot: 'b' now joins 'c' to the south.
    expect(streamLinks(river, { x: 2, y: 2 }).east).toBe(true)
    expect(streamLinks(after, { x: 2, y: 2 }).east).toBe(false)
    expect(streamLinks(after, { x: 3, y: 5 }).north).toBe(true)
    const fences = withMoved([at('f1', 'fence', 5, 5), at('f2', 'fence', 8, 8)], 'f2', { x: 6, y: 5 })
    expect(fenceLinks(fences, { x: 5, y: 5 }).east).toBe(true)
  })

  it('moves the buffs with it: a stream moved beside a tree gives ×1.2, moved away takes it back', () => {
    const farmWithStream = [at('t', 'tree', 5, 5), at('s', 'stream', 9, 9)]
    expect(treeBuff(5, 5, farmWithStream).multiplier).toBe(1)
    expect(treeBuff(5, 5, withMoved(farmWithStream, 's', { x: 5, y: 6 })).multiplier).toBe(1.2)
  })
})

// Fake move_garden_placement(): records the call and answers like the SQL.
function fakeSupabase(viewer: string | null, answer: { error?: string } = {}) {
  const calls: Record<string, unknown>[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'move_garden_placement') throw new Error(`unexpected rpc ${fn}`)
      calls.push(args)
      if (answer.error) return { data: null, error: { code: 'P0001', message: answer.error } }
      return { data: [{ placement_id: args.p_placement_id, grid_x: args.p_new_x, grid_y: args.p_new_y }], error: null }
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return { calls }
}

beforeEach(() => vi.clearAllMocks())

describe('moveFarmPlacement', () => {
  it('moves your item through move_garden_placement and refreshes the farm', async () => {
    const { calls } = fakeSupabase(ME)
    expect(await moveFarmPlacement({ placementId: ITEM, x: 3, y: 9 })).toEqual({ success: true, data: { id: ITEM, x: 3, y: 9 } })
    expect(calls).toEqual([{ p_placement_id: ITEM, p_new_x: 3, p_new_y: 9 }])
    // No page re-render: the farm shows the change optimistically (a revalidate would cost seconds).
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a taken tile and something that is not yours', async () => {
    fakeSupabase(ME, { error: 'TILE_UNAVAILABLE' })
    expect(await moveFarmPlacement({ placementId: ITEM, x: 3, y: 9 })).toMatchObject({ success: false, error: { code: 'TILE_UNAVAILABLE' } })
    fakeSupabase(ME, { error: 'PLACEMENT_NOT_FOUND' })
    expect(await moveFarmPlacement({ placementId: ITEM, x: 3, y: 9 })).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('validates before any query, and needs a signed-in gardener', async () => {
    const { calls } = fakeSupabase(ME)
    for (const bad of [
      { placementId: 'nope', x: 1, y: 1 },
      { placementId: ITEM, x: 16, y: 1 },
      { placementId: ITEM, x: 1, y: -1 },
      { placementId: ITEM, x: 1.5, y: 1 },
      { placementId: ITEM },
    ]) {
      expect(await moveFarmPlacement(bad)).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } })
    }
    expect(calls).toEqual([])
    const out = fakeSupabase(null)
    expect(await moveFarmPlacement({ placementId: ITEM, x: 1, y: 1 })).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(out.calls).toEqual([])
  })
})

describe('migration 20261002000000_move_garden_placement.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261002000000_move_garden_placement.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('moves only your own placement, inside the grid, clear of everything but itself', () => {
    expect(body).toMatch(/where g\.id = p_placement_id and g\.user_id = v_user/)
    expect(body).toMatch(/p_new_x \+ v_w > 16 or p_new_y \+ v_h > 16/)
    expect(body).toMatch(/g\.id <> p_placement_id/)
    expect(body).toMatch(/g\.grid_x < p_new_x \+ v_w and p_new_x < g\.grid_x \+ g\.width/)
    expect(body).toMatch(/perform 1 from public\.users u where u\.id = v_user for update/)
  })

  it('is callable by signed-in players only, and still grants no direct UPDATE', () => {
    expect(body).toMatch(/security definer/)
    expect(body).toMatch(/revoke all on function public\.move_garden_placement\(uuid, integer, integer\) from public, anon;/)
    expect(body).toMatch(/grant execute on function public\.move_garden_placement\(uuid, integer, integer\) to authenticated, service_role;/)
    expect(body).not.toMatch(/grant update/i)
  })
})
