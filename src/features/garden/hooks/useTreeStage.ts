import type { TreeStage } from '../types'

// frontend/ARCHITECTURE.md §5: 0–25 → 1, 26–50 → 2, 51–80 → 3, 81–100 → 4.
export const getTreeStage = (pct: number): TreeStage => (pct <= 25 ? 1 : pct <= 50 ? 2 : pct <= 80 ? 3 : 4)

export const TREE_STAGES: Record<TreeStage, { name: string; emoji: string }> = {
  1: { name: 'Sprout', emoji: '🌱' },
  2: { name: 'Sapling', emoji: '🌿' },
  3: { name: 'Maturing Tree', emoji: '🪴' },
  4: { name: 'Blooming Golden Tree', emoji: '🌳✨' },
}

// Pure, so Server Components can call it too; named as a hook per the FE docs.
export function useTreeStage(masteryPercent: number) {
  const stage = getTreeStage(masteryPercent)
  return { stage, ...TREE_STAGES[stage] }
}
