// The farm's power grid and the seaport's coastal rule (pure, unit-tested). The database applies the
// same rules (migration 20261014000000_power_grid.sql: farm_building_powered(), and the coastal check
// in purchase_and_place_item() / move_garden_placement()); tests check they agree.
import { catalogFor, type FarmItemType } from './farmCatalog'
import { checkPlacement, GRID_SIZE, overlaps, type Footprint, type Placement, type PlacementCheck } from './farmGrid'
import { checkTrackMove, checkTrainPlacement, type TrainCheck } from './railway'

// How far a power source's field reaches beyond its footprint, by type (0 = not a power source).
export function powerReachOf(itemType: FarmItemType): number {
  return catalogFor(itemType, null)?.powerReach ?? 0
}

export const isPowerSource = (itemType: FarmItemType): boolean => powerReachOf(itemType) > 0
export const requiresPower = (itemType: FarmItemType): boolean => catalogFor(itemType, null)?.requiresPower === true

// A power source's field: its footprint grown by its reach on every side (the Windmill: 2×2 + 4 →
// 10×10). It may run past the grid's edge (that part powers nothing).
export function powerField(source: Footprint & { itemType: FarmItemType }): Footprint | null {
  const reach = powerReachOf(source.itemType)
  if (reach <= 0) return null
  return { x: source.x - reach, y: source.y - reach, width: source.width + 2 * reach, height: source.height + 2 * reach }
}

// Every power field on the farm.
export const powerFields = (placements: readonly Placement[]): Footprint[] => placements.flatMap((p) => powerField(p) ?? [])

// Whether a building works: true when its footprint touches (shares at least one tile with) any
// power field. A building that needs no power always works. A power source never powers itself
// (it doesn't need to).
export function checkIsPowered(building: Footprint & { itemType: FarmItemType; id?: string }, placements: readonly Placement[]): boolean {
  if (!requiresPower(building.itemType)) return true
  return placements.some((p) => p.id !== building.id && isPowerSource(p.itemType) && overlaps(powerField(p)!, building))
}

// Power state of every placement that needs power (id → powered). Others are absent.
export function poweredMap(placements: readonly Placement[]): Map<string, boolean> {
  const out = new Map<string, boolean>()
  for (const p of placements) if (requiresPower(p.itemType)) out.set(p.id, checkIsPowered(p, placements))
  return out
}

// ── The seaport: coast only ──────────────────────────────────────────────────

export type SeaportCheck = PlacementCheck | 'not-coastal'

// The seaport is 6 × 2 with its long (6-tile) edge along x. It must stand on the shore: its long
// edge on the island's edge, i.e. on the first two rows (y = 0, the north-east shore) or the last
// two (y = GRID_SIZE − 2, the south-west shore, facing the viewer).
export function isCoastalSpot(spot: Footprint): boolean {
  return spot.width >= spot.height && (spot.y === 0 || spot.y + spot.height === GRID_SIZE)
}

// Whether a seaport can stand here: on the grid, free of other things (`ignoreId`: the seaport itself
// when moving it), and on the coast.
export function validateSeaportPlacement(spot: Footprint, placements: readonly Placement[], ignoreId?: string): SeaportCheck {
  const others = ignoreId ? placements.filter((p) => p.id !== ignoreId) : placements
  const fits = checkPlacement(others, spot)
  if (fits !== 'ok') return fits
  return isCoastalSpot(spot) ? 'ok' : 'not-coastal'
}

// Every top tile where a seaport could stand right now (the shoreline highlight while placing one).
export function seaportSpots(placements: readonly Placement[], ignoreId?: string): { spot: Footprint; ok: boolean }[] {
  const out: { spot: Footprint; ok: boolean }[] = []
  for (const y of [0, GRID_SIZE - 2]) {
    for (let x = 0; x <= GRID_SIZE - 6; x++) {
      const spot = { x, y, width: 6, height: 2 }
      out.push({ spot, ok: validateSeaportPlacement(spot, placements, ignoreId) === 'ok' })
    }
  }
  return out
}

export type ItemCheck = SeaportCheck | TrainCheck | 'in-use'

// Any item: whether it can go here (bounds, overlaps; the seaport on the coast; the Freight Train on
// three tracks; a track never from under a train). Move mode passes the moving placement's id.
export function checkItemPlacement(placements: readonly Placement[], itemType: FarmItemType, spot: Footprint, movingId?: string): ItemCheck {
  if (catalogFor(itemType, null)?.coastal) return validateSeaportPlacement(spot, placements, movingId)
  if (itemType === 'freight_train') return checkTrainPlacement(placements, spot, movingId)
  const moving = movingId ? placements.find((p) => p.id === movingId) : undefined
  if (moving && itemType === 'rail_track') return checkTrackMove(placements, moving, spot)
  const others = movingId ? placements.filter((p) => p.id !== movingId) : placements
  return checkPlacement(others, spot)
}
