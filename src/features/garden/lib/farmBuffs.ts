// Farm buffs (pure, unit-tested). The database pays the same way: farm_coin_multiplier() and
// uproot_deck() in migration 20260930000000_farm_grid.sql (a test checks the SQL still says so).
import type { Placement } from './farmGrid'

export const STREAM_MULTIPLIER = 1.2
export const HOUSE_MULTIPLIER = 1.5
export const WOODSHOP_REFUND_RATE = 0.25
// Chopping must never be a coin source: a refund stays below the price of the seed it replaces.
export const WOODSHOP_REFUND_CAP = 50

export type TreeBuff = { multiplier: number; stream: boolean; house: boolean }

// A Farmer's House (2 × 2 at hx, hy) covers the 4 × 4 square around it: hx − 1 … hx + 2, same for y.
const inHouseArea = (house: Placement, x: number, y: number) => x >= house.x - 1 && x <= house.x + house.width && y >= house.y - 1 && y <= house.y + house.height

// Coin multiplier for statements mastered on the tree standing at (gridX, gridY):
// ×1.2 with a stream on a side tile (x ± 1 or y ± 1), ×1.5 inside a Farmer's House area, ×1.8 both.
export function treeBuff(gridX: number, gridY: number, placements: readonly Placement[]): TreeBuff {
  const stream = placements.some((p) => p.itemType === 'stream' && Math.abs(p.x - gridX) + Math.abs(p.y - gridY) === 1)
  const house = placements.some((p) => p.itemType === 'farmer_house' && inHouseArea(p, gridX, gridY))
  const multiplier = Math.round((stream ? STREAM_MULTIPLIER : 1) * (house ? HOUSE_MULTIPLIER : 1) * 100) / 100
  return { multiplier, stream, house }
}

export const calculateTreeBuff = (gridX: number, gridY: number, placements: readonly Placement[]): number => treeBuff(gridX, gridY, placements).multiplier

// Coins back when a tree with `statementsCount` statements is chopped: 25% (rounded down) with a
// Woodshop on the farm, capped at 50; nothing without one.
export function calculateWoodshopRefund(statementsCount: number, placements: readonly Placement[]): number {
  if (!placements.some((p) => p.itemType === 'woodshop')) return 0
  return Math.min(Math.floor(Math.max(0, statementsCount) * WOODSHOP_REFUND_RATE), WOODSHOP_REFUND_CAP)
}
