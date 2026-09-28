import { describe, expect, it } from 'vitest'
import { computeStreaks, localDay, nextStreakMilestone, resolveTimeZone, streakMilestone } from '../lib/streak'

const TODAY = '2026-09-28'

describe('computeStreaks', () => {
  it('is empty with no practice at all', () => {
    expect(computeStreaks([], TODAY)).toEqual({ current: 0, best: 0, practicedToday: false, lastDay: null })
  })

  it('counts several practices on the same day as one day', () => {
    expect(computeStreaks([TODAY, TODAY, TODAY], TODAY)).toMatchObject({ current: 1, best: 1, practicedToday: true })
  })

  it('counts consecutive days, in any input order', () => {
    const days = ['2026-09-28', '2026-09-26', '2026-09-27']
    expect(computeStreaks(days, TODAY)).toMatchObject({ current: 3, best: 3, practicedToday: true, lastDay: TODAY })
  })

  it('keeps the streak alive through yesterday (today not practised yet)', () => {
    const days = ['2026-09-25', '2026-09-26', '2026-09-27']
    expect(computeStreaks(days, TODAY)).toMatchObject({ current: 3, practicedToday: false, lastDay: '2026-09-27' })
  })

  it('resets the current streak after a missed day but keeps the best', () => {
    const days = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-26']
    expect(computeStreaks(days, TODAY)).toMatchObject({ current: 0, best: 4 })
  })

  it('starts a new streak after a gap', () => {
    const days = ['2026-09-20', '2026-09-21', '2026-09-27', '2026-09-28']
    expect(computeStreaks(days, TODAY)).toMatchObject({ current: 2, best: 2 })
  })

  it('crosses month and year boundaries', () => {
    expect(computeStreaks(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01')).toMatchObject({ current: 3 })
    expect(computeStreaks(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01')).toMatchObject({ current: 3 })
  })

  it('treats a last day after "today" (travelling west) as still active', () => {
    expect(computeStreaks(['2026-09-28', '2026-09-29'], TODAY)).toMatchObject({ current: 2, practicedToday: true })
  })

  it('ignores malformed day strings', () => {
    expect(computeStreaks(['nope', '2026-9-28', TODAY], TODAY)).toMatchObject({ current: 1, best: 1 })
  })

  it('reports a 30-day milestone streak', () => {
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 7, 30 + i)).toISOString().slice(0, 10))
    expect(days.at(-1)).toBe(TODAY)
    const s = computeStreaks(days, TODAY)
    expect(s).toMatchObject({ current: 30, best: 30 })
    expect(streakMilestone(s.current)).toBe(30)
    expect(nextStreakMilestone(s.current)).toBe(50)
  })
})

describe('milestones', () => {
  it('returns the highest milestone reached and the next one', () => {
    expect(streakMilestone(2)).toBeNull()
    expect(streakMilestone(3)).toBe(3)
    expect(streakMilestone(13)).toBe(7)
    expect(nextStreakMilestone(0)).toBe(3)
    expect(nextStreakMilestone(7)).toBe(14)
    expect(nextStreakMilestone(365)).toBeNull()
  })
})

describe('local days', () => {
  // 2026-09-27 23:30 UTC is already 2026-09-28 06:30 in Ho Chi Minh City (UTC+7).
  const at = new Date('2026-09-27T23:30:00Z')

  it('uses the player timezone for the calendar day', () => {
    expect(localDay(at, 'UTC')).toBe('2026-09-27')
    expect(localDay(at, 'Asia/Ho_Chi_Minh')).toBe('2026-09-28')
    expect(localDay(at, 'America/Los_Angeles')).toBe('2026-09-27')
  })

  it('makes 06:00 and 08:00 local the same day in Vietnam (they straddle 00:00 UTC)', () => {
    const six = new Date('2026-09-27T23:00:00Z') // 06:00 +07
    const eight = new Date('2026-09-28T01:00:00Z') // 08:00 +07
    expect(localDay(six, 'Asia/Ho_Chi_Minh')).toBe(localDay(eight, 'Asia/Ho_Chi_Minh'))
    expect(localDay(six, 'UTC')).not.toBe(localDay(eight, 'UTC'))
  })

  it('falls back to UTC for unknown timezones', () => {
    expect(resolveTimeZone('Mars/Olympus_Mons')).toBe('UTC')
    expect(resolveTimeZone('')).toBe('UTC')
    expect(resolveTimeZone(undefined)).toBe('UTC')
    expect(resolveTimeZone('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh')
    expect(localDay(at, 'Mars/Olympus_Mons')).toBe('2026-09-27')
  })
})
