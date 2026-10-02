import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/decks/server', () => ({ listDrillItems: vi.fn() }))
vi.mock('@/shared/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { listDrillItems } from '@/features/decks/server'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import { buildQuestion, prepareDeck, toDeckNote } from '@/shared/lib/questionEngine'
import { AnswerDailyRushDto, StartDailyRushDto } from '../dto/RushDto'
import {
  isUrgent,
  RUSH_CARD_MS,
  RUSH_LIMIT_MS,
  RUSH_MAX_STREAK,
  RUSH_SECONDS,
  RUSH_STALE_MS,
  RUSH_URGENT_SECONDS,
  rushCoins,
  rushHeadline,
  rushOrder,
  rushQuestionSeed,
} from '../lib/rules'
import { answerRush, loadRushStatus, startRush } from '../services/rush'

// ─── Rules ──────────────────────────────────────────────────────────────────────────────────────

describe('Daily Rush rules', () => {
  it('gives exactly 8 seconds a card, and beats in the last 3', () => {
    expect(RUSH_SECONDS).toBe(8)
    expect(RUSH_CARD_MS).toBe(8000)
    expect(RUSH_URGENT_SECONDS).toBe(3)
    expect(isUrgent(3001)).toBe(false)
    expect(isUrgent(3000)).toBe(true)
    expect(isUrgent(1)).toBe(true)
    expect(isUrgent(0)).toBe(false)
    // The server waits a little longer than the player's clock (network), and a run abandoned for
    // longer still is settled.
    expect(RUSH_LIMIT_MS).toBeGreaterThan(RUSH_CARD_MS)
    expect(RUSH_STALE_MS).toBeGreaterThan(RUSH_LIMIT_MS)
  })

  it('pays one coin per card answered in a row: 7 right answers = 7 coins', () => {
    expect(rushCoins(0)).toBe(0)
    expect(rushCoins(1)).toBe(1)
    expect(rushCoins(7)).toBe(7)
    expect(rushCoins(RUSH_MAX_STREAK)).toBe(RUSH_MAX_STREAK)
    expect(rushCoins(999)).toBe(RUSH_MAX_STREAK)
    expect(rushCoins(-4)).toBe(0)
    expect(rushCoins(Number.NaN)).toBe(0)
  })

  it('deals each statement at most once, in a seeded order that ignores database order', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `item-${i}`)
    const order = rushOrder(ids, 'seed-a')
    expect([...order].sort()).toEqual([...ids].sort())
    expect(rushOrder([...ids].reverse(), 'seed-a')).toEqual(order)
    expect(rushOrder(ids, 'seed-b')).not.toEqual(order)
    expect(rushOrder([...ids, ...ids], 'seed-a')).toEqual(order)
    // A big tree: the run stops at the cap.
    expect(rushOrder(Array.from({ length: 200 }, (_, i) => `i${i}`), 's')).toHaveLength(RUSH_MAX_STREAK)
  })

  it('gives every card its own question seed', () => {
    expect(rushQuestionSeed('a', 's', 0)).toBe(rushQuestionSeed('a', 's', 0))
    expect(rushQuestionSeed('a', 's', 0)).not.toBe(rushQuestionSeed('a', 's', 1))
    expect(rushQuestionSeed('a', 's', 0)).toMatch(/^[0-9a-z]{1,16}$/)
  })

  it('titles the result', () => {
    expect(rushHeadline('complete', 12)).toBe('Perfect rush!')
    expect(rushHeadline('timeout', 3)).toBe("Time's up!")
    expect(rushHeadline('wrong', 3)).toBe('Rush over!')
    expect(rushHeadline('wrong', 0)).toBe('So close!')
  })

  it('accepts only a pick (or a timeout) for a run: no verdict, no timing from the client', () => {
    expect(AnswerDailyRushDto.parse({ day: '2026-10-02', tag: 'B', isCorrect: true, elapsedMs: 10, streak: 99 })).toEqual({ day: '2026-10-02', tag: 'B' })
    expect(AnswerDailyRushDto.parse({ day: '2026-10-02', tag: null })).toEqual({ day: '2026-10-02', tag: null })
    expect(AnswerDailyRushDto.safeParse({ day: 'today', tag: 'A' }).success).toBe(false)
    expect(AnswerDailyRushDto.safeParse({ day: '2026-10-02', tag: 'E' }).success).toBe(false)
    expect(StartDailyRushDto.safeParse({ deckId: 'nope' }).success).toBe(false)
  })
})

// ─── The service against an in-memory database (the migration's semantics) ─────────────────────

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const DECK_2 = '55555555-5555-4555-8555-555555555555'
const itemId = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`

const FACTS = ['Ty thể sản sinh ATP.', 'Ribosome tổng hợp protein.', 'Lục lạp quang hợp.', 'Nhân chứa DNA.', 'Lysosome tiêu hóa.', 'Golgi đóng gói protein.', 'Màng tế bào bảo vệ.', 'Không bào dự trữ nước.']
const items = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: itemId(i + 1),
    nodeId: i % 2 === 0 ? 'n1' : 'n2',
    nodeTitle: i % 2 === 0 ? 'Bào quan' : 'Cấu trúc',
    prompt: i % 2 === 0 ? 'Bào quan' : 'Cấu trúc',
    correctStmt: FACTS[i % FACTS.length] + (i >= FACTS.length ? ` (${i})` : ''),
    trapRules: { negate: true },
    siblingStatements: [],
    path: [i % 2 === 0 ? 'Bào quan' : 'Cấu trúc'],
    ancestry: [i % 2 === 0 ? 'n1' : 'n2'],
  }))

type Run = { user_id: string; day: string; deck_id: string | null; seed: string; time_zone: string; streak: number; status: 'active' | 'finished'; coins: number; question_started_at: string }
const db = { runs: [] as Run[], coins: 300, now: new Date('2026-10-02T03:00:00Z'), owner: ME, tree: items(8), rpcs: [] as string[] }
const tick = (ms: number) => (db.now = new Date(db.now.getTime() + ms))

function install() {
  vi.mocked(listDrillItems).mockImplementation(async (_client, ref) => {
    const deckId = 'deckId' in ref ? ref.deckId : DECK
    return { success: true, data: { deck: { id: deckId, slug: 't', title: 'Tế bào', treeType: 'oak', ownerId: db.owner, isPublic: false, isTournamentOpen: false }, items: db.tree, nodes: [] }, meta: {} } as never
  })
  // The three functions of 20261008000000_daily_rush.sql.
  vi.mocked(createAdminClient).mockReturnValue({
    rpc: async (fn: string, a: Record<string, never>) => {
      db.rpcs.push(fn)
      if (fn === 'start_daily_rush') {
        if (db.owner !== a.p_user_id) return { data: null, error: { code: 'P0002', message: 'DECK_NOT_FOUND' } }
        if (db.runs.some((r) => r.user_id === a.p_user_id && r.day === a.p_day)) return { data: null, error: { code: 'P0001', message: 'RUSH_ALREADY_PLAYED' } }
        db.runs.push({ user_id: a.p_user_id, day: a.p_day, deck_id: a.p_deck_id, seed: a.p_seed, time_zone: a.p_time_zone, streak: 0, status: 'active', coins: 0, question_started_at: db.now.toISOString() })
        return { data: null, error: null }
      }
      if (fn === 'answer_daily_rush') {
        const run = db.runs.find((r) => r.user_id === a.p_user_id && r.day === a.p_day)
        if (!run || run.status !== 'active') return { data: null, error: { code: 'P0001', message: 'RUSH_NOT_ACTIVE' } }
        if (run.streak !== a.p_expected) return { data: null, error: { code: 'P0001', message: 'RUSH_OUT_OF_SYNC' } }
        const late = db.now.getTime() - new Date(run.question_started_at).getTime() > (a.p_limit_ms as number)
        let reason = 'complete'
        if (a.p_correct && !a.p_timed_out && !late) {
          run.streak += 1
          if (!a.p_last) {
            run.question_started_at = db.now.toISOString()
            return { data: [{ run_streak: run.streak, is_finished: false, outcome: 'correct', coins_earned: 0, total_coins: null }], error: null }
          }
        } else reason = late || a.p_timed_out ? 'timeout' : 'wrong'
        run.status = 'finished'
        run.coins = run.streak
        db.coins += run.streak
        return { data: [{ run_streak: run.streak, is_finished: true, outcome: reason, coins_earned: run.streak, total_coins: db.coins }], error: null }
      }
      if (fn === 'settle_daily_rush') {
        let paid = 0
        for (const run of db.runs) {
          if (run.user_id === a.p_user_id && run.status === 'active' && db.now.getTime() - new Date(run.question_started_at).getTime() > (a.p_stale_ms as number)) {
            run.status = 'finished'
            run.coins = run.streak
            paid += run.streak
          }
        }
        db.coins += paid
        return { data: paid, error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    },
  } as never)
}

// The player's own client: it can only read its runs (RLS), never write.
function client(userId = ME) {
  return {
    from: (table: string) => {
      if (table !== 'daily_rush_runs') throw new Error(`unexpected table ${table}`)
      const filters: Record<string, string> = {}
      const q = {
        select: () => q,
        eq: (k: string, v: string) => ((filters[k] = v), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const mine = db.runs.filter((r) => r.user_id === (filters.user_id ?? userId) && (!filters.day || r.day === filters.day)).sort((a, b) => b.day.localeCompare(a.day))
          return { data: mine[0] ? { ...mine[0] } : null, error: null }
        },
      }
      return q
    },
  } as never
}

// The right tag of the card the run is on, rebuilt the way the server does.
function rightTag(day: string): 'A' | 'B' | 'C' | 'D' {
  const run = db.runs.find((r) => r.day === day)!
  const deck = prepareDeck(db.tree.map(toDeckNote))
  const order = rushOrder(db.tree.map((i) => i.id), run.seed)
  const built = buildQuestion(deck, order[run.streak], rushQuestionSeed(order[run.streak], run.seed, run.streak))
  if (!built.ok) throw new Error('card not askable')
  return built.question.correctTag
}
const wrongTag = (day: string) => (['A', 'B', 'C', 'D'] as const).find((t) => t !== rightTag(day))!

const start = (deckId = DECK, userId = ME) => startRush(client(userId), userId, { deckId, timeZone: 'UTC' }, db.now)
const pick = (day: string, tag: 'A' | 'B' | 'C' | 'D' | null) => answerRush(client(), ME, { day, tag })

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(db, { runs: [], coins: 300, now: new Date('2026-10-02T03:00:00Z'), owner: ME, tree: items(8), rpcs: [] })
  install()
})

describe('starting the day\'s run', () => {
  it('deals the first card without its answer', async () => {
    const res = await start()
    expect(res).toMatchObject({ success: true, data: { day: '2026-10-02', total: 8, card: { index: 0 } } })
    if (!res.success) return
    expect(res.data.card.choices.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(res.data)).not.toMatch(/correctTag|correct_stmt/)
    expect(db.runs).toHaveLength(1)
  })

  it('allows strictly one run per calendar day, on one tree: a second start is refused on any tree', async () => {
    expect((await start()).success).toBe(true)
    expect(await start()).toMatchObject({ success: false, error: { code: 'RUSH_ALREADY_PLAYED' } })
    expect(await start(DECK_2)).toMatchObject({ success: false, error: { code: 'RUSH_ALREADY_PLAYED' } })
    expect(db.runs).toHaveLength(1)
    // The next calendar day brings a new run.
    tick(24 * 3600 * 1000)
    expect(await start(DECK_2)).toMatchObject({ success: true, data: { day: '2026-10-03' } })
  })

  it("uses the player's local day", async () => {
    // 03:00 UTC on 2 October is still 1 October in Los Angeles.
    const res = await startRush(client(), ME, { deckId: DECK, timeZone: 'America/Los_Angeles' }, db.now)
    expect(res).toMatchObject({ success: true, data: { day: '2026-10-01' } })
  })

  it("refuses someone else's tree and a tree without statements, using up nothing", async () => {
    db.owner = OTHER
    expect(await start()).toMatchObject({ success: false, error: { code: 'DECK_NOT_FOUND' } })
    db.owner = ME
    db.tree = []
    expect(await start()).toMatchObject({ success: false, error: { code: 'DRILL_NO_ITEMS' } })
    expect(db.runs).toHaveLength(0)
  })
})

describe('sudden death', () => {
  it('a right answer deals the next card and grows the streak; nothing is paid yet', async () => {
    const run = await start()
    if (!run.success) throw new Error('no run')
    tick(2000)
    const res = await pick(run.data.day, rightTag(run.data.day))
    expect(res).toMatchObject({ success: true, data: { isCorrect: true, streak: 1, finished: false, next: { index: 1 } } })
    expect(db.coins).toBe(300)
    expect(JSON.stringify(res.success && res.data.finished === false && res.data.next)).not.toContain('correctTag')
  })

  it('7 right answers then a wrong one: the run ends and pays exactly 7 coins, once', async () => {
    const run = await start()
    if (!run.success) throw new Error('no run')
    const day = run.data.day
    for (let i = 0; i < 7; i++) {
      tick(1500)
      expect(await pick(day, rightTag(day))).toMatchObject({ success: true, data: { streak: i + 1, finished: false } })
    }
    tick(1500)
    expect(await pick(day, wrongTag(day))).toMatchObject({ success: true, data: { isCorrect: false, finished: true, outcome: 'wrong', streak: 7, coinsEarned: 7, totalCoins: 307 } })
    expect(db.coins).toBe(307)
    expect(db.runs[0]).toMatchObject({ status: 'finished', streak: 7, coins: 7 })
    // The run is over: no further answer counts or pays.
    expect(await pick(day, 'A')).toMatchObject({ success: false, error: { code: 'RUSH_NOT_ACTIVE' } })
    expect(db.coins).toBe(307)
  })

  it('a wrong first answer ends the run with no coins', async () => {
    const run = await start()
    if (!run.success) throw new Error('no run')
    expect(await pick(run.data.day, wrongTag(run.data.day))).toMatchObject({ success: true, data: { finished: true, outcome: 'wrong', streak: 0, coinsEarned: 0, totalCoins: 300 } })
    expect(db.coins).toBe(300)
  })

  it("the player's clock running out (no pick) is game over", async () => {
    const run = await start()
    if (!run.success) throw new Error('no run')
    const day = run.data.day
    await pick(day, rightTag(day))
    await pick(day, rightTag(day))
    tick(8000)
    expect(await pick(day, null)).toMatchObject({ success: true, data: { isCorrect: false, finished: true, outcome: 'timeout', streak: 2, coinsEarned: 2 } })
    expect(db.coins).toBe(302)
  })

  it('the server\'s clock decides: a right pick that arrives after the limit is a timeout', async () => {
    const run = await start()
    if (!run.success) throw new Error('no run')
    const day = run.data.day
    tick(RUSH_LIMIT_MS + 1)
    expect(await pick(day, rightTag(day))).toMatchObject({ success: true, data: { isCorrect: false, finished: true, outcome: 'timeout', streak: 0, coinsEarned: 0 } })
    // Just inside the limit (the network grace) still counts.
    tick(24 * 3600 * 1000)
    const next = await start()
    if (!next.success) throw new Error('no run')
    tick(RUSH_LIMIT_MS - 1)
    expect(await pick(next.data.day, rightTag(next.data.day))).toMatchObject({ success: true, data: { isCorrect: true, streak: 1 } })
  })

  it('answering every card is a perfect rush: it pays the whole streak', async () => {
    db.tree = items(3)
    const run = await start()
    if (!run.success) throw new Error('no run')
    const day = run.data.day
    expect(run.data.total).toBe(3)
    await pick(day, rightTag(day))
    await pick(day, rightTag(day))
    expect(await pick(day, rightTag(day))).toMatchObject({ success: true, data: { isCorrect: true, finished: true, outcome: 'complete', streak: 3, coinsEarned: 3, totalCoins: 303 } })
  })

  it('never deals more than the cap, however big the tree', async () => {
    db.tree = items(60)
    const run = await start()
    expect(run).toMatchObject({ success: true, data: { total: RUSH_MAX_STREAK } })
  })

  it("can't be answered by someone else, or for a day without a run", async () => {
    const run = await start()
    if (!run.success) throw new Error('no run')
    expect(await answerRush(client(OTHER), OTHER, { day: run.data.day, tag: 'A' })).toMatchObject({ success: false, error: { code: 'RUSH_NOT_ACTIVE' } })
    expect(await pick('2026-09-30', 'A')).toMatchObject({ success: false, error: { code: 'RUSH_NOT_ACTIVE' } })
    expect(db.runs[0].status).toBe('active')
  })
})

describe('status: the button on every tree', () => {
  it('is ready before the run, used for the rest of the day, ready again tomorrow', async () => {
    expect(await loadRushStatus(client(), ME, db.now)).toEqual({ playedToday: false, lastRun: null })
    const run = await start()
    if (!run.success) throw new Error('no run')
    await pick(run.data.day, rightTag(run.data.day))
    await pick(run.data.day, wrongTag(run.data.day))
    expect(await loadRushStatus(client(), ME, db.now)).toEqual({ playedToday: true, lastRun: { day: '2026-10-02', streak: 1, coins: 1 } })
    tick(23 * 3600 * 1000) // 02:00 the next day
    expect(await loadRushStatus(client(), ME, db.now)).toMatchObject({ playedToday: false, lastRun: { streak: 1 } })
  })

  it('counts a run in progress as today\'s run, and reading the status writes nothing', async () => {
    await start()
    db.rpcs = []
    expect(await loadRushStatus(client(), ME, db.now)).toEqual({ playedToday: true, lastRun: null })
    expect(db.rpcs).toEqual([])
  })

  it('pays an abandoned run (tab closed mid-card) what it had, once', async () => {
    const run = await start()
    if (!run.success) throw new Error('no run')
    await pick(run.data.day, rightTag(run.data.day))
    await pick(run.data.day, rightTag(run.data.day))
    tick(RUSH_STALE_MS + 1)
    expect(await loadRushStatus(client(), ME, db.now)).toEqual({ playedToday: true, lastRun: { day: '2026-10-02', streak: 2, coins: 2 } })
    expect(db.coins).toBe(302)
    await loadRushStatus(client(), ME, db.now)
    expect(db.coins).toBe(302)
  })
})

// ─── The migration ─────────────────────────────────────────────────────────────────────────────

describe('migration 20261008000000_daily_rush.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261008000000_daily_rush.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('makes it one run per player per day by primary key, and refuses a second start', () => {
    expect(body).toMatch(/primary key \(user_id, day\)/)
    expect(body).toMatch(/on conflict \(user_id, day\) do nothing;\s*if not found then\s*raise exception 'RUSH_ALREADY_PLAYED'/)
    expect(body).toMatch(/v_owner <> p_user_id/)
  })

  it('caps the streak and the payout like the app', () => {
    expect(body).toContain(`check (streak between 0 and ${RUSH_MAX_STREAK})`)
    expect(body).toContain(`check (coins between 0 and ${RUSH_MAX_STREAK})`)
  })

  it('checks the time itself and pays the streak in the same transaction, under the run\'s lock', () => {
    expect(body).toMatch(/for update;/)
    expect(body).toMatch(/v_late := clock_timestamp\(\) - v_run\.question_started_at > make_interval\(secs => p_limit_ms \/ 1000\.0\)/)
    expect(body).toMatch(/set streak = v_streak, coins = v_streak, status = 'finished'/)
    expect(body).toMatch(/set coins = u\.coins \+ v_streak/)
    expect(body).toMatch(/v_run\.status <> 'active'/)
  })

  it('is service-role only, and players can read but never write their runs (RLS on)', () => {
    for (const fn of ['start_daily_rush(uuid, uuid, date, text, text)', 'answer_daily_rush(uuid, date, integer, boolean, boolean, boolean, integer)', 'settle_daily_rush(uuid, integer)']) {
      expect(body).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`)
      expect(body).toContain(`grant execute on function public.${fn} to service_role;`)
    }
    expect(body).toContain('alter table public.daily_rush_runs enable row level security;')
    expect(body).toContain('revoke insert, update, delete on public.daily_rush_runs from anon, authenticated;')
    expect(body).toMatch(/create policy "daily_rush_runs: read own"[\s\S]*?\(select auth\.uid\(\)\) = user_id/)
  })

  it('stores one row per day, not one per answer', () => {
    expect((body.match(/create table/g) ?? []).length).toBe(1)
    expect(body).not.toMatch(/insert into public\.daily_rush_runs[\s\S]*insert into public\.daily_rush_runs/)
  })
})

describe('the ⚡ button and the play screen', () => {
  const dialog = readFileSync(join(process.cwd(), 'src/features/garden/components/FarmPlotDialog.tsx'), 'utf8')
  const arena = readFileSync(join(process.cwd(), 'src/features/rush/components/DailyRushArena.tsx'), 'utf8')
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

  it('sits beside Water Tree: fiery and pulsing when ready, grey "See you tomorrow" when played', () => {
    expect(dialog).toMatch(/Water Tree[\s\S]{0,400}rushPlayed === true/)
    expect(dialog).toContain('⚡ Daily Rush')
    expect(dialog).toContain('bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white')
    expect(dialog).toMatch(/disabled title="[^"]*See you tomorrow!"[^>]*bg-stone-300/)
    expect(dialog).toMatch(/>\s*See you tomorrow\s*</)
    // No countdown to the next run anywhere.
    expect(dialog).not.toMatch(/setInterval|countdown/i)
  })

  it('starts the run only on the Start button, never by rendering', () => {
    expect(arena).toMatch(/const start = \(\) => \{[\s\S]*?startDailyRush\(/)
    expect(arena).toMatch(/onClick=\{start\}/)
    expect(arena).not.toMatch(/useEffect\([^)]*startDailyRush/)
  })

  it('runs the clock for everyone, and keeps beat, flash and pulse to transform / opacity', () => {
    for (const name of ['mg-rush-timer', 'mg-rush-heat', 'mg-rush-beat', 'mg-rush-flash', 'mg-rush-pulse']) {
      const frames = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css)
      expect(frames, name).not.toBeNull()
      for (const [, property] of frames![1].matchAll(/([a-z-]+)\s*:/g)) expect(['transform', 'opacity'], `${name} animates ${property}`).toContain(property)
    }
    // The clock is information: it is not switched off for reduced motion.
    expect(css).toMatch(/\n\.mg-rush-timer \{ animation: mg-rush-timer/)
    // The decorations are.
    for (const name of ['mg-rush-beat', 'mg-rush-flash', 'mg-rush-pulse']) expect(css).toMatch(new RegExp(`\\n  \\.${name} \\{ animation:`))
  })
})
