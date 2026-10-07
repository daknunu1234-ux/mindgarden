import { getTreeSpecies } from '@/shared/lib/treeSkins'
import type { TreeStage } from '../types'

// Where each sprite's crown really ends (pure): the topmost painted point of every species at every
// growth stage, in TreeStageSvg view units at scale 1 (the trunk base is y = 108; smaller = higher).
// Effects round the crown (the stage-5 aura and sparkles, motes, stars, the Cosmic Nebula's orbiting
// planets) don't count. Measured from the sprites themselves: __tests__/crownTop.test.ts re-measures
// them and fails when a drawing changes without this table, so the 💧 / 🍎 icons always sit right on
// the crown, whatever the tree.
const CROWN_TOP: Record<string, readonly [number, number, number, number, number]> = {
  oak: [73, 48, 16, -15, -15],
  pine: [72, 62, 33, -4, -19],
  birch: [73, 41, 7, -22, -22],
  cherry: [69, 53, 23, -17, -17],
  willow: [73, 48, 14, -18, -19],
  mystic: [58, 27, -5, -36, -36],
  palm: [66, 39, 10, -18, -19],
  citrus: [73, 49, 17, -17, -18],
  maple: [73, 54, 20, -15, -16],
  cactus: [82, 70, 42, 8, -4],
  crystal_flora: [60, 38, 15, -8, -8],
  cosmic_nebula: [50, 23, -7, -36, -36],
  chrono_willow: [62, 43, 21, 0, 0],
}

// The species ids the table covers (the test checks it against the catalog).
export const CROWN_TOP_SPECIES = Object.keys(CROWN_TOP)

// The crown top of `treeType` at `stage` (view units). Retired or unknown ids use the species they
// render as.
export function crownTopY(treeType: string | null | undefined, stage: TreeStage): number {
  const row = CROWN_TOP[getTreeSpecies(treeType ?? 'oak').id] ?? CROWN_TOP.oak
  return row[stage - 1]
}
