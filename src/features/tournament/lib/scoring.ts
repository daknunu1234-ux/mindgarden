// Mind Tournament rules (pure, unit-tested). The database applies the same rules in
// record_tournament_answer() and the two board functions (migration 20260928000900); a test
// checks the SQL still says so.
import { MAX_MASTERY } from '@/shared/lib/mastery'
import { neighborName } from '@/shared/lib/neighborName'

// Max points for a tree with `drillableCount` statements the engine can ask: N × 5.
export const maxPoints = (drillableCount: number): number => Math.max(0, Math.floor(drillableCount)) * MAX_MASTERY

// achieved / (N × 5) × 100, rounded to 2 decimals like the NUMERIC(5,2) column. null without statements.
export function masteryPercentage(points: number, max: number): number | null {
  if (max <= 0) return null
  return Math.round((Math.min(Math.max(points, 0), max) / max) * 100 * 100) / 100
}

// Every drillable statement at 5/5.
export const isGraduation = (points: number, max: number): boolean => max > 0 && points >= max

// Distinct practice days: a later calendar day adds one; more answers on the same day (or a
// clock that went back) change nothing. Days are the player's local 'YYYY-MM-DD'.
export function nextPracticeDays(daysCount: number, lastDay: string, today: string): { daysCount: number; lastDay: string } {
  return today > lastDay ? { daysCount: daysCount + 1, lastDay: today } : { daysCount, lastDay }
}

export type ActiveEntry = { masteryPercentage: number | null; daysCount: number; updatedAt: string }
export type GraduateEntry = { daysCount: number; graduatedAt: string }

// 🌱 Đang Rèn Luyện: higher mastery first, then fewer practice days, then who got there first.
export function compareActive(a: ActiveEntry, b: ActiveEntry): number {
  return (b.masteryPercentage ?? -1) - (a.masteryPercentage ?? -1) || a.daysCount - b.daysCount || a.updatedAt.localeCompare(b.updatedAt)
}

// 📜 Bia Trạng Nguyên: fewest practice days to master the whole tree, then the earliest graduate.
export function compareHallOfFame(a: GraduateEntry, b: GraduateEntry): number {
  return a.daysCount - b.daysCount || a.graduatedAt.localeCompare(b.graduatedAt)
}

// A contestant's public name: their profile name, else the app-wide friendly pseudonym. Never an email.
export const contestantName = (displayName: string | null | undefined, userId: string): string => displayName?.trim() || neighborName(userId)

// "3 ngày luyện tập".
export const formatPracticeDays = (days: number): string => `${days} ngày luyện tập`

// 🥇 🥈 🥉 for the podium, "#4" after that.
export const rankBadge = (rank: number): string => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`)
