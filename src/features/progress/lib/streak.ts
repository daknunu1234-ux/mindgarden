// Daily streak math. Pure: days are 'YYYY-MM-DD' strings in the player's local timezone.

// Local calendar days live in shared/lib/localDay.ts (the tournament counts days the same way).
export { localDay, resolveTimeZone } from '@/shared/lib/localDay'

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365] as const

export type Streaks = {
  // Consecutive days ending today or yesterday (a streak survives until a whole day is missed).
  current: number
  best: number
  practicedToday: boolean
  lastDay: string | null
}

const DAY_MS = 86_400_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// Days since the epoch for a calendar date, independent of any timezone.
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

export function computeStreaks(days: readonly string[], today: string): Streaks {
  const unique = [...new Set(days.filter((d) => DAY_RE.test(d)))].map(dayNumber).sort((a, b) => a - b)
  if (unique.length === 0) return { current: 0, best: 0, practicedToday: false, lastDay: null }

  let best = 1
  let run = 1
  for (let i = 1; i < unique.length; i++) {
    run = unique[i] - unique[i - 1] === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }

  const todayNum = dayNumber(today)
  const last = unique[unique.length - 1]
  // `run` is the length of the run ending at the last active day. It is still "current" if that
  // day is today or yesterday (or later than today, e.g. after travelling west across timezones).
  const current = todayNum - last <= 1 ? run : 0

  return {
    current,
    best,
    practicedToday: unique.includes(todayNum) || last > todayNum,
    lastDay: new Date(last * DAY_MS).toISOString().slice(0, 10),
  }
}

// Highest milestone reached (3, 7, 14, …), or null below the first.
export function streakMilestone(days: number): number | null {
  const reached = STREAK_MILESTONES.filter((m) => days >= m)
  return reached.length > 0 ? reached[reached.length - 1] : null
}

// The next milestone to aim for, or null past the last one.
export function nextStreakMilestone(days: number): number | null {
  return STREAK_MILESTONES.find((m) => m > days) ?? null
}
