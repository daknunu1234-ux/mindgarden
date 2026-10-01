// Daily streak math. Pure: days are 'YYYY-MM-DD' strings in the player's local timezone.

// Local calendar days live in shared/lib/localDay.ts (the tournament counts days the same way).
export { localDay, resolveTimeZone } from '@/shared/lib/localDay'

// The streak grows only by watering a tree: a saved practice answer marks the player's local day
// (services/streak.ts recordPracticeDay), once per day however many trees are watered. Opening the
// game marks nothing. A missed day ends the run: the next watering starts again at 1.

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

// 🪙 bonus paid on the day the streak reaches `streak` days: 7 → 7, 30 → 30, every 100 days
// (100, 200, 300…) → as many coins as days; any other day 0. The database applies the same rule
// (award_streak_reward, migration 20261004000000_streak_rewards.sql; a test keeps them equal).
export function streakReward(streak: number): number {
  if (!Number.isInteger(streak) || streak <= 0) return 0
  if (streak === 7) return 7
  if (streak === 30) return 30
  if (streak >= 100 && streak % 100 === 0) return streak
  return 0
}

// The next streak length that pays a bonus (always one: the hundreds never end).
export function nextStreakReward(streak: number): { streak: number; coins: number } {
  const days = Math.max(0, Math.floor(streak))
  const next = days < 7 ? 7 : days < 30 ? 30 : (Math.floor(days / 100) + 1) * 100
  return { streak: next, coins: streakReward(next) }
}
