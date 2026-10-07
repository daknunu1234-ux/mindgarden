// The island's railway (pure, unit-tested). Railroad Track tiles join up with the tracks beside them
// (north / east / south / west); a Freight Train stands on three of them in a row. A factory is linked
// to the Seaport when one connected stretch of track touches both footprints (a track on a tile right
// beside them) and carries a train. The database applies the same rules (migration
// 20261015000000_rail_logistics.sql: farm_rail_linked(), and the train rules in
// purchase_and_place_item() / move_garden_placement()); tests check they agree.
import { checkPlacement, insideGrid, overlaps, type Footprint, type Placement, type PlacementCheck } from './farmGrid'

type Tile = { x: number; y: number }
const key = (t: Tile) => `${t.x},${t.y}`
const SIDES: readonly Tile[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

export const isTrack = (p: Pick<Placement, 'itemType'>) => p.itemType === 'rail_track'
export const isTrain = (p: Pick<Placement, 'itemType'>) => p.itemType === 'freight_train'

// The tiles of a footprint.
export function tilesOf(f: Footprint): Tile[] {
  const out: Tile[] = []
  for (let y = f.y; y < f.y + f.height; y++) for (let x = f.x; x < f.x + f.width; x++) out.push({ x, y })
  return out
}

// The tiles right beside a footprint (sharing an edge with it, not a corner).
export function besideTiles(f: Footprint): Tile[] {
  const out: Tile[] = []
  for (let x = f.x; x < f.x + f.width; x++) out.push({ x, y: f.y - 1 }, { x, y: f.y + f.height })
  for (let y = f.y; y < f.y + f.height; y++) out.push({ x: f.x - 1, y }, { x: f.x + f.width, y })
  return out
}

// The shortest run of track (tile by tile) from a track beside `from` to a track beside `to`, or
// null when no connected stretch of track touches both (breadth-first search over the tracks).
export function findRailRoute(placements: readonly Placement[], from: Footprint, to: Footprint): Tile[] | null {
  const tracks = new Set(placements.filter(isTrack).map(key))
  const starts = besideTiles(from).filter((t) => tracks.has(key(t)))
  const goals = new Set(besideTiles(to).filter((t) => tracks.has(key(t))).map(key))
  if (starts.length === 0 || goals.size === 0) return null
  const cameFrom = new Map<string, string | null>(starts.map((t) => [key(t), null]))
  const queue: Tile[] = [...starts]
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i]
    if (goals.has(key(at))) {
      const path: Tile[] = []
      for (let k: string | null = key(at); k; k = cameFrom.get(k) ?? null) {
        const [x, y] = k.split(',').map(Number)
        path.unshift({ x, y })
      }
      return path
    }
    for (const d of SIDES) {
      const next = { x: at.x + d.x, y: at.y + d.y }
      const k = key(next)
      if (tracks.has(k) && !cameFrom.has(k)) {
        cameFrom.set(k, key(at))
        queue.push(next)
      }
    }
  }
  return null
}

// Every track tile connected to `start` (its stretch of track).
function stretchOf(placements: readonly Placement[], start: Tile): Set<string> {
  const tracks = new Set(placements.filter(isTrack).map(key))
  const seen = new Set<string>([key(start)])
  const queue: Tile[] = [start]
  for (let i = 0; i < queue.length; i++) {
    for (const d of SIDES) {
      const next = { x: queue[i].x + d.x, y: queue[i].y + d.y }
      if (tracks.has(key(next)) && !seen.has(key(next))) {
        seen.add(key(next))
        queue.push(next)
      }
    }
  }
  return seen
}

// The freight link: the first factory of `factoryType` linked to the Seaport by track carrying a
// train, with the route the train runs (factory → Seaport), or null.
export function railLink(
  placements: readonly Placement[],
  factoryType: 'candy_factory' | 'furniture_factory' = 'candy_factory',
): { factory: Placement; seaport: Placement; train: Placement; route: Tile[] } | null {
  const seaport = placements.find((p) => p.itemType === 'seaport')
  if (!seaport) return null
  for (const factory of placements.filter((p) => p.itemType === factoryType)) {
    const route = findRailRoute(placements, factory, seaport)
    if (!route) continue
    const stretch = stretchOf(placements, route[0])
    const train = placements.find((p) => isTrain(p) && tilesOf(p).some((t) => stretch.has(key(t))))
    if (train) return { factory, seaport, train, route }
  }
  return null
}

export type TrainCheck = PlacementCheck | 'not-on-track'

// Where a Freight Train can stand: on the grid, every tile of its 1 × 3 footprint a Railroad Track,
// and nothing else there (another train included). `ignoreId`: the train itself when moving it.
export function checkTrainPlacement(placements: readonly Placement[], spot: Footprint, ignoreId?: string): TrainCheck {
  if (!insideGrid(spot)) return 'out-of-bounds'
  const others = placements.filter((p) => p.id !== ignoreId)
  if (others.some((p) => !isTrack(p) && overlaps(p, spot))) return 'occupied'
  const tracks = new Set(others.filter(isTrack).map(key))
  return tilesOf(spot).every((t) => tracks.has(key(t))) ? 'ok' : 'not-on-track'
}

// A track a train stands on can't be moved or picked up.
export const trackInUse = (placements: readonly Placement[], track: Placement): boolean => isTrack(track) && placements.some((p) => isTrain(p) && overlaps(p, track))

// Whether a track can move to `spot` (plain rules, and not from under a train).
export function checkTrackMove(placements: readonly Placement[], track: Placement, spot: Footprint): TrainCheck | 'in-use' {
  if (trackInUse(placements, track)) return 'in-use'
  return checkPlacement(
    placements.filter((p) => p.id !== track.id),
    spot,
  )
}
