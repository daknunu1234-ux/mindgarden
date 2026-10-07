// The island's roads (pure, unit-tested). Road tiles join up with the roads beside them (north / east /
// south / west) into straights, curves, T-junctions and crossings. A factory is linked to the Seaport
// when one connected stretch of road touches both footprints (a road on a tile right beside each);
// then a delivery truck drives that route (RoadSprites TruckRun). The database applies the same link
// rule for candy exports (migration 20261018000000_road_logistics.sql: farm_candy_linked()); tests
// check they agree.
import type { Footprint, Links, Placement } from './farmGrid'

export type Tile = { x: number; y: number }
export type Side = keyof Links
const key = (t: Tile) => `${t.x},${t.y}`
const STEP: Record<Side, Tile> = { north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 } }
const SIDES = Object.keys(STEP) as Side[]
const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' }

// The factories a delivery truck serves.
export const DELIVERY_FACTORIES = ['candy_factory', 'furniture_factory'] as const
export type DeliveryFactory = (typeof DELIVERY_FACTORIES)[number]

export const isRoad = (p: Pick<Placement, 'itemType'>) => p.itemType === 'road'

// Which sides a road tile draws: the sides it joins; a lone tile or a dead end runs straight through.
export function roadArms(links: Links): Side[] {
  const joined = SIDES.filter((k) => links[k])
  if (joined.length === 0) return ['east', 'west']
  if (joined.length === 1) return [joined[0], OPPOSITE[joined[0]]]
  return joined
}

// The shape a road tile takes: a straight, a curve (two sides at a right angle), a T-junction or a
// crossing.
export function roadShape(arms: readonly Side[]): 'straight' | 'curve' | 'tee' | 'cross' {
  if (arms.length === 4) return 'cross'
  if (arms.length === 3) return 'tee'
  return OPPOSITE[arms[0]] === arms[1] ? 'straight' : 'curve'
}

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

// The shortest run of road (tile by tile) from a road beside `from` to a road beside `to`, or null
// when no connected stretch of road touches both (breadth-first search over the roads).
export function findRoadRoute(placements: readonly Placement[], from: Footprint, to: Footprint): Tile[] | null {
  const roads = new Set(placements.filter(isRoad).map(key))
  const starts = besideTiles(from).filter((t) => roads.has(key(t)))
  const goals = new Set(besideTiles(to).filter((t) => roads.has(key(t))).map(key))
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
    for (const side of SIDES) {
      const next = { x: at.x + STEP[side].x, y: at.y + STEP[side].y }
      const k = key(next)
      if (roads.has(k) && !cameFrom.has(k)) {
        cameFrom.set(k, key(at))
        queue.push(next)
      }
    }
  }
  return null
}

export type RoadLink = { factory: Placement; seaport: Placement; route: Tile[] }

// Every factory a delivery truck serves that the road links to a Seaport, each with its route
// (factory → Seaport). `working`: whether a building has power (only working factories and ports
// count); everything counts without it.
export function roadLinks(placements: readonly Placement[], working: (p: Placement) => boolean = () => true): RoadLink[] {
  const ports = placements.filter((p) => p.itemType === 'seaport' && working(p))
  const out: RoadLink[] = []
  for (const factory of placements.filter((p) => (DELIVERY_FACTORIES as readonly string[]).includes(p.itemType) && working(p))) {
    for (const seaport of ports) {
      const route = findRoadRoute(placements, factory, seaport)
      if (route) {
        out.push({ factory, seaport, route })
        break
      }
    }
  }
  return out
}

// The candy export link (the database's farm_candy_linked()): a working Candy Factory on a road to a
// working Seaport.
export const candyLinked = (placements: readonly Placement[], working?: (p: Placement) => boolean): boolean =>
  roadLinks(placements, working).some((l) => l.factory.itemType === 'candy_factory')

// The way a truck heads from one route tile to the next.
export function headingOf(from: Tile, to: Tile): Side {
  if (to.x > from.x) return 'east'
  if (to.x < from.x) return 'west'
  return to.y > from.y ? 'south' : 'north'
}
