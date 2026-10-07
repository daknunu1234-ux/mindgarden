import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RoadTile, TRUCK_IMAGE, TRUCK_TIMING, truckFlip, truckKeyframes, TruckRun, TruckSprite } from '../components/RoadSprites'
import { catalogFor, catalogItem, FARM_CATALOG, SHOP_TABS } from '../lib/farmCatalog'
import type { Placement } from '../lib/farmGrid'
import { besideTiles, candyLinked, findRoadRoute, headingOf, roadArms, roadLinks, roadShape } from '../lib/roads'

// Roads and Delivery Trucks (pure): tile shapes, the road route between a factory and the Seaport,
// which factories get a truck, how the truck faces and times its round trip, and that the railway is
// gone.

let n = 0
const at = (itemType: Placement['itemType'], x: number, y: number): Placement => {
  const e = catalogFor(itemType, null)
  return { id: `${itemType}-${n++}`, itemType, deckId: null, x, y, width: e?.width ?? 1, height: e?.height ?? 1, variant: null }
}
const roads = (...tiles: [number, number][]) => tiles.map(([x, y]) => at('road', x, y))
const svg = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement('svg', null, el))

describe('road tiles', () => {
  it('join into straights, curves, T-junctions and crossings; a lone tile or a dead end runs straight', () => {
    expect(roadShape(roadArms({ north: false, east: true, south: false, west: true }))).toBe('straight')
    expect(roadShape(roadArms({ north: false, east: false, south: false, west: false }))).toBe('straight')
    expect(roadArms({ north: true, east: false, south: false, west: false })).toEqual(['north', 'south'])
    expect(roadShape(roadArms({ north: true, east: true, south: false, west: false }))).toBe('curve')
    expect(roadShape(roadArms({ north: true, east: true, south: true, west: false }))).toBe('tee')
    expect(roadShape(roadArms({ north: true, east: true, south: true, west: true }))).toBe('cross')
  })

  it('draw dark asphalt with a side face, curbs on the open sides and dashed centre lines', () => {
    const straight = svg(createElement(RoadTile, { links: { north: true, east: false, south: true, west: false } }))
    expect(straight).toContain('data-road-shape="straight"')
    expect((straight.match(/data-curb=/g) ?? []).length).toBe(2) // east and west
    expect((straight.match(/stroke-dasharray="6 5"/g) ?? []).length).toBe(2)
    const curve = svg(createElement(RoadTile, { links: { north: true, east: true, south: false, west: false } }))
    expect(curve).toMatch(/<path d="M [^"]* Q 0 0 [^"]*"[^>]*stroke-dasharray/) // the centre line sweeps through the bend
    const cross = svg(createElement(RoadTile, { links: { north: true, east: true, south: true, west: true } }))
    expect(cross).toContain('data-road-shape="cross"')
    expect(cross).not.toContain('data-curb=')
    expect((cross.match(/stroke-dasharray/g) ?? []).length).toBe(4)
  })
})

describe('the road route', () => {
  // Candy Factory at (4..5, 4..5), Seaport at (2..7, 14..15).
  const factory = at('candy_factory', 4, 4)
  const seaport = at('seaport', 2, 14)

  it('finds the shortest run of road from beside the factory to beside the Seaport, around bends', () => {
    // Down from (4, 6) to (4, 9), east to (6, 9), down to (6, 13) beside the port's top edge.
    const net = roads([4, 6], [4, 7], [4, 8], [4, 9], [5, 9], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [9, 9], [9, 10])
    const route = findRoadRoute([factory, seaport, ...net], factory, seaport)!
    expect(route[0]).toEqual({ x: 4, y: 6 })
    expect(route.at(-1)).toEqual({ x: 6, y: 13 })
    expect(route).toHaveLength(10)
    // Each step one tile, along the road.
    for (let i = 1; i < route.length; i++) expect(Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y)).toBe(1)
    expect(besideTiles(factory)).toContainEqual(route[0])
    expect(besideTiles(seaport)).toContainEqual(route.at(-1))
  })

  it('a gap, or a road that only touches a corner, links nothing', () => {
    expect(findRoadRoute([factory, seaport, ...roads([4, 6], [4, 7], [4, 9], [4, 10], [4, 11], [4, 12], [4, 13])], factory, seaport)).toBeNull()
    // (6, 6) only touches the factory's corner: not beside it.
    expect(findRoadRoute([factory, seaport, ...roads([6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13])], factory, seaport)).toBeNull()
  })

  it('every working factory a road links to a working Seaport gets a Delivery Truck', () => {
    const furniture = at('furniture_factory', 8, 4)
    const net = roads([4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [6, 7], [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13])
    const farm = [factory, furniture, seaport, at('rockery', 0, 0), ...net]
    expect(roadLinks(farm).map((l) => l.factory.itemType).sort()).toEqual(['candy_factory', 'furniture_factory'])
    expect(candyLinked(farm)).toBe(true)
    // Without power the factory (or the port) doesn't count.
    expect(roadLinks(farm, (p) => p.id !== furniture.id).map((l) => l.factory.itemType)).toEqual(['candy_factory'])
    expect(roadLinks(farm, (p) => p.id !== seaport.id)).toEqual([])
    expect(candyLinked(farm, (p) => p.id !== factory.id)).toBe(false)
    // No Seaport, no truck.
    expect(roadLinks([factory, ...net])).toEqual([])
  })
})

describe('the Delivery Truck', () => {
  it('faces the way of the render along north–south and mirrored along east–west', () => {
    expect(headingOf({ x: 3, y: 3 }, { x: 3, y: 4 })).toBe('south')
    expect(headingOf({ x: 3, y: 3 }, { x: 4, y: 3 })).toBe('east')
    expect([truckFlip('south'), truckFlip('north'), truckFlip('east'), truckFlip('west')]).toEqual([1, 1, -1, -1])
    expect(svg(createElement(TruckSprite, { flip: -1 }))).toContain('transform="scale(-1 1)"')
    const html = svg(createElement(TruckSprite))
    expect(html).toContain(`href="${TRUCK_IMAGE.href}"`)
    // Anchored on its mid-wheelbase: the ground point.
    expect(html).toContain(`x="${-TRUCK_IMAGE.anchor[0] * TRUCK_IMAGE.scale}"`)
  })

  it('times a round trip: loads, drives out, unloads at the dock, drives back; turns at each bend both ways', () => {
    // South 2 tiles, then east 2 tiles: one bend.
    const route = [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]
    const { css, duration, flips } = truckKeyframes('mg-truck-test', route)
    const { load, perTile, unload } = TRUCK_TIMING
    expect(duration).toBeCloseTo(load + 2 * 4 * perTile + unload, 6)
    expect(flips).toEqual([1, 1, -1, -1])
    // At the dock (100% of the road) for the unloading stretch, home again at the end.
    const pct = (t: number) => `${((t / duration) * 100).toFixed(3)}%`
    expect(css).toContain(`${pct(load + 4 * perTile)} { offset-distance: 100%; }`)
    expect(css).toContain(`${pct(load + 4 * perTile + unload)} { offset-distance: 100%; }`)
    expect(css).toContain('100% { offset-distance: 0%; }')
    // Two turns at the bend: out (south → east) and back (west → north).
    expect((css.match(/scaleX\(-1\)/g) ?? []).length).toBe(2)
    expect(css).toContain(`${pct(load + 2 * perTile + TRUCK_TIMING.turn / 2)} { transform: scaleX(-1); }`)
  })

  it('runs along the route, paused with the farm and still for reduced motion', () => {
    const route = [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
    ]
    const html = renderToStaticMarkup(createElement(TruckRun, { route, points: [{ x: 10, y: 20 }, { x: -46, y: 48 }], zIndex: 5 }))
    expect(html).toContain("offset-path:path(&#x27;M 10.0 20.0 L -46.0 48.0&#x27;)")
    expect(html).toContain(`href="${TRUCK_IMAGE.href}"`)
    expect(html).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{ \[data-truck-run="mg-truck-[a-z0-9]+"\] \{ animation:/)
    expect(html).toContain('data-truck-face=""')
    // .mg-paused (globals.css) freezes every animation on the island, the truck's included.
    expect(readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8')).toMatch(/\.mg-paused \*,[\s\S]*?animation-play-state: paused !important/)
  })
})

describe('the railway is gone', () => {
  it('the Shop sells Roads, not tracks or trains', () => {
    expect(catalogItem('road')).toMatchObject({ name: 'Road', tab: 'roads', price: 1, width: 1, height: 1 })
    expect(SHOP_TABS.map((t) => t.id)).toContain('roads')
    expect(SHOP_TABS.map((t) => t.label).join(' ')).not.toMatch(/Rail/)
    for (const id of ['rail_track', 'freight_train']) expect(catalogItem(id)).toBeUndefined()
    expect(FARM_CATALOG.map((i) => `${i.name} ${i.description}`).join(' ')).not.toMatch(/Rail|Train|track/i)
  })

  it('no rail code is left in the garden feature', () => {
    const dir = join(__dirname, '..')
    for (const f of ['components/FarmIsometricGrid.tsx', 'components/FarmIslandView.tsx', 'components/FarmStructures.tsx', 'components/FarmShopModal.tsx', 'lib/buildingStatus.ts', 'lib/powerGrid.ts', 'services/placements.ts']) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/rail_track|freight_train|RailwaySprites|lib\/railway|Freight Train|Railroad/)
    }
  })
})
