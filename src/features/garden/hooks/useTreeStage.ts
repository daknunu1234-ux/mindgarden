import { GOLDEN_BLOOM_PERCENT } from '@/shared/lib/treeSkins'
import type { TreeStage } from '../types'

// frontend/ARCHITECTURE.md §5: 0–20 → 1, 21–40 → 2, 41–65 → 3, 66–89 → 4, 90–100 → 5.
export const getTreeStage = (pct: number): TreeStage =>
  pct <= 20 ? 1 : pct <= 40 ? 2 : pct <= 65 ? 3 : pct < GOLDEN_BLOOM_PERCENT ? 4 : 5

export const TREE_STAGES: Record<TreeStage, { name: string; emoji: string }> = {
  1: { name: 'Sprout', emoji: '🌱' },
  2: { name: 'Young Sapling', emoji: '🌿' },
  3: { name: 'Growing Tree', emoji: '🪴' },
  4: { name: 'Mature Canopy', emoji: '🌳' },
  5: { name: 'Golden Ancient Bloom', emoji: '🌟' },
}

// Pure, so Server Components can call it too; named as a hook per the FE docs.
export function useTreeStage(masteryPercent: number) {
  const stage = getTreeStage(masteryPercent)
  return { stage, ...TREE_STAGES[stage] }
}
