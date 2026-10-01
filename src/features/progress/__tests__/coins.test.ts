import { beforeEach, describe, expect, it, vi } from 'vitest'
import { freshestCoins } from '@/shared/stores/CoinsProvider'
import { COINS_PER_MASTERED_ITEM, shouldAwardMasteryCoin } from '../lib/coins'

describe('freshestCoins (HUD balance)', () => {
  it('shows the newer snapshot, even when it is lower (coins can be spent)', () => {
    // Planted a seed after the page loaded: 300 → 200 must win over the cached 300.
    expect(freshestCoins({ coins: 300, at: 1_000 }, { coins: 200, at: 2_000 })).toBe(200)
    // The page was re-read after an older live value: the server wins.
    expect(freshestCoins({ coins: 250, at: 3_000 }, { coins: 200, at: 2_000 })).toBe(250)
    // Same moment: the action's value wins.
    expect(freshestCoins({ coins: 10, at: 5 }, { coins: 11, at: 5 })).toBe(11)
  })

  it('falls back to whichever exists', () => {
    expect(freshestCoins(null, { coins: 3, at: 1 })).toBe(3)
    expect(freshestCoins({ coins: 2, at: 1 }, null)).toBe(2)
    expect(freshestCoins(null, null)).toBeNull()
  })
})

// ── Pure rule ────────────────────────────────────────────────────────────────

describe('shouldAwardMasteryCoin', () => {
  it('pays when an item reaches 5/5 for the first time', () => {
    expect(shouldAwardMasteryCoin({ previous: 4, next: 5, alreadyAwarded: false })).toBe(true)
    expect(COINS_PER_MASTERED_ITEM).toBe(1)
  })

  it('pays nothing below 5/5 (including the old top level, 3)', () => {
    expect(shouldAwardMasteryCoin({ previous: 2, next: 3, alreadyAwarded: false })).toBe(false)
    expect(shouldAwardMasteryCoin({ previous: 3, next: 4, alreadyAwarded: false })).toBe(false)
    expect(shouldAwardMasteryCoin({ previous: 5, next: 4, alreadyAwarded: false })).toBe(false)
  })

  it('never pays twice: re-reaching 5/5 from 4/5 with coin_awarded_at set pays 0', () => {
    expect(shouldAwardMasteryCoin({ previous: 4, next: 5, alreadyAwarded: true })).toBe(false)
    expect(shouldAwardMasteryCoin({ previous: 5, next: 5, alreadyAwarded: true })).toBe(false)
  })
})

// ── recordDrillResult with an in-memory database ─────────────────────────────

const USER = '11111111-1111-4111-8111-111111111111'
const ITEM_A = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'
const ITEM_B = '7a2d3b9f-3c2f-4d9b-8e4a-2b3c4d5e6f70'

type Row = { user_id: string; knowledge_item_id: string; mastery_level: number; mistake_count: number; last_practiced_at: string | null; coin_awarded_at: string | null }

// `migrated: false` = before 20260928000300 (no coin_awarded_at column, no award function).
const db = { progress: [] as Row[], coins: new Map<string, number>(), rpcCalls: 0, migrated: true }

// Next grade result, set per answer.
let nextCorrect = true

vi.mock('../services/grading', () => ({
  gradeWithTree: vi.fn(async () => ({ success: true, data: { answer: { isCorrect: nextCorrect, correctTag: 'A' }, deckId: 'deck-1' } })),
}))
// Tree fruit: every saved answer logs the tree's practice day (tested below).
vi.mock('../services/fruit', () => ({ recordDeckPracticeDay: vi.fn(async () => undefined) }))
vi.mock('../services/streak', () => ({
  recordPracticeDay: vi.fn(async () => ({ success: true, data: { current: 1, best: 1, practicedToday: true, lastDay: null } })),
}))
// Service-role client: award_mastery_coin with the SQL function's semantics
// (claim the unpaid 5/5 row, then pay; otherwise return the balance).
vi.mock('@/shared/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (_fn: string, { p_user_id, p_item_id }: { p_user_id: string; p_item_id: string }) => {
      db.rpcCalls += 1
      const row = db.progress.find((r) => r.user_id === p_user_id && r.knowledge_item_id === p_item_id)
      if (row && row.mastery_level === 5 && row.coin_awarded_at === null) {
        row.coin_awarded_at = new Date().toISOString()
        db.coins.set(p_user_id, (db.coins.get(p_user_id) ?? 0) + 1)
        return { data: [{ coins_earned: 1, total_coins: db.coins.get(p_user_id) }], error: null }
      }
      return { data: [{ coins_earned: 0, total_coins: db.coins.get(p_user_id) ?? 0 }], error: null }
    },
  }),
}))

import { recordDeckPracticeDay } from '../services/fruit'
import { recordDrillResult } from '../services/recordDrillResult'

// The player's own client: the few user_progress / users queries recordDrillResult makes.
function userClient() {
  return {
    from(table: string) {
      const filters: Record<string, string> = {}
      let patch: Partial<Row> | null = null
      let columns = ''
      const q = {
        select: (cols: string) => {
          columns = cols
          return q
        },
        eq: (col: string, value: string) => {
          filters[col] = value
          return q
        },
        maybeSingle: async () => {
          if (!db.migrated && /coin/.test(columns)) return { data: null, error: { code: '42703', message: 'column does not exist' } }
          if (table === 'users') return { data: { coins: db.coins.get(filters.id) ?? 0 }, error: null }
          const row = db.progress.find((r) => r.user_id === filters.user_id && r.knowledge_item_id === filters.knowledge_item_id)
          return { data: row ? { ...row } : null, error: null }
        },
        update: (values: Partial<Row>) => {
          patch = values
          return q
        },
        insert: async (values: Omit<Row, 'coin_awarded_at'>) => {
          if (db.progress.some((r) => r.user_id === values.user_id && r.knowledge_item_id === values.knowledge_item_id)) {
            return { error: { code: '23505', message: 'duplicate' } }
          }
          db.progress.push({ coin_awarded_at: null, ...values })
          return { error: null }
        },
        // Awaiting update(...).eq(...).eq(...) applies the patch.
        then: (resolve: (v: { error: null }) => unknown) => {
          const row = db.progress.find((r) => r.user_id === filters.user_id && r.knowledge_item_id === filters.knowledge_item_id)
          if (row && patch) Object.assign(row, patch)
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return q
    },
  }
}

async function answer(itemId: string, correct: boolean) {
  nextCorrect = correct
  const res = await recordDrillResult(userClient() as never, USER, { itemId, seed: 's', tag: 'A', timeZone: 'UTC' } as never)
  if (!res.success) throw new Error(res.error.message)
  return res.data
}

describe('recordDrillResult coins', () => {
  beforeEach(() => {
    db.progress = []
    db.coins = new Map()
    db.rpcCalls = 0
    db.migrated = true
  })

  it('still saves answers before the coins migration (no coins, no award call)', async () => {
    db.migrated = false
    for (let i = 0; i < 4; i++) await answer(ITEM_A, true)
    expect(await answer(ITEM_A, true)).toMatchObject({ masteryLevel: 5, coinsEarned: 0, totalCoins: null })
    expect(db.progress[0].mastery_level).toBe(5)
    expect(db.rpcCalls).toBe(0)
  })

  it('takes 5 correct answers: pays 1 coin on the 4 → 5 step and nothing before', async () => {
    for (let level = 1; level <= 4; level++) {
      expect(await answer(ITEM_A, true)).toMatchObject({ previousMasteryLevel: level - 1, masteryLevel: level, coinsEarned: 0, totalCoins: 0 })
    }
    expect(await answer(ITEM_A, true)).toMatchObject({ previousMasteryLevel: 4, masteryLevel: 5, coinsEarned: 1, totalCoins: 1 })
  })

  it('a wrong answer on a 5/5 item drops it to 4/5; re-mastering it pays 0', async () => {
    for (let i = 0; i < 5; i++) await answer(ITEM_A, true) // → 5/5, +1
    expect(await answer(ITEM_A, true)).toMatchObject({ previousMasteryLevel: 5, masteryLevel: 5, coinsEarned: 0, totalCoins: 1 })
    expect(await answer(ITEM_A, false)).toMatchObject({ previousMasteryLevel: 5, masteryLevel: 4, coinsEarned: 0, totalCoins: 1 })
    expect(db.progress[0]).toMatchObject({ mastery_level: 4, mistake_count: 1 })
    expect(db.progress[0].coin_awarded_at).not.toBeNull()
    expect(await answer(ITEM_A, true)).toMatchObject({ previousMasteryLevel: 4, masteryLevel: 5, coinsEarned: 0, totalCoins: 1 })
    // Already paid: the server doesn't even ask the database again.
    expect(db.rpcCalls).toBe(1)
  })

  it('does not pay at the old top level (3/5)', async () => {
    for (let i = 0; i < 3; i++) await answer(ITEM_A, true)
    expect(db.coins.get(USER) ?? 0).toBe(0)
    expect(db.rpcCalls).toBe(0)
  })

  it('adds up the total across items', async () => {
    for (let i = 0; i < 5; i++) await answer(ITEM_A, true)
    for (let i = 0; i < 4; i++) await answer(ITEM_B, true)
    expect(await answer(ITEM_B, true)).toMatchObject({ coinsEarned: 1, totalCoins: 2 })
    expect(db.coins.get(USER)).toBe(2)
  })

  it('never rewrites the row identity: first answer inserts, later ones update', async () => {
    await answer(ITEM_A, true)
    await answer(ITEM_A, false)
    expect(db.progress).toHaveLength(1)
    expect(db.progress[0]).toMatchObject({ user_id: USER, knowledge_item_id: ITEM_A, mastery_level: 0, mistake_count: 1 })
  })
})

describe('tree fruit: the practice day of the tree', () => {
  it("logs the answered tree for the player's local day on every saved answer, right or wrong", async () => {
    vi.mocked(recordDeckPracticeDay).mockClear()
    await answer('fruit-item-1', false)
    await answer('fruit-item-1', true)
    const calls = vi.mocked(recordDeckPracticeDay).mock.calls
    expect(calls).toHaveLength(2)
    for (const [userId, deckId, day] of calls) {
      expect(userId).toBe(USER)
      expect(deckId).toBe('deck-1')
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
