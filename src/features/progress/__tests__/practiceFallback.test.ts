import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Deploy order (the bug this pins): the code that saves answers through record_practice_answer() was
// running against a database where supabase/migrations/20261020000000_progress_rpc.sql had not been
// applied. PostgREST answered PGRST202 ("could not find the function") and every drill answer showed
// "We couldn't check that answer. Could not save progress." Now a missing function (or a missing
// service role key) falls back to saving with the player's own session, exactly as before the
// functions existed; with the functions in place the player client is never used.

const USER = '11111111-1111-4111-8111-111111111111'
const ITEM = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'
const OTHER = '7a2d3b9f-3c2f-4d9b-8e4a-2b3c4d5e6f70'

type Row = { user_id: string; knowledge_item_id: string; mastery_level: number; last_practiced_at: string | null; coin_awarded_at: string | null }
type Mode = 'missing-functions' | 'no-service-key' | 'functions' | 'locked-without-functions' | 'broken'
const db = { progress: [] as Row[], coins: 300, mode: 'missing-functions' as Mode, rpc: [] as string[], playerWrites: 0 }

const MISSING = { code: 'PGRST202', message: 'Could not find the function public.record_practice_answer(p_correct, p_item_id, p_user_id) in the schema cache' }
const rowOf = (user: string, item: string) => db.progress.find((r) => r.user_id === user && r.knowledge_item_id === item)

vi.mock('@/shared/lib/supabase/admin', () => ({
  createAdminClient: () =>
    db.mode === 'no-service-key'
      ? null
      : {
          rpc: async (fn: string, args: { p_user_id: string; p_item_id?: string; p_correct?: boolean; p_item_ids?: string[] }) => {
            db.rpc.push(fn)
            // The coin function is older (migration 20260928000300) and exists in every mode.
            if (fn === 'award_mastery_coin') {
              const row = rowOf(args.p_user_id, args.p_item_id!)
              if (row && row.mastery_level === 5 && row.coin_awarded_at === null) {
                row.coin_awarded_at = 'paid'
                db.coins += 1
                return { data: [{ coins_earned: 1, total_coins: db.coins }], error: null }
              }
              return { data: [{ coins_earned: 0, total_coins: db.coins }], error: null }
            }
            if (db.mode === 'broken') return { data: null, error: { code: 'XX000', message: 'database is on fire' } }
            if (db.mode !== 'functions') return { data: null, error: MISSING }
            if (fn === 'touch_practised') {
              for (const id of args.p_item_ids ?? []) {
                const row = rowOf(args.p_user_id, id)
                if (row) row.last_practiced_at = 'now'
                else db.progress.push({ user_id: args.p_user_id, knowledge_item_id: id, mastery_level: 0, last_practiced_at: 'now', coin_awarded_at: null })
              }
              return { data: args.p_item_ids?.length ?? 0, error: null }
            }
            let row = rowOf(args.p_user_id, args.p_item_id!)
            if (!row) db.progress.push((row = { user_id: args.p_user_id, knowledge_item_id: args.p_item_id!, mastery_level: 0, last_practiced_at: null, coin_awarded_at: null }))
            const previous = row.mastery_level
            row.mastery_level = args.p_correct ? Math.min(previous + 1, 5) : Math.max(previous - 1, 0)
            return { data: [{ previous_level: previous, new_level: row.mastery_level, coins_earned: 0, total_coins: db.coins }], error: null }
          },
        },
}))

import { savePracticeAnswer, touchPractised } from '../services/practice'

// The player's own session over the in-memory rows (RLS: their rows only).
function player() {
  const denied = () => (db.mode === 'locked-without-functions' ? { code: '42501', message: 'permission denied for table user_progress' } : null)
  return {
    rpc: async () => ({ data: db.coins, error: null }),
    from(table: string) {
      const filters: Record<string, string> = {}
      let ids: string[] | null = null
      let patch: Partial<Row> | null = null
      const rows = () => db.progress.filter((r) => r.user_id === filters.user_id && (filters.knowledge_item_id === undefined || r.knowledge_item_id === filters.knowledge_item_id) && (!ids || ids.includes(r.knowledge_item_id)))
      const write = () => {
        const error = denied()
        if (!error) {
          db.playerWrites += 1
          rows().forEach((r) => Object.assign(r, patch))
        }
        return { error }
      }
      const q = {
        select: () => q,
        update: (values: Partial<Row>) => {
          patch = values
          return q
        },
        eq: (col: string, value: string) => {
          filters[col] = value
          return q
        },
        in: (_col: string, values: string[]) => {
          ids = values
          return Promise.resolve(patch ? write() : { data: rows().map((r) => ({ knowledge_item_id: r.knowledge_item_id })), error: null })
        },
        maybeSingle: async () => (table === 'users' ? { data: { coins: db.coins }, error: null } : { data: rows()[0] ? { mastery_level: rows()[0].mastery_level } : null, error: null }),
        insert: async (values: Omit<Row, 'coin_awarded_at'> | Omit<Row, 'coin_awarded_at'>[]) => {
          const error = denied()
          if (error) return { error }
          db.playerWrites += 1
          for (const v of Array.isArray(values) ? values : [values]) db.progress.push({ coin_awarded_at: null, ...v })
          return { error: null }
        },
        // Awaiting update(...).eq(...).eq(...) applies the patch.
        then: (resolve: (v: { error: unknown }) => unknown) => Promise.resolve(write()).then(resolve),
      }
      return q
    },
  } as never
}

beforeEach(() => {
  db.progress = []
  db.coins = 300
  db.mode = 'missing-functions'
  db.rpc = []
  db.playerWrites = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('saving an answer before migration 20261020000000 is applied', () => {
  it('PGRST202 no longer fails the answer: it is saved with the player session', async () => {
    const res = await savePracticeAnswer(player(), USER, ITEM, true)
    expect(res).toEqual({ success: true, data: { previousMasteryLevel: 0, masteryLevel: 1, coinsEarned: 0, totalCoins: 300 } })
    expect(db.progress).toMatchObject([{ user_id: USER, knowledge_item_id: ITEM, mastery_level: 1 }])
    expect(typeof db.progress[0].last_practiced_at).toBe('string')
  })

  it('follows the same ±1 rule and pays the mastery coin once at 5/5', async () => {
    const earned: number[] = []
    for (const correct of [true, true, true, true, true, false, true]) {
      const res = await savePracticeAnswer(player(), USER, ITEM, correct)
      if (!res.success) throw new Error(res.error.message)
      earned.push(res.data.coinsEarned)
    }
    expect(earned).toEqual([0, 0, 0, 0, 1, 0, 0])
    expect(db.progress).toMatchObject([{ mastery_level: 5 }])
    expect(db.progress).toHaveLength(1)
    expect(db.coins).toBe(301)
  })

  it('says which migration to run, in the server log', async () => {
    await savePracticeAnswer(player(), USER, ITEM, true)
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).toContain('supabase/migrations/20261020000000_progress_rpc.sql')
  })

  it('without a service role key it saves the same way (no coin can be paid)', async () => {
    db.mode = 'no-service-key'
    db.progress.push({ user_id: USER, knowledge_item_id: ITEM, mastery_level: 4, last_practiced_at: null, coin_awarded_at: null })
    const res = await savePracticeAnswer(player(), USER, ITEM, true)
    expect(res).toMatchObject({ success: true, data: { previousMasteryLevel: 4, masteryLevel: 5, coinsEarned: 0, totalCoins: 300 } })
  })

  it('a Daily Rush still marks its statements practised, mastery untouched', async () => {
    db.progress.push({ user_id: USER, knowledge_item_id: ITEM, mastery_level: 4, last_practiced_at: null, coin_awarded_at: null })
    await touchPractised(player(), USER, [ITEM, OTHER, OTHER])
    expect(db.progress.map((r) => [r.knowledge_item_id, r.mastery_level, r.last_practiced_at !== null])).toEqual([
      [ITEM, 4, true],
      [OTHER, 0, true],
    ])
  })
})

describe('with the functions in place', () => {
  it('saves through record_practice_answer() and never writes with the player session', async () => {
    db.mode = 'functions'
    expect(await savePracticeAnswer(player(), USER, ITEM, true)).toMatchObject({ success: true, data: { previousMasteryLevel: 0, masteryLevel: 1 } })
    await touchPractised(player(), USER, [OTHER])
    expect(db.rpc).toEqual(['record_practice_answer', 'touch_practised'])
    expect(db.playerWrites).toBe(0)
  })

  it('any other database error still fails the answer, and is not retried with the player session', async () => {
    db.mode = 'broken'
    expect(await savePracticeAnswer(player(), USER, ITEM, true)).toEqual({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Could not save progress' } })
    expect(db.playerWrites).toBe(0)
  })
})

describe('the one order that cannot work', () => {
  it('the lock (20261020000100) applied without the functions: the answer fails and the log names the cause', async () => {
    db.mode = 'locked-without-functions'
    expect(await savePracticeAnswer(player(), USER, ITEM, true)).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } })
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain('42501')
    // The lock migration says so itself: it must run after the functions and the deploy.
    const lock = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261020000100_lock_progress_writes.sql'), 'utf8')
    expect(lock).toMatch(/Order: only AFTER/)
  })
})
