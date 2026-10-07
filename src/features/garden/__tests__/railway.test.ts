import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FRUIT_PER_HARVEST } from '@/shared/lib/economy'
import { RunningTrain, TrackTile, trackArms } from '../components/RailwaySprites'
import { FactorySprite } from '../components/PowerBuildings'
import { buildingStatus } from '../lib/buildingStatus'
import { catalogFor, catalogItem } from '../lib/farmCatalog'
import { CANDY_EXPORT_COINS, CANDY_PER_FACTORY_HOUR, deliverCandy, FRUIT_PER_CANDY, makeCandy, STOCK_CAPS } from '../lib/farmEconomy'
import type { Placement } from '../lib/farmGrid'
import { exportRewards, fruitAfterHarvest, fruitAfterRefusal } from '../lib/inventory'
import { checkItemPlacement } from '../lib/powerGrid'
import { besideTiles, checkTrainPlacement, findRailRoute, railLink, trackInUse } from '../lib/railway'

const LATEST = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261015000000_rail_logistics.sql'), 'utf8').split('-- Verify')[0]

let n = 0
const at = (itemType: Placement['itemType'], x: number, y: number): Placement => {
  const entry = catalogFor(itemType, null)
  return { id: `${itemType}-${n++}`, itemType, deckId: null, x, y, width: entry?.width ?? 1, height: entry?.height ?? 1, variant: null }
}
const track = (x: number, y: number) => at('rail_track', x, y)
const row = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => track(x0 + i, y))
const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => track(x, y0 + i))

describe('prices', () => {
  it('a Railroad Track costs 1 coin per tile; the rest as the new price list', () => {
    expect(catalogItem('rail_track')).toMatchObject({ price: 1, width: 1, height: 1 })
    expect(catalogItem('freight_train')).toMatchObject({ price: 30, width: 1, height: 3, onTracks: true })
    expect(catalogItem('candy_factory')).toMatchObject({ price: 50, width: 2, height: 2, requiresPower: true })
    // Ten tiles of track cost ten coins.
    expect(row(0, 0, 9).reduce((sum, p) => sum + catalogFor(p.itemType, null)!.price, 0)).toBe(10)
  })

  it('the database charges the same, and a train only on three tracks', () => {
    expect(LATEST).toMatch(/when 'rail_track'\s+then v_cost := 1;/)
    expect(LATEST).toMatch(/when 'freight_train'\s+then v_cost := 30; v_w := 1; v_h := 3;/)
    expect(LATEST).toMatch(/when 'candy_factory'\s+then v_cost := 50; v_w := 2; v_h := 2;/)
    expect(LATEST).toMatch(/raise exception 'NOT_ON_TRACK'/)
    expect(LATEST).toMatch(/raise exception 'TRACK_IN_USE'/)
  })
})

describe('the fruit counter', () => {
  it('a harvest adds FRUIT_PER_HARVEST fruit (2), a refusal puts the count back, unknown stays unknown', () => {
    expect(FRUIT_PER_HARVEST).toBe(2)
    expect(fruitAfterHarvest(7)).toBe(9)
    expect(fruitAfterHarvest(0)).toBe(2)
    expect(fruitAfterHarvest(null)).toBeNull()
    expect(fruitAfterRefusal(7)).toBe(7)
  })
})

describe('candy: 10 fruits → 1 candy box', () => {
  it('a powered Candy Factory turns 10 fruit into 1 box, 1 an hour', () => {
    expect(FRUIT_PER_CANDY).toBe(10)
    expect(CANDY_PER_FACTORY_HOUR).toBe(1)
    expect(makeCandy({ fruit: 10, candy: 0 }, 1, 1)).toEqual({ fruit: 0, candy: 1 })
    expect(makeCandy({ fruit: 30, candy: 0 }, 1, 2)).toEqual({ fruit: 10, candy: 2 })
    // Limited by the fruit: 25 fruit make 2.5 boxes, whatever the hours.
    expect(makeCandy({ fruit: 25, candy: 0 }, 2, 10)).toEqual({ fruit: 0, candy: 2.5 })
    // No factory working, or no fruit: nothing.
    expect(makeCandy({ fruit: 50, candy: 1 }, 0, 10)).toEqual({ fruit: 50, candy: 1 })
    // The store holds at most 20 boxes.
    expect(makeCandy({ fruit: 1000, candy: 19 }, 5, 10).candy).toBe(STOCK_CAPS.candy)
  })

  it('the database converts at the same rate', () => {
    expect(LATEST).toContain('least(v_candies * 1 * v_hours, v_row.fruit / 10, 20 - v_row.candy)')
    expect(LATEST).toContain('v_row.fruit := v_row.fruit - v_made * 10;')
  })
})

describe('the freight line: pathfinding', () => {
  const factory = at('candy_factory', 4, 10) // (4..5, 10..11)
  const port = at('seaport', 2, 14) // (2..7, 14..15)

  it('finds the shortest run of track from beside the factory to beside the Seaport', () => {
    const farm = [factory, port, ...col(6, 10, 13)]
    // (6, 10) and (6, 11) are beside the factory's east side; (6, 13) beside the port's north side.
    const route = findRailRoute(farm, factory, port)!
    expect(route).toEqual([
      { x: 6, y: 11 },
      { x: 6, y: 12 },
      { x: 6, y: 13 },
    ])
  })

  it('goes round corners, and takes the shorter of two lines', () => {
    const detour = [...row(9, 4, 12), ...col(12, 10, 13), ...row(13, 7, 11)]
    const farm = [factory, port, ...detour, track(4, 12), track(4, 13)]
    expect(findRailRoute(farm, factory, port)).toEqual([
      { x: 4, y: 12 },
      { x: 4, y: 13 },
    ])
    // Without the short line, the long way round.
    const long = findRailRoute([factory, port, ...detour], factory, port)!
    // From (5, 9), the beside-tile nearer the line: (5..12, 9), (12, 10..13), (11..7, 13).
    expect(long[0]).toEqual({ x: 5, y: 9 })
    expect(long.at(-1)).toEqual({ x: 7, y: 13 })
    expect(long).toHaveLength(8 + 4 + 5)
  })

  it('no route across a gap, nor along a diagonal', () => {
    expect(findRailRoute([factory, port, track(6, 11), track(6, 13)], factory, port)).toBeNull()
    expect(findRailRoute([factory, port, track(6, 11), track(7, 12), track(6, 13)], factory, port)).toBeNull()
    expect(besideTiles({ x: 0, y: 0, width: 2, height: 2 })).toHaveLength(8)
  })

  it('railLink: the line works only with a Freight Train on it', () => {
    const line = [...col(4, 12, 13), ...row(12, 5, 8), ...col(8, 10, 11)]
    expect(railLink([factory, port, ...line])).toBeNull()
    const train = at('freight_train', 8, 10)
    const link = railLink([factory, port, ...line, train])!
    expect(link.train.id).toBe(train.id)
    expect(link.route[0]).toEqual({ x: 4, y: 12 })
    // A train on some other, unconnected track doesn't count.
    expect(railLink([factory, port, ...line, ...col(14, 0, 2), at('freight_train', 14, 0)])).toBeNull()
  })
})

describe('the train and its tracks', () => {
  it('a Freight Train stands only on three tracks in a row, with nothing else there', () => {
    const tracks = col(3, 3, 5)
    expect(checkTrainPlacement(tracks, { x: 3, y: 3, width: 1, height: 3 })).toBe('ok')
    expect(checkTrainPlacement(tracks.slice(0, 2), { x: 3, y: 3, width: 1, height: 3 })).toBe('not-on-track')
    expect(checkTrainPlacement([...tracks, at('freight_train', 3, 3)], { x: 3, y: 3, width: 1, height: 3 })).toBe('occupied')
    expect(checkTrainPlacement(tracks, { x: 3, y: 14, width: 1, height: 3 })).toBe('out-of-bounds')
    expect(checkItemPlacement(tracks, 'freight_train', { x: 3, y: 3, width: 1, height: 3 })).toBe('ok')
  })

  it('a track a train stands on can neither move nor be picked up', () => {
    const tracks = col(3, 3, 6)
    const train = at('freight_train', 3, 3)
    const farm = [...tracks, train]
    expect(trackInUse(farm, tracks[1])).toBe(true)
    expect(trackInUse(farm, tracks[3])).toBe(false)
    expect(checkItemPlacement(farm, 'rail_track', { x: 9, y: 9, width: 1, height: 1 }, tracks[1].id)).toBe('in-use')
    expect(checkItemPlacement(farm, 'rail_track', { x: 9, y: 9, width: 1, height: 1 }, tracks[3].id)).toBe('ok')
    // Nothing else may go on a train's tiles.
    expect(checkItemPlacement(farm, 'rockery', { x: 3, y: 4, width: 1, height: 1 })).toBe('occupied')
  })
})

describe('export: 15 coins a candy box at the Seaport', () => {
  it('every whole box is exported for 15 coins; a part box waits', () => {
    expect(CANDY_EXPORT_COINS).toBe(15)
    expect(deliverCandy(1)).toEqual({ shipped: 1, payout: 15, left: 0 })
    expect(deliverCandy(3.4)).toMatchObject({ shipped: 3, payout: 45 })
    expect(deliverCandy(3.4).left).toBeCloseTo(0.4)
    expect(deliverCandy(0.9)).toEqual({ shipped: 0, payout: 0, left: 0.9 })
    expect(LATEST).toContain('v_candy_pay := v_shipped * 15;')
    expect(LATEST).toMatch(/if v_row\.candy >= 1 and public\.farm_candy_linked\(v_user\) then/)
  })

  it('floats one "+15 🪙" per box over the Seaport, summing a big delivery on the last one', () => {
    expect(exportRewards(0)).toEqual([])
    expect(exportRewards(1)).toEqual(['+15 🪙'])
    expect(exportRewards(3)).toEqual(['+15 🪙', '+15 🪙', '+15 🪙'])
    expect(exportRewards(10)).toEqual(['+15 🪙', '+15 🪙', '+15 🪙', '+105 🪙'])
  })
})

describe('drawing and inspector', () => {
  it('track tiles join their neighbours; a lone tile runs straight', () => {
    expect(trackArms({ north: false, east: false, south: false, west: false })).toEqual(['east', 'west'])
    expect(trackArms({ north: true, east: false, south: false, west: false })).toEqual(['north', 'south'])
    expect(trackArms({ north: true, east: true, south: false, west: false })).toEqual(['north', 'east'])
    const html = renderToStaticMarkup(createElement('svg', null, createElement(TrackTile, { links: { north: false, east: true, south: true, west: false } })))
    expect(html).toContain('data-track-arms="east south"')
    expect(renderToStaticMarkup(createElement(RunningTrain))).toContain('🍬')
    expect(renderToStaticMarkup(createElement('svg', null, createElement(FactorySprite, { kind: 'candy' })))).toContain('data-building="candy_factory"')
  })

  it('the inspector explains the line', () => {
    const stock = { timber: 0, produce: 0, furniture: 0, fruit: 4, candy: 2, candyShipped: 0, candyPayout: 0, payout: 0, totalCoins: 0, lastExportAt: null }
    expect(buildingStatus('candy_factory', { powered: true, economy: stock })?.status).toBe('Waiting for fruit (10 make a box)')
    expect(buildingStatus('candy_factory', { powered: true, economy: { ...stock, fruit: 12 } })?.status).toBe('🍬 Making candy')
    expect(buildingStatus('candy_factory', { powered: false, economy: stock })?.status).toBe('Paused: Needs Power')
    expect(buildingStatus('freight_train', { linked: true, economy: stock })?.status).toBe('🚂 Carrying candy boxes to the Seaport')
    expect(buildingStatus('freight_train', { linked: false, economy: stock })?.tone).toBe('warn')
  })

  it('all new railway text is English', () => {
    for (const f of ['lib/railway.ts', 'lib/inventory.ts', 'components/RailwaySprites.tsx', 'components/FruitBadge.tsx', 'lib/buildingStatus.ts']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/)
    }
    expect(LATEST).not.toMatch(/[ăâđêôơưàáảãạ]/)
  })
})
