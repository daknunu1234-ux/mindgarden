import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FRUIT_COINS } from '@/shared/lib/economy'
import { previousDay } from '@/shared/lib/localDay'

const rpc = vi.fn()
vi.mock('@/shared/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))

import { summarizeDeckProgress } from '../lib/deckProgress'
import { harvestFruit, readRipeTrees, ripeTrees } from '../services/fruit'

beforeEach(() => rpc.mockReset())

describe('which trees bear fruit today', () => {
  it('practised yesterday and not harvested today', () => {
    expect([...ripeTrees(['a', 'b', 'c'], ['b'])].sort()).toEqual(['a', 'c'])
    expect(ripeTrees([], ['a']).size).toBe(0)
  })

  it('“yesterday” is the calendar day before, across months and years', () => {
    expect(previousDay('2026-10-05')).toBe('2026-10-04')
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(previousDay('2028-03-01')).toBe('2028-02-29')
    expect(previousDay('2027-01-01')).toBe('2026-12-31')
  })

  it('reads yesterday’s practice and today’s harvests for the player only', async () => {
    const calls: { table: string; filters: Record<string, unknown> }[] = []
    const client = {
      from: (table: string) => {
        const filters: Record<string, unknown> = {}
        const q = {
          select: () => q,
          eq: (k: string, v: unknown) => ((filters[k] = v), q),
          in: (k: string, v: unknown) => {
            filters[k] = v
            calls.push({ table, filters })
            return Promise.resolve({ data: table === 'deck_practice_days' ? [{ deck_id: 'a' }, { deck_id: 'b' }] : [{ deck_id: 'b' }], error: null })
          },
        }
        return q
      },
    }
    const ripe = await readRipeTrees(client as never, 'me', ['a', 'b', 'c'], '2026-10-05')
    expect([...ripe]).toEqual(['a'])
    expect(calls.find((c) => c.table === 'deck_practice_days')?.filters).toMatchObject({ user_id: 'me', day: '2026-10-04' })
    expect(calls.find((c) => c.table === 'tree_harvests')?.filters).toMatchObject({ user_id: 'me', day: '2026-10-05' })
  })

  it('shows no fruit before the migration (or on any read error) instead of failing', async () => {
    const failing = {
      from: () => {
        const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'missing' } }) }
        return q
      },
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await readRipeTrees(failing as never, 'me', ['a'], '2026-10-05')).size).toBe(0)
    spy.mockRestore()
  })
})

describe('harvestFruit (service role)', () => {
  it('pays FRUIT_COINS through harvest_tree_fruit with the server-computed day', async () => {
    rpc.mockResolvedValue({ data: [{ coins_earned: FRUIT_COINS, total_coins: 302 }], error: null })
    expect(await harvestFruit('me', 'deck-1', '2026-10-05')).toEqual({ success: true, data: { coinsEarned: 2, totalCoins: 302 } })
    expect(rpc).toHaveBeenCalledWith('harvest_tree_fruit', { p_user_id: 'me', p_deck_id: 'deck-1', p_today: '2026-10-05' })
  })

  it('answers FRUIT_NOT_READY (not practised yesterday / already harvested) and DECK_NOT_FOUND', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'FRUIT_NOT_READY' } })
    expect(await harvestFruit('me', 'd', '2026-10-05')).toMatchObject({ success: false, error: { code: 'FRUIT_NOT_READY' } })
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'DECK_NOT_FOUND' } })
    expect(await harvestFruit('me', 'd', '2026-10-05')).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
  })
})

describe('deck progress carries what the farm needs', () => {
  it('the newest practice timestamp (withering) and whether fruit is ready', () => {
    const rows = new Map([
      ['i1', { level: 2, lastPracticedAt: '2026-10-01T08:00:00Z' }],
      ['i2', { level: 1, lastPracticedAt: '2026-10-03T08:00:00Z' }],
    ])
    const items = [
      { itemId: 'i1', nodeId: 'n' },
      { itemId: 'i2', nodeId: 'n' },
    ]
    const clock = { today: '2026-10-05', timeZone: 'UTC' }
    expect(summarizeDeckProgress('d1', items, rows, clock, new Set(['d1']))).toMatchObject({ lastPracticedAt: '2026-10-03T08:00:00Z', fruitReady: true })
    expect(summarizeDeckProgress('d2', items, rows, clock)).toMatchObject({ fruitReady: false })
    expect(summarizeDeckProgress('d3', [], new Map(), clock)).toMatchObject({ lastPracticedAt: null, fruitReady: false })
  })
})

describe('migration 20261003000000_tree_fruit.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261003000000_tree_fruit.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('pays the same amount as the app (FRUIT_COINS)', () => {
    expect(body).toContain(`v_fruit constant integer := ${FRUIT_COINS};`)
  })

  it('pays only for a tree of yours practised the day before, once per tree per day', () => {
    expect(body).toMatch(/v_owner <> p_user_id/)
    expect(body).toMatch(/p\.day = p_today - 1/)
    expect(body).toMatch(/primary key \(user_id, deck_id, day\)/)
    expect(body).toMatch(/on conflict \(user_id, deck_id, day\) do nothing/)
    expect(body).toMatch(/FRUIT_NOT_READY/)
  })

  it('is service-role only, and players can read but never write the new tables (RLS on)', () => {
    expect(body).toMatch(/revoke all on function public\.harvest_tree_fruit\(uuid, uuid, date\) from public, anon, authenticated;/)
    expect(body).toMatch(/grant execute on function public\.harvest_tree_fruit\(uuid, uuid, date\) to service_role;/)
    for (const table of ['deck_practice_days', 'tree_harvests']) {
      expect(body).toContain(`alter table public.${table} enable row level security;`)
      expect(body).toContain(`revoke insert, update, delete on public.${table} from anon, authenticated;`)
      expect(body).toMatch(new RegExp(`create policy "${table}: read own"[\\s\\S]*?\\(select auth\\.uid\\(\\)\\) = user_id`))
    }
  })
})
