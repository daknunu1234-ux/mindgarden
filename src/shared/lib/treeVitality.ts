// Tree vitality (pure, unit-tested): withering and its immunity.
// - A tree withers when nobody has practised it for more than 72 hours: on the farm it turns grey and
//   stands still (no sway, no bees, no falling leaves) until a round waters it again.
// - Mastered knowledge is evergreen: from growth stage 4 (Mature Canopy, ≥ 66 %) a tree is immune and
//   never withers, however long it rests.
// - A tree with no statements has nothing to practise, so it never withers either.
// Withering is only a look: it costs nothing and changes no mastery.

export const WITHER_AFTER_MS = 72 * 60 * 60 * 1000
// Growth stages 1–5 (garden getTreeStage): 4 = Mature Canopy, 5 = Golden Ancient Bloom.
export const IMMUNE_STAGE = 4

export type VitalityInput = {
  stage: number
  itemCount: number
  // Newest practice of any of the tree's statements (ISO), or null if never practised.
  lastPracticedAt: string | null
  // When the tree was planted (ISO): a never-practised tree counts its rest from here.
  plantedAt: string | null
  now: number
}

export const isImmune = (stage: number): boolean => stage >= IMMUNE_STAGE

export function isWithered({ stage, itemCount, lastPracticedAt, plantedAt, now }: VitalityInput): boolean {
  if (isImmune(stage) || itemCount <= 0) return false
  const since = lastPracticedAt ?? plantedAt
  if (!since) return false
  const at = Date.parse(since)
  return Number.isFinite(at) && now - at > WITHER_AFTER_MS
}

// How the farm draws a tree: a withered one is grey and still; a lively one keeps its colours and
// its sway (and, when allowed, bees and falling leaves).
export function treeLook(withered: boolean): { grayscale: boolean; sways: boolean; ambience: boolean } {
  return withered ? { grayscale: true, sways: false, ambience: false } : { grayscale: false, sways: true, ambience: true }
}
