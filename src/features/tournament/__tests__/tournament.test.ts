import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/decks/server', () => ({ listDrillItems: vi.fn() }))
vi.mock('@/shared/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { listDrillItems } from '@/features/decks/server'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import { generateTraps } from '@/shared/lib/trapEngine'
import { tournamentAccess } from '@/shared/lib/visitor'
import {
  compareActive,
  compareHallOfFame,
  contestantName,
  formatPracticeDays,
  isGraduation,
  masteryPercentage,
  maxPoints,
  nextPracticeDays,
  rankBadge,
} from '../lib/scoring'
import { recordTournamentAnswer } from '../services/answers'

// ─── Scoring rules ──────────────────────────────────────────────────────────────────────────────

describe('mastery formula', () => {
  it('is achieved / (N × 5) × 100: 25 of 50 points is 50.00%', () => {
    expect(maxPoints(10)).toBe(50)
    expect(masteryPercentage(25, maxPoints(10))).toBe(50)
  })

  it('rounds to 2 decimals like NUMERIC(5,2), clamps to 0–100, and is null without statements', () => {
    expect(masteryPercentage(1, 15)).toBe(6.67)
    expect(masteryPercentage(60, 50)).toBe(100)
    expect(masteryPercentage(-3, 50)).toBe(0)
    expect(masteryPercentage(0, 0)).toBeNull()
  })

  it('graduates exactly at 100% (every statement at 5/5), never on an empty tree', () => {
    expect(isGraduation(50, 50)).toBe(true)
    expect(isGraduation(49, 50)).toBe(false)
    expect(isGraduation(0, 0)).toBe(false)
  })
})

describe('practice days', () => {
  it('counts a calendar day once, however many answers it holds', () => {
    expect(nextPracticeDays(1, '2026-09-29', '2026-09-29')).toEqual({ daysCount: 1, lastDay: '2026-09-29' })
  })

  it('adds one for a later day, even after a gap', () => {
    expect(nextPracticeDays(1, '2026-09-29', '2026-09-30')).toEqual({ daysCount: 2, lastDay: '2026-09-30' })
    expect(nextPracticeDays(2, '2026-09-30', '2026-10-15')).toEqual({ daysCount: 3, lastDay: '2026-10-15' })
  })

  it('ignores a clock that went back (another timezone, a wrong device clock)', () => {
    expect(nextPracticeDays(3, '2026-10-15', '2026-10-14')).toEqual({ daysCount: 3, lastDay: '2026-10-15' })
  })

  it('reads "X ngày luyện tập"', () => {
    expect(formatPracticeDays(4)).toBe('4 ngày luyện tập')
  })
})

describe('leaderboard order', () => {
  const at = (h: number) => `2026-09-29T${String(h).padStart(2, '0')}:00:00Z`

  it('Active Learners: higher mastery first', () => {
    const rows = [
      { id: 'low', masteryPercentage: 40, daysCount: 1, updatedAt: at(1) },
      { id: 'high', masteryPercentage: 80, daysCount: 9, updatedAt: at(2) },
    ]
    expect(rows.sort(compareActive).map((r) => r.id)).toEqual(['high', 'low'])
  })

  it('Active Learners: on equal mastery, fewer practice days rank ahead, then who got there first', () => {
    const rows = [
      { id: 'slow', masteryPercentage: 60, daysCount: 5, updatedAt: at(1) },
      { id: 'late', masteryPercentage: 60, daysCount: 2, updatedAt: at(9) },
      { id: 'fast', masteryPercentage: 60, daysCount: 2, updatedAt: at(3) },
      { id: 'none', masteryPercentage: null, daysCount: 1, updatedAt: at(0) },
    ]
    expect(rows.sort(compareActive).map((r) => r.id)).toEqual(['fast', 'late', 'slow', 'none'])
  })

  it('Bia Trạng Nguyên: fewest days first, then the earliest graduate', () => {
    const rows = [
      { id: 'b', daysCount: 4, graduatedAt: at(1) },
      { id: 'c', daysCount: 3, graduatedAt: at(8) },
      { id: 'a', daysCount: 3, graduatedAt: at(2) },
    ]
    expect(rows.sort(compareHallOfFame).map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('names contestants by profile name or pseudonym, and puts medals on the podium', () => {
    expect(contestantName('  Linh  ', 'u1')).toBe('Linh')
    expect(contestantName(null, 'u1')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    expect([1, 2, 3, 4].map(rankBadge)).toEqual(['🥇', '🥈', '🥉', '#4'])
  })
})

describe('tournamentAccess (who may compete)', () => {
  const open = { ownerId: 'host', isPublic: true, isTournamentOpen: true }

  it('lets a signed-in visitor compete on a public tree that hosts a tournament', () => {
    expect(tournamentAccess(open, 'visitor')).toBe('ok')
  })

  it('keeps out the host, signed-out readers, closed and private trees', () => {
    expect(tournamentAccess(open, 'host')).toBe('host')
    expect(tournamentAccess(open, null)).toBe('signed-out')
    expect(tournamentAccess({ ...open, isTournamentOpen: false }, 'visitor')).toBe('closed')
    expect(tournamentAccess({ ...open, isPublic: false }, 'visitor')).toBe('closed')
  })
})

// ─── recordTournamentAnswer (service + an in-memory record_tournament_answer) ──────────────────

const HOST = '11111111-1111-4111-8111-111111111111'
const LINH = '22222222-2222-4222-8222-222222222222'
const DECK = '33333333-3333-4333-8333-333333333333'
const itemId = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`

// Two drillable statements in one root (sibling subject swaps + tăng/giảm), one that isn't.
const ITEMS = [
  { id: itemId(1), nodeId: 'n1', nodeTitle: 'Bào quan', prompt: 'Bào quan', correctStmt: 'Ty thể sản sinh ATP.', trapRules: { negate: true } },
  {
    id: itemId(2),
    nodeId: 'n1',
    nodeTitle: 'Bào quan',
    prompt: 'Bào quan',
    correctStmt: 'Ribosome tổng hợp protein khi nhiệt độ tăng.',
    trapRules: { negate: true },
  },
  { id: itemId(3), nodeId: 'n2', nodeTitle: 'Khác', prompt: 'Khác', correctStmt: 'Xyz.', trapRules: {} },
].map((item, _i, all) => ({
  ...item,
  siblingStatements: all.filter((o) => o.nodeId === item.nodeId && o.id !== item.id).map((o) => o.correctStmt),
}))

type Participant = { id: string; deck_id: string; user_id: string; current_points: number; max_points: number; days_count: number; is_graduated: boolean; graduated_at: string | null; last_practiced_date: string }

// Mirrors record_tournament_answer() (migration 20260928000900) closely enough to test the service.
function fakeAdmin() {
  const db = { participants: [] as Participant[], levels: new Map<string, number>(), calls: [] as string[] }
  const admin = {
    rpc: async (fn: string, a: { p_user_id: string; p_deck_id: string; p_item_id: string; p_is_correct: boolean; p_day: string; p_drillable_item_ids: string[] }) => {
      db.calls.push(fn)
      if (fn !== 'record_tournament_answer') throw new Error(`unexpected rpc ${fn}`)
      if (!a.p_drillable_item_ids.includes(a.p_item_id)) return { data: null, error: { code: 'P0002', message: 'ITEM_NOT_FOUND' } }
      let p = db.participants.find((r) => r.deck_id === a.p_deck_id && r.user_id === a.p_user_id)
      const max = 5 * a.p_drillable_item_ids.length
      if (!p) {
        p = { id: `p${db.participants.length}`, deck_id: a.p_deck_id, user_id: a.p_user_id, current_points: 0, max_points: max, days_count: 1, is_graduated: false, graduated_at: null, last_practiced_date: a.p_day }
        db.participants.push(p)
      }
      if (p.is_graduated) return { data: null, error: { code: 'P0001', message: 'TOURNAMENT_GRADUATED' } }
      const key = `${p.id}:${a.p_item_id}`
      const prev = db.levels.get(key) ?? 0
      const level = a.p_is_correct ? Math.min(prev + 1, 5) : Math.max(prev - 1, 0)
      db.levels.set(key, level)
      const points = Math.min(
        a.p_drillable_item_ids.reduce((s, id) => s + (db.levels.get(`${p.id}:${id}`) ?? 0), 0),
        max,
      )
      const graduating = max > 0 && points >= max
      const days = nextPracticeDays(p.days_count, p.last_practiced_date, a.p_day)
      Object.assign(p, { current_points: points, max_points: max, days_count: days.daysCount, last_practiced_date: days.lastDay, is_graduated: graduating, graduated_at: graduating ? 'now' : null })
      return {
        data: [
          {
            mastery_level: level,
            previous_level: prev,
            current_points: points,
            max_points: max,
            mastery_percentage: masteryPercentage(points, max),
            days_count: p.days_count,
            is_graduated: graduating,
            just_graduated: graduating,
          },
        ],
        error: null,
      }
    },
  }
  vi.mocked(createAdminClient).mockReturnValue(admin as never)
  return db
}

// The player's own client: the service must never read or write anything else with it
// (in particular user_progress, practice_days and users stay untouched).
function fakeUserClient() {
  const touched: string[] = []
  const client = {
    from: (table: string) => {
      touched.push(table)
      throw new Error(`tournament must not touch ${table}`)
    },
    rpc: (fn: string) => {
      touched.push(fn)
      throw new Error(`tournament must not call ${fn} as the player`)
    },
  }
  return { client: client as never, touched }
}

function hostTree(deck: Partial<{ isPublic: boolean; isTournamentOpen: boolean; ownerId: string }> = {}) {
  vi.mocked(listDrillItems).mockResolvedValue({
    success: true,
    data: {
      deck: { id: DECK, slug: 'bao-quan', title: 'Bào quan', treeType: 'oak', ownerId: HOST, isPublic: true, isTournamentOpen: true, ...deck },
      nodes: [],
      items: ITEMS,
    },
  })
}

// The tag a question built with `seed` expects, and a wrong one.
function tagsFor(n: number, seed: string) {
  const item = ITEMS[n - 1]
  const traps = generateTraps(item.correctStmt, item.trapRules, seed, item.siblingStatements)
  if (!traps.ok) throw new Error('expected a drillable item')
  return { right: traps.correctTag, wrong: traps.choices.find((c) => c.tag !== traps.correctTag)!.tag }
}

const DAY1 = new Date('2026-09-29T03:00:00Z')
const DAY1_LATER = new Date('2026-09-29T15:00:00Z')
const DAY2 = new Date('2026-09-30T03:00:00Z')

async function answer(n: number, correct: boolean, now = DAY1, seed = 's1') {
  const { right, wrong } = tagsFor(n, seed)
  const { client } = fakeUserClient()
  return recordTournamentAnswer(client, LINH, { deckId: DECK, itemId: itemId(n), seed, tag: correct ? right : wrong, timeZone: 'UTC' }, now)
}

beforeEach(() => vi.clearAllMocks())

describe('recordTournamentAnswer', () => {
  it('grades on the server and moves only the tournament level (N = drillable statements)', async () => {
    hostTree()
    const db = fakeAdmin()
    const res = await answer(1, true)
    expect(res).toMatchObject({ success: true, data: { isCorrect: true, masteryLevel: 1, previousMasteryLevel: 0, currentPoints: 1, maxPoints: 10, masteryPercentage: 10, daysCount: 1 } })
    expect(db.calls).toEqual(['record_tournament_answer'])
  })

  it('never touches user_progress, practice_days or users (isolation)', async () => {
    hostTree()
    fakeAdmin()
    const { client, touched } = fakeUserClient()
    const { right } = tagsFor(1, 's1')
    const res = await recordTournamentAnswer(client, LINH, { deckId: DECK, itemId: itemId(1), seed: 's1', tag: right }, DAY1)
    expect(res.success).toBe(true)
    expect(touched).toEqual([])
  })

  it('a wrong pick drops the tournament level, never below 0', async () => {
    hostTree()
    fakeAdmin()
    await answer(1, true)
    expect(await answer(1, false)).toMatchObject({ success: true, data: { isCorrect: false, masteryLevel: 0, previousMasteryLevel: 1 } })
    expect(await answer(1, false)).toMatchObject({ success: true, data: { masteryLevel: 0 } })
  })

  it('counts practice days once per calendar day, not per answer', async () => {
    hostTree()
    fakeAdmin()
    await answer(1, true, DAY1)
    await answer(2, true, DAY1)
    expect(await answer(1, true, DAY1_LATER)).toMatchObject({ success: true, data: { daysCount: 1 } })
    expect(await answer(2, true, DAY2)).toMatchObject({ success: true, data: { daysCount: 2 } })
    expect(await answer(1, true, DAY2)).toMatchObject({ success: true, data: { daysCount: 2 } })
  })

  it('uses the contestant\'s local day: 23:30 in Hanoi on the 29th is already the 30th', async () => {
    hostTree()
    fakeAdmin()
    const { client } = fakeUserClient()
    const { right } = tagsFor(1, 's1')
    await recordTournamentAnswer(client, LINH, { deckId: DECK, itemId: itemId(1), seed: 's1', tag: right, timeZone: 'UTC' }, new Date('2026-09-29T10:00:00Z'))
    const res = await recordTournamentAnswer(
      client,
      LINH,
      { deckId: DECK, itemId: itemId(1), seed: 's1', tag: right, timeZone: 'Asia/Ho_Chi_Minh' },
      new Date('2026-09-29T17:30:00Z'),
    )
    expect(res).toMatchObject({ success: true, data: { daysCount: 2 } })
  })

  it('graduates automatically when every drillable statement reaches 5/5, then freezes the run', async () => {
    hostTree()
    fakeAdmin()
    for (let i = 0; i < 4; i++) {
      await answer(1, true)
      await answer(2, true)
    }
    await answer(1, true)
    const last = await answer(2, true, DAY2)
    expect(last).toMatchObject({
      success: true,
      data: { currentPoints: 10, maxPoints: 10, masteryPercentage: 100, isGraduated: true, justGraduated: true, daysCount: 2 },
    })
    expect(await answer(1, true, DAY2)).toMatchObject({ success: false, error: { code: 'TOURNAMENT_GRADUATED' } })
  })

  it('refuses the host, a closed tournament and a private tree before saving anything', async () => {
    const db = fakeAdmin()
    const { client } = fakeUserClient()
    const { right } = tagsFor(1, 's1')
    const pick = { deckId: DECK, itemId: itemId(1), seed: 's1', tag: right }

    hostTree()
    expect(await recordTournamentAnswer(client, HOST, pick)).toMatchObject({ success: false, error: { code: 'AUTH_FORBIDDEN' } })
    hostTree({ isTournamentOpen: false })
    expect(await recordTournamentAnswer(client, LINH, pick)).toMatchObject({ success: false, error: { code: 'TOURNAMENT_CLOSED' } })
    hostTree({ isPublic: false })
    expect(await recordTournamentAnswer(client, LINH, pick)).toMatchObject({ success: false, error: { code: 'TOURNAMENT_CLOSED' } })
    expect(db.calls).toEqual([])
  })

  it('refuses a statement the engine can\'t ask (it is not part of the tournament)', async () => {
    hostTree()
    const db = fakeAdmin()
    const { client } = fakeUserClient()
    const res = await recordTournamentAnswer(client, LINH, { deckId: DECK, itemId: itemId(3), seed: 's1', tag: 'A' })
    expect(res).toMatchObject({ success: false, error: { code: 'ITEM_NOT_FOUND' } })
    expect(db.calls).toEqual([])
  })
})

// ─── The migration says the same ───────────────────────────────────────────────────────────────

describe('migration 20260928000900_mind_tournament.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260928000900_mind_tournament.sql'), 'utf8')

  it('adds the hosting switch and both tables with RLS', () => {
    expect(sql).toMatch(/add column if not exists is_tournament_open boolean not null default false/i)
    expect(sql).toMatch(/alter table public\.deck_tournament_participants enable row level security/i)
    expect(sql).toMatch(/alter table public\.deck_tournament_item_progress enable row level security/i)
    expect(sql).toMatch(/round\(\(current_points::numeric \/ nullif\(max_points, 0\)\) \* 100, 2\)/i)
    expect(sql).toMatch(/constraint unique_deck_participant unique \(deck_id, user_id\)/i)
    expect(sql).toMatch(/mastery_level\s+integer not null default 0 check \(mastery_level between 0 and 5\)/i)
  })

  it('gives players read-only access; only the service role records answers', () => {
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to (anon|authenticated)/i)
    expect(sql).toMatch(/revoke all on function public\.record_tournament_answer\([^)]*\) from public, anon, authenticated;/i)
    expect(sql).toMatch(/grant execute on function public\.record_tournament_answer\([^)]*\) to service_role;/i)
  })

  it('counts a new calendar day once and graduates at max points', () => {
    expect(sql).toMatch(/days_count\s+= case when p_day > p\.last_practiced_date then p\.days_count \+ 1 else p\.days_count end/i)
    expect(sql).toMatch(/v_graduating := v_max > 0 and v_points >= v_max/i)
    expect(sql).toMatch(/raise exception 'TOURNAMENT_GRADUATED'/i)
  })

  it('orders both boards as specified and never returns an email', () => {
    expect(sql).toMatch(/order by p\.mastery_percentage desc nulls last, p\.days_count asc, p\.updated_at asc\s+limit 50/i)
    expect(sql).toMatch(/order by p\.days_count asc, p\.graduated_at asc;/i)
    expect(sql).not.toMatch(/u\.email/i)
  })

  it('never writes user_progress, practice_days or coins', () => {
    expect(sql).not.toMatch(/(insert into|update) public\.(user_progress|practice_days|users)\b/i)
  })
})
