import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Watering a tree (services/watering.ts): what a drill answer writes, and that a finished Daily Rush
// waters the target tree exactly the same way: the same practice day (🔥 streak), the same tree
// practice day (🍎 fruit tomorrow), the same fresh last_practiced_at (💧 badge off, no withering),
// with mastery untouched by the rush.

const USER = '11111111-1111-4111-8111-111111111111'
const DECK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const ITEM = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`

type Progress = { user_id: string; knowledge_item_id: string; mastery_level: number; last_practiced_at: string | null }
const db = {
  practiceDays: [] as { user_id: string; day: string; time_zone: string }[],
  deckDays: [] as { user_id: string; deck_id: string; day: string }[],
  progress: [] as Progress[],
}

// The drill's grading: right answers on DECK's statements.
vi.mock('../services/grading', () => ({
  gradeWithTree: vi.fn(async () => ({ success: true, data: { answer: { isCorrect: true, correctTag: 'A' }, deckId: DECK } })),
}))

// Service role: the once-a-day upserts (practice_days, deck_practice_days) and the two progress
// functions with their SQL semantics (the real ones run on PostgreSQL in practiceRpc.test.ts).
const NOW = '2026-10-02T09:00:00.000Z'
vi.mock('@/shared/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: async (row: Record<string, string>) => {
        if (table === 'practice_days' && !db.practiceDays.some((r) => r.user_id === row.user_id && r.day === row.day)) db.practiceDays.push(row as never)
        if (table === 'deck_practice_days' && !db.deckDays.some((r) => r.user_id === row.user_id && r.deck_id === row.deck_id && r.day === row.day)) db.deckDays.push(row as never)
        return { error: null }
      },
    }),
    rpc: async (fn: string, args: { p_user_id: string; p_item_id?: string; p_correct?: boolean; p_item_ids?: string[] }) => {
      rpcCalls.push({ fn, args })
      const rowOf = (id: string) => {
        let row = db.progress.find((r) => r.user_id === args.p_user_id && r.knowledge_item_id === id)
        if (!row) db.progress.push((row = { user_id: args.p_user_id, knowledge_item_id: id, mastery_level: 0, last_practiced_at: null }))
        return row
      }
      if (fn === 'touch_practised') {
        for (const id of args.p_item_ids ?? []) rowOf(id).last_practiced_at = NOW
        return { data: args.p_item_ids?.length ?? 0, error: null }
      }
      if (fn === 'record_practice_answer') {
        const row = rowOf(args.p_item_id!)
        const previous = row.mastery_level
        row.mastery_level = args.p_correct ? Math.min(previous + 1, 5) : Math.max(previous - 1, 0)
        row.last_practiced_at = NOW
        return { data: [{ previous_level: previous, new_level: row.mastery_level, coins_earned: 0, total_coins: 100 }], error: null }
      }
      return { data: null, error: null }
    },
  }),
}))
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []

import { touchPractised } from '../services/practice'
import { recordDrillResult } from '../services/recordDrillResult'
import { waterTree } from '../services/watering'

// The player's own client: only the streak's read of practice_days. Progress is never written with it.
function client() {
  return {
    from: (table: string) => {
      if (table !== 'practice_days') throw new Error(`the player client must not touch ${table}`)
      const q = {
        select: () => q,
        eq: () => q,
        order: async () => {
          const mine = db.practiceDays.filter((r) => r.user_id === USER).sort((a, b) => b.day.localeCompare(a.day))
          return { data: mine.map((r) => ({ day: r.day, time_zone: r.time_zone })), error: null }
        },
      }
      return q
    },
  } as never
}

const snapshot = () => ({
  practiceDays: db.practiceDays.map(({ user_id, day, time_zone }) => ({ user_id, day, time_zone })),
  deckDays: db.deckDays.map(({ user_id, deck_id, day }) => ({ user_id, deck_id, day })),
  practised: db.progress.filter((r) => r.last_practiced_at !== null).map((r) => r.knowledge_item_id).sort(),
})

beforeEach(() => {
  db.practiceDays = []
  db.deckDays = []
  db.progress = []
  rpcCalls.length = 0
})

describe('watering a tree', () => {
  it("waterTree: today's practice day (streak) and the tree's practice day (fruit), in the player's local day", async () => {
    // 03:00 UTC on 2 October is 1 October in Los Angeles.
    const { today, streak } = await waterTree(client(), USER, { deckId: DECK, timeZone: 'America/Los_Angeles' }, new Date('2026-10-02T03:00:00Z'))
    expect(today).toBe('2026-10-01')
    expect(streak.success).toBe(true)
    expect(db.deckDays).toEqual([{ user_id: USER, deck_id: DECK, day: '2026-10-01' }])
    expect(db.practiceDays).toHaveLength(1)
    // Watering twice the same day changes nothing.
    await waterTree(client(), USER, { deckId: DECK, timeZone: 'America/Los_Angeles' }, new Date('2026-10-02T03:00:00Z'))
    expect(db.deckDays).toHaveLength(1)
  })

  it('touchPractised: one touch_practised call with each statement once, mastery untouched', async () => {
    db.progress.push({ user_id: USER, knowledge_item_id: ITEM(1), mastery_level: 4, last_practiced_at: '2026-09-01T00:00:00Z' })
    await touchPractised(client(), USER, [ITEM(1), ITEM(2), ITEM(2)])
    expect(rpcCalls).toEqual([{ fn: 'touch_practised', args: { p_user_id: USER, p_item_ids: [ITEM(1), ITEM(2)] } }])
    expect(db.progress).toEqual([
      { user_id: USER, knowledge_item_id: ITEM(1), mastery_level: 4, last_practiced_at: NOW },
      { user_id: USER, knowledge_item_id: ITEM(2), mastery_level: 0, last_practiced_at: NOW },
    ])
    // Nothing to touch: no call at all.
    await touchPractised(client(), USER, [])
    expect(rpcCalls).toHaveLength(1)
  })
})

describe('a Daily Rush waters exactly like a drill run', () => {
  it('the same answered statements leave the same practice day, tree practice day and freshness', async () => {
    const statements = [ITEM(1), ITEM(2), ITEM(3)]
    // A drill run answering three statements of the tree…
    for (const itemId of statements) {
      const res = await recordDrillResult(client(), USER, { itemId, selectedTag: 'A', timeZone: 'UTC' } as never)
      expect(res.success).toBe(true)
    }
    const drill = snapshot()
    const drillMastery = db.progress.map((r) => r.mastery_level)

    // …and a Daily Rush on the same tree answering the same three (rush answerRush → wateringOf).
    db.practiceDays = []
    db.deckDays = []
    db.progress = []
    await touchPractised(client(), USER, statements)
    await waterTree(client(), USER, { deckId: DECK, timeZone: 'UTC' })
    const rush = snapshot()

    expect(rush).toEqual(drill)
    expect(rush.deckDays).toEqual([{ user_id: USER, deck_id: DECK, day: drill.deckDays[0].day }])
    expect(rush.practised).toEqual([...statements].sort())
    // The drill graded them (mastery up); the rush only watered (mastery untouched: 0/5 rows).
    expect(drillMastery.every((m) => m > 0)).toBe(true)
    expect(db.progress.every((r) => r.mastery_level === 0)).toBe(true)
  })

  it('both go through the same watering step', () => {
    const drill = readFileSync(join(__dirname, '..', 'services', 'recordDrillResult.ts'), 'utf8')
    const rush = readFileSync(join(__dirname, '..', '..', 'rush', 'services', 'rush.ts'), 'utf8')
    expect(drill).toMatch(/waterTree\(supabase, userId, \{ deckId: gradedWithTree\.data\.deckId, timeZone: submission\.timeZone \}\)/)
    expect(rush).toMatch(/await touchPractised\(supabase, userId, cards\.map\(\(c\) => c\.itemId\)\)/)
    expect(rush).toMatch(/await waterTree\(supabase, userId, \{ deckId, timeZone \}\)/)
    expect(rush).toMatch(/claimStreakReward\(userId, streak\.data, today\)/)
  })
})
