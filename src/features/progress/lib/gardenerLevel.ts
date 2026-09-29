import { MAX_MASTERY } from './masteryRules'

// Gardener level (farm HUD). XP only grows with learning: 10 XP per mastery step on any item
// the player has practised, in any deck. Levelling L → L + 1 costs 50 + 25 × (L − 1) XP.
export const XP_PER_MASTERY_STEP = 10

export type GardenerLevel = {
  level: number
  title: string
  xp: number
  // XP earned inside the current level, and the XP that level needs in total.
  xpIntoLevel: number
  xpForNextLevel: number
  // 0–1 progress towards the next level.
  progress: number
}

export const xpForLevel = (level: number): number => 50 + 25 * (level - 1)

const TITLES: [number, string][] = [
  [1, 'Seedling Gardener'],
  [3, 'Sprout Keeper'],
  [6, 'Grove Tender'],
  [10, 'Orchard Keeper'],
  [15, 'Ancient Forester'],
]

export function levelTitle(level: number): string {
  return TITLES.filter(([min]) => level >= min).at(-1)?.[1] ?? TITLES[0][1]
}

// XP from mastery levels (0–3 each; out-of-range values are clamped).
export function xpFromLevels(levels: Iterable<number>): number {
  let steps = 0
  for (const l of levels) steps += Math.min(MAX_MASTERY, Math.max(0, Math.trunc(l)))
  return steps * XP_PER_MASTERY_STEP
}

export function gardenerLevel(xp: number): GardenerLevel {
  const total = Math.max(0, Math.floor(xp))
  let level = 1
  let remaining = total
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level += 1
  }
  const need = xpForLevel(level)
  return { level, title: levelTitle(level), xp: total, xpIntoLevel: remaining, xpForNextLevel: need, progress: remaining / need }
}
