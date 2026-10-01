import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny practice_days table + purse, shared by the player's client and the service-role client.
type Day = { user_id: string; day: string; time_zone: string }
const db = { days: [] as Day[], coins: 300, adminWrites: 0, upserts: [] as { row: Day; options: unknown }[], rpc: vi.fn() }

vi.mock('@/shared/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: db.rpc,
    from: (table: string) => ({
      // ON CONFLICT (user_id, day) DO NOTHING: the day's first watering inserts, later ones don't.
      upsert: async (row: Day, options: unknown) => {
        db.adminWrites += 1
        db.upserts.push({ row, options })
        if (table === 'practice_days' && !db.days.some((d) => d.user_id === row.user_id && d.day === row.day)) db.days.push(row)
        return { error: null }
      },
      update: () => ({
        eq: async () => {
          db.adminWrites += 1
          return { error: null }
        },
      }),
    }),
  }),
}))

import { nextStreakReward, streakReward } from '../lib/streak'
import { claimStreakReward } from '../services/coins'
import { loadFarmHud } from '../services/farmHud'
import { recordPracticeDay } from '../services/streak'

const ME = 'me'

// The player's own client: it can only read. Any write would throw and fail the test.
function readOnlyClient() {
  const refuse = () => {
    throw new Error('a read-only path tried to write')
  }
  return {
    rpc: refuse,
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: db.days.filter((d) => d.user_id === ME).sort((a, b) => b.day.localeCompare(a.day)), error: null }),
        maybeSingle: async () => ({ data: table === 'users' ? { coins: db.coins } : null, error: null }),
        insert: refuse,
        upsert: refuse,
        update: refuse,
        delete: refuse,
      }
      return q
    },
  } as never
}

const at = (day: string) => vi.setSystemTime(new Date(`${day}T10:00:00Z`))
const water = () => recordPracticeDay(readOnlyClient(), ME, 'UTC')
const seed = (...days: string[]) => (db.days = days.map((day) => ({ user_id: ME, day, time_zone: 'UTC' })))

beforeEach(() => {
  vi.useFakeTimers()
  db.days = []
  db.coins = 300
  db.adminWrites = 0
  db.upserts = []
  db.rpc.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('the streak grows only by watering a tree', () => {
  it('opening the game (the header / farm load) reads the streak and never bumps it', async () => {
    seed('2026-10-01', '2026-10-02', '2026-10-03')
    at('2026-10-04')
    // Visiting `/` runs the layout's and the page's getFarmHud → loadFarmHud, several times over.
    for (let visit = 0; visit < 3; visit++) {
      const hud = await loadFarmHud(readOnlyClient(), ME)
      expect(hud).toMatchObject({ success: true, data: { coins: 300, streak: { current: 3, practicedToday: false, lastDay: '2026-10-03' } } })
    }
    expect(db.days).toHaveLength(3)
    expect(db.adminWrites).toBe(0)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it("the day's first watering adds the day; watering more trees that day changes nothing", async () => {
    seed('2026-10-01', '2026-10-02', '2026-10-03')
    at('2026-10-04')
    expect(await water()).toMatchObject({ success: true, data: { current: 4, practicedToday: true } })
    expect(await water()).toMatchObject({ success: true, data: { current: 4, practicedToday: true } })
    expect(await water()).toMatchObject({ success: true, data: { current: 4 } })
    expect(db.days.filter((d) => d.day === '2026-10-04')).toHaveLength(1)
    // Idempotent at the database too: every write is an insert-if-absent on (user_id, day).
    for (const u of db.upserts) expect(u.options).toEqual({ onConflict: 'user_id,day', ignoreDuplicates: true })
  })

  it('grows by one on the next day and restarts at 1 after a missed day', async () => {
    at('2026-10-01')
    expect(await water()).toMatchObject({ data: { current: 1 } })
    at('2026-10-02')
    expect(await water()).toMatchObject({ data: { current: 2 } })
    // 2026-10-03 is skipped: nothing watered.
    at('2026-10-04')
    expect(await loadFarmHud(readOnlyClient(), ME)).toMatchObject({ data: { streak: { current: 0, best: 2 } } })
    expect(await water()).toMatchObject({ data: { current: 1, best: 2, practicedToday: true } })
  })
})

describe('streakReward', () => {
  it('pays exactly the streak on 7, 30 and every 100 days', () => {
    expect(streakReward(7)).toBe(7)
    expect(streakReward(30)).toBe(30)
    expect(streakReward(100)).toBe(100)
    expect(streakReward(200)).toBe(200)
    expect(streakReward(300)).toBe(300)
    expect(streakReward(1000)).toBe(1000)
  })

  it('pays nothing on every other day', () => {
    for (const day of [0, 1, 2, 6, 8, 14, 29, 31, 50, 70, 99, 101, 150, 199, 201, 365]) expect(streakReward(day)).toBe(0)
    for (const odd of [-7, 7.5, Number.NaN]) expect(streakReward(odd)).toBe(0)
    // Only 7, 30 and the hundreds pay in the first 1000 days.
    const paying = Array.from({ length: 1000 }, (_, i) => i + 1).filter((d) => streakReward(d) > 0)
    expect(paying).toEqual([7, 30, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
  })

  it('names the next bonus for the header tooltip', () => {
    expect(nextStreakReward(0)).toEqual({ streak: 7, coins: 7 })
    expect(nextStreakReward(6)).toEqual({ streak: 7, coins: 7 })
    expect(nextStreakReward(7)).toEqual({ streak: 30, coins: 30 })
    expect(nextStreakReward(30)).toEqual({ streak: 100, coins: 100 })
    expect(nextStreakReward(100)).toEqual({ streak: 200, coins: 200 })
    expect(nextStreakReward(250)).toEqual({ streak: 300, coins: 300 })
  })
})

describe('claimStreakReward (service role)', () => {
  const pays = (streak: number, total: number) => db.rpc.mockResolvedValue({ data: [{ streak, coins_earned: streakReward(streak), total_coins: total }], error: null })

  it('credits the exact bonus on milestone days, for the day that was watered', async () => {
    for (const streak of [7, 30, 100, 200]) {
      db.rpc.mockReset()
      pays(streak, 300 + streak)
      expect(await claimStreakReward(ME, { current: streak, practicedToday: true }, '2026-10-04')).toEqual({ streak, coinsEarned: streak, totalCoins: 300 + streak })
      expect(db.rpc).toHaveBeenCalledExactlyOnceWith('award_streak_reward', { p_user_id: ME, p_day: '2026-10-04' })
    }
  })

  it('makes no call and pays nothing on days like 1, 6, 8, 29, 31, 99', async () => {
    for (const streak of [1, 6, 8, 29, 31, 99]) {
      expect(await claimStreakReward(ME, { current: streak, practicedToday: true }, '2026-10-04')).toBeNull()
    }
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('never pays for a streak that was not watered today', async () => {
    expect(await claimStreakReward(ME, { current: 7, practicedToday: false }, '2026-10-04')).toBeNull()
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('reports 0 when the day was already paid (watering another tree that day)', async () => {
    db.rpc.mockResolvedValue({ data: [{ streak: 7, coins_earned: 0, total_coins: 307 }], error: null })
    expect(await claimStreakReward(ME, { current: 7, practicedToday: true }, '2026-10-04')).toEqual({ streak: 7, coinsEarned: 0, totalCoins: 307 })
  })

  it('never fails the answer: a database error or a missing migration pays nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    expect(await claimStreakReward(ME, { current: 30, practicedToday: true }, '2026-10-04')).toBeNull()
    spy.mockRestore()
  })
})

describe('migration 20261004000000_streak_rewards.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261004000000_streak_rewards.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('applies the same rule as streakReward', () => {
    expect(body).toMatch(/when v_streak = 7 then 7/)
    expect(body).toMatch(/when v_streak = 30 then 30/)
    expect(body).toMatch(/when v_streak >= 100 and v_streak % 100 = 0 then v_streak/)
    expect(body).toMatch(/else 0/)
  })

  it('counts the streak itself from practice_days and pays a day once', () => {
    expect(body).toMatch(/from public\.practice_days p/)
    expect(body).not.toMatch(/p_streak/) // the app never tells the database how long the streak is
    expect(body).toMatch(/primary key \(user_id, day\)/)
    expect(body).toMatch(/on conflict \(user_id, day\) do nothing/)
    expect(body).toMatch(/for update/)
  })

  it('is service-role only, and players can read but never write the ledger (RLS on)', () => {
    expect(body).toMatch(/revoke all on function public\.award_streak_reward\(uuid, date\) from public, anon, authenticated;/)
    expect(body).toMatch(/grant execute on function public\.award_streak_reward\(uuid, date\) to service_role;/)
    expect(body).toContain('alter table public.streak_rewards enable row level security;')
    expect(body).toContain('revoke insert, update, delete on public.streak_rewards from anon, authenticated;')
    expect(body).toMatch(/create policy "streak_rewards: read own"[\s\S]*?\(select auth\.uid\(\)\) = user_id/)
  })
})
