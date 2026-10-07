import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SubmitTournamentAnswerDto } from '../../tournament/dto/TournamentDto'
import { DrillSubmissionDto } from '../dto/DrillSubmissionDto'

// The practice pipeline keeps state, not history: an answer updates the item's progress in place
// and marks the day. These tests pin that no timing, pick log or per-answer row creeps in.

const root = join(__dirname, '..', '..', '..', '..')
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')
const ITEM = '11111111-1111-4111-8111-111111111111'
const DECK = '22222222-2222-4222-8222-222222222222'
const TELEMETRY = /latency|elapsed|response_?time|duration_?ms|answered_?at|time_?spent|performance\.now|telemetry|analytics/i

describe('what the client sends for an answer', () => {
  it('is the pick only: item, seed, tag (and the timezone for the day); anything else is dropped', () => {
    const noisy = { itemId: ITEM, seed: 'abc123', tag: 'B', timeZone: 'Asia/Ho_Chi_Minh', latencyMs: 812, answeredAt: '2026-10-01T10:00:00Z', answerText: 'Ty thể', isCorrect: true, userId: 'x', sessionId: 's' }
    expect(DrillSubmissionDto.parse(noisy)).toEqual({ itemId: ITEM, seed: 'abc123', tag: 'B', timeZone: 'Asia/Ho_Chi_Minh' })
    expect(Object.keys(DrillSubmissionDto.shape).sort()).toEqual(['itemId', 'seed', 'tag', 'timeZone'])
    expect(SubmitTournamentAnswerDto.parse({ ...noisy, deckId: DECK })).toEqual({ deckId: DECK, itemId: ITEM, seed: 'abc123', tag: 'B', timeZone: 'Asia/Ho_Chi_Minh' })
  })

  it('never includes a verdict: the server grades the pick', () => {
    expect(Object.keys(DrillSubmissionDto.shape)).not.toContain('isCorrect')
    expect(Object.keys(DrillSubmissionDto.shape)).not.toContain('result')
  })

  it('the drill hook builds exactly that payload and measures nothing', () => {
    const hook = read('src', 'features', 'drill', 'hooks', 'useDrillSession.ts')
    expect(hook).toContain('const input = { itemId: question.itemId, seed: question.seed, tag }')
    expect(hook).toMatch(/submitDrillResult\(\{ \.\.\.input, timeZone \}\)/)
    expect(hook).not.toMatch(TELEMETRY)
    expect(hook).not.toMatch(/Date\.now\(\)|new Date\(/)
  })
})

describe('what the server stores for an answer', () => {
  const sources = ['recordDrillResult.ts', 'streak.ts', 'fruit.ts', 'coins.ts', 'grading.ts'].map((f) => [f, read('src', 'features', 'progress', 'services', f)] as const)

  it('updates the item in place with its level and review time, and nothing else', () => {
    const record = sources.find(([f]) => f === 'recordDrillResult.ts')![1]
    expect(record).toContain('const values = { mastery_level: masteryLevel, last_practiced_at: new Date().toISOString() }')
    expect(record).not.toMatch(/mistake_count|mistakeCount/)
    // The only table it writes itself is user_progress.
    expect([...record.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1])).toEqual(['user_progress', 'user_progress', 'user_progress'])
  })

  it('writes at most one row per player per day (and per tree per day), never one per answer', () => {
    const streak = sources.find(([f]) => f === 'streak.ts')![1]
    const fruit = sources.find(([f]) => f === 'fruit.ts')![1]
    expect(streak).toMatch(/upsert\(\{ user_id: userId, day: today, time_zone: zone \}, \{ onConflict: 'user_id,day', ignoreDuplicates: true \}\)/)
    expect(fruit).toMatch(/upsert\(\{ user_id: userId, deck_id: deckId, day \}, \{ onConflict: 'user_id,deck_id,day', ignoreDuplicates: true \}\)/)
    // No copy of the streak on the users row any more.
    expect(streak).not.toMatch(/streak_count|last_active_at|\.update\(/)
  })

  it('has no timing or tracking code anywhere in the practice services', () => {
    for (const [file, code] of sources) expect(code, file).not.toMatch(TELEMETRY)
    for (const file of ['answers.ts', 'levels.ts', 'boards.ts']) expect(read('src', 'features', 'tournament', 'services', file), file).not.toMatch(TELEMETRY)
  })
})

describe('the schema has no per-answer log', () => {
  const dir = join(root, 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const bodies = files.map((f) => [f, readFileSync(join(dir, f), 'utf8').split('-- Verify')[0]] as const)

  it('creates only these tables: state and one-row-per-day logs, no answer history', () => {
    const tables = bodies.flatMap(([, sql]) => [...sql.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1])).sort()
    expect(tables).toEqual(
      [
        'roles', 'users', 'decks', 'mindmap_nodes', 'knowledge_items', 'user_progress',
        'practice_days', 'tree_visits', 'deck_tournament_participants', 'deck_tournament_item_progress',
        'garden_placements', 'deck_practice_days', 'tree_harvests', 'streak_rewards',
        // Daily Rush: one row per player per day (today's run), its streak updated in place.
        'daily_rush_runs',
        // The island's stock: one row per gardener, updated in place (no production log).
        'farm_economy',
      ].sort(),
    )
    for (const name of tables) expect(name).not.toMatch(/log|attempt|answer|event|history|telemetry/)
  })

  it('no column anywhere records how long an answer took or what was picked', () => {
    for (const [file, sql] of bodies) {
      const code = sql.replace(/--[^\n]*/g, '') // comments may talk about history
      expect(code, file).not.toMatch(/latency|elapsed|response_time|duration_ms|answered_at|time_spent|picked_tag|answer_text/i)
    }
  })

  it('20261007000000 drops exactly the three unused columns, and no table', () => {
    const sql = bodies.find(([f]) => f === '20261007000000_drop_unused_progress_columns.sql')![1].replace(/--[^\n]*/g, '')
    expect([...sql.matchAll(/alter table public\.([a-z_]+) drop column if exists ([a-z_]+);/g)].map((m) => `${m[1]}.${m[2]}`)).toEqual([
      'user_progress.mistake_count',
      'users.streak_count',
      'users.last_active_at',
    ])
    expect(sql).not.toMatch(/drop table|truncate|delete from/i)
    expect(sql).toMatch(/begin;[\s\S]*commit;/)
    // It is the last migration that mentions them: nothing later depends on the columns.
    const later = bodies.filter(([f]) => f > '20261007000000_drop_unused_progress_columns.sql')
    for (const [file, body] of later) expect(body, file).not.toMatch(/mistake_count|streak_count|last_active_at/)
  })

  it('no database function reads the dropped columns', () => {
    for (const [file, sql] of bodies) {
      for (const fn of sql.matchAll(/create or replace function[\s\S]*?\$\$;/g)) expect(fn[0], file).not.toMatch(/mistake_count|streak_count|last_active_at/)
    }
  })
})
