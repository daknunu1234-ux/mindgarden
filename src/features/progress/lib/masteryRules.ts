// Mastery rules (DATABASE.md "Progress Use Cases"): correct → +1 up to 5, wrong → −1 down to 0
// (a mastered 5/5 item drops to 4/5 too). The scale itself lives in shared/lib/mastery.ts.
import { MASTERY_NAMES, MAX_MASTERY, toMasteryLevel, type MasteryLevel } from '@/shared/lib/mastery'

export { MASTERY_NAMES, MAX_MASTERY, toMasteryLevel, type MasteryLevel }

export function nextMastery(level: MasteryLevel, isCorrect: boolean): MasteryLevel {
  return toMasteryLevel(isCorrect ? level + 1 : level - 1)
}
