import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildingStatus } from '../lib/buildingStatus'
import { catalogFor, catalogItem, FARM_CATALOG, isRetired, RETIRED_CATALOG } from '../lib/farmCatalog'
import {
  CATCH_UP_HOURS,
  EXPORT_PRICES,
  exportValue,
  FACTORY_FURNITURE_PER_HOUR,
  FACTORY_TIMBER_PER_FURNITURE,
  PRODUCE_PER_ANIMAL_HOUR,
  produce,
  SHIP_INTERVAL_HOURS,
  SHIP_MAX_PAYOUT,
  shipVisit,
  STOCK_CAPS,
  TIMBER_PER_TREE_HOUR,
} from '../lib/farmEconomy'
import { GRID_SIZE, type Placement } from '../lib/farmGrid'
import { checkIsPowered, checkItemPlacement, isCoastalSpot, poweredMap, powerField, seaportSpots, validateSeaportPlacement } from '../lib/powerGrid'
import { FactorySprite, SeaportSprite, WindmillSprite } from '../components/PowerBuildings'

const at = (id: string, itemType: Placement['itemType'], x: number, y: number): Placement => {
  const entry = catalogFor(itemType, null)
  return { id, itemType, deckId: null, x, y, width: entry?.width ?? 1, height: entry?.height ?? 1, variant: null }
}
const migration = (file: string) => readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', file), 'utf8').split('-- Verify')[0]
const SQL = migration('20261014000000_power_grid.sql')
// Today's catalogue and settlement: the latest migration that re-created them.
const LATEST = migration('20261016000000_grand_windmill.sql')

describe('the catalogue', () => {
  it('sells the power-grid buildings at today’s prices and sizes, and no longer the two retired ones', () => {
    expect(['windmill_small', 'windmill_large', 'furniture_factory', 'candy_factory', 'seaport'].map((id) => catalogItem(id)).map((i) => [i!.id, i!.price, i!.width, i!.height])).toEqual([
      ['windmill_small', 30, 2, 2],
      ['windmill_large', 60, 2, 2],
      ['furniture_factory', 50, 2, 2],
      ['candy_factory', 50, 2, 2],
      ['seaport', 100, 6, 2],
    ])
    expect(catalogItem('farmer_house')).toBeUndefined()
    expect(catalogItem('woodshop')).toBeUndefined()
    // Already standing ones still have a name and a drawing.
    expect(catalogFor('woodshop', null)?.name).toBe('Woodshop')
    expect(RETIRED_CATALOG.map((i) => i.id)).toEqual(['farmer_house', 'woodshop'])
    expect(isRetired('farmer_house')).toBe(true)
    expect(isRetired('seaport')).toBe(false)
  })

  it('the database charges the same prices and sizes (latest catalogue), and refuses the retired buildings', () => {
    for (const entry of FARM_CATALOG) {
      const size = entry.width > 1 || entry.height > 1 ? `; v_w := ${entry.width}; v_h := ${entry.height}` : ''
      expect(LATEST, entry.id).toMatch(new RegExp(`when '${entry.itemType}'\\s+then v_cost := ${entry.price}${size.replace(/[;:]/g, (m) => `\\${m}`)};`))
    }
    expect(SQL).toMatch(/when 'farmer_house', 'woodshop' then raise exception 'ITEM_RETIRED'/)
    // Footprints up to 6 tiles now.
    expect(SQL).toMatch(/check \(width between 1 and 6\)/)
    expect(SQL).toMatch(/check \(height between 1 and 6\)/)
  })
})

describe('checkIsPowered: the power grid', () => {
  it('Small Windmill: a 4 × 4 field (its 2 × 2 + 1 tile around)', () => {
    expect(powerField(at('w', 'windmill_small', 5, 5))).toEqual({ x: 4, y: 4, width: 4, height: 4 })
    // The Grand Windmill: a 2 × 2 tower reaching 2 tiles all round (6 × 6).
    expect(powerField(at('w', 'windmill_large', 5, 5))).toEqual({ x: 3, y: 3, width: 6, height: 6 })
    expect(powerField(at('f', 'furniture_factory', 5, 5))).toBeNull()
  })

  it('a factory works when it touches a field, even by one tile; not beyond', () => {
    const mill = at('w', 'windmill_small', 5, 5) // field x 4..7, y 4..7
    expect(checkIsPowered(at('f', 'furniture_factory', 8, 5), [mill])).toBe(false) // x 8..9: just outside
    expect(checkIsPowered(at('f', 'furniture_factory', 7, 5), [mill])).toBe(true) // shares column 7
    expect(checkIsPowered(at('f', 'furniture_factory', 7, 7), [mill])).toBe(true) // shares tile (7, 7)
    expect(checkIsPowered(at('f', 'furniture_factory', 8, 8), [mill])).toBe(false) // diagonal, outside
    expect(checkIsPowered(at('f', 'furniture_factory', 10, 10), [])).toBe(false) // no windmill at all
  })

  it('the Grand Windmill reaches 2 tiles beyond its 2 × 2 tower (a 6 × 6 zone)', () => {
    const mill = at('w', 'windmill_large', 0, 0) // field −2..3
    expect(checkIsPowered(at('f', 'furniture_factory', 3, 3), [mill])).toBe(true)
    expect(checkIsPowered(at('f', 'furniture_factory', 4, 4), [mill])).toBe(false)
    const grand = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261016000000_grand_windmill.sql'), 'utf8').split('-- Verify')[0]
    expect(grand).toMatch(/when 'windmill_small' then 1 when 'windmill_large' then 2/)
    expect(grand).toMatch(/when 'windmill_large'\s+then v_cost := 60; v_w := 2; v_h := 2;/)
    expect(grand).toMatch(/update public\.garden_placements set width = 2, height = 2 where item_type = 'windmill_large'/)
  })

  it('buildings that need no power always work; the seaport needs it too', () => {
    expect(checkIsPowered(at('m', 'windmill_small', 0, 0), [])).toBe(true)
    expect(checkIsPowered(at('r', 'rockery', 0, 0), [])).toBe(true)
    expect(checkIsPowered(at('s', 'seaport', 0, 14), [])).toBe(false)
    expect(checkIsPowered(at('s', 'seaport', 0, 14), [at('w', 'windmill_small', 6, 12)])).toBe(true)
  })

  it('poweredMap lists only the buildings that need power', () => {
    const farm = [at('w', 'windmill_small', 0, 0), at('f', 'furniture_factory', 2, 0), at('g', 'furniture_factory', 10, 10), at('r', 'rockery', 5, 5)]
    expect(Object.fromEntries(poweredMap(farm))).toEqual({ f: true, g: false })
  })

  it('the database applies the same field rule (reach 1 and 3, footprints touching)', () => {
    expect(SQL).toMatch(/when 'windmill_small' then 1 when 'windmill_large' then 3/)
    expect(SQL).toMatch(/w\.grid_x - public\.farm_power_reach\(w\.item_type\) < b\.grid_x \+ b\.width/)
    expect(SQL).toMatch(/b\.grid_x < w\.grid_x \+ w\.width \+ public\.farm_power_reach\(w\.item_type\)/)
    expect(SQL).toMatch(/when b\.item_type not in \('furniture_factory', 'seaport'\) then true/)
  })
})

describe('validateSeaportPlacement: coast only', () => {
  it('stands on the first two rows or the last two, its long edge on the shore', () => {
    expect(validateSeaportPlacement({ x: 0, y: 0, width: 6, height: 2 }, [])).toBe('ok')
    expect(validateSeaportPlacement({ x: 10, y: GRID_SIZE - 2, width: 6, height: 2 }, [])).toBe('ok')
    expect(validateSeaportPlacement({ x: 4, y: 1, width: 6, height: 2 }, [])).toBe('not-coastal')
    expect(validateSeaportPlacement({ x: 4, y: 7, width: 6, height: 2 }, [])).toBe('not-coastal')
    expect(isCoastalSpot({ x: 0, y: 0, width: 2, height: 6 })).toBe(false)
  })

  it('still refuses taken and off-grid spots (those reasons first)', () => {
    expect(validateSeaportPlacement({ x: 11, y: 0, width: 6, height: 2 }, [])).toBe('out-of-bounds')
    expect(validateSeaportPlacement({ x: 0, y: 0, width: 6, height: 2 }, [at('r', 'rockery', 3, 1)])).toBe('occupied')
  })

  it('moving a seaport along the shore ignores its own old tiles', () => {
    const port = at('s', 'seaport', 0, 14)
    expect(validateSeaportPlacement({ x: 2, y: 14, width: 6, height: 2 }, [port], 's')).toBe('ok')
    expect(checkItemPlacement([port], 'seaport', { x: 2, y: 6, width: 6, height: 2 }, 's')).toBe('not-coastal')
    // Other items keep the plain rules.
    expect(checkItemPlacement([port], 'furniture_factory', { x: 5, y: 6, width: 2, height: 2 })).toBe('ok')
  })

  it('lists the shoreline spots, green where free', () => {
    const spots = seaportSpots([at('r', 'rockery', 0, 0)])
    expect(spots).toHaveLength(2 * (GRID_SIZE - 6 + 1))
    expect(spots.filter((s) => !s.ok).map((s) => s.spot.x)).toEqual([0])
  })

  it('the database refuses an inland seaport, on purchase and on a move', () => {
    expect(SQL).toMatch(/if p_item_type = 'seaport' and not \(p_y = 0 or p_y \+ v_h = 16\) then\s+raise exception 'NOT_COASTAL'/)
    expect(SQL).toMatch(/if v_type = 'seaport' and not \(p_new_y = 0 or p_new_y \+ v_h = 16\) then\s+raise exception 'NOT_COASTAL'/)
  })
})

describe('the export loop', () => {
  it('produces timber, produce and furniture by the hour, capped, with factories limited by timber', () => {
    const empty = { timber: 0, produce: 0, furniture: 0 }
    expect(produce(empty, { trees: 3, animals: 2, poweredFactories: 0 }, 2)).toEqual({ timber: 6, produce: 4, furniture: 0 })
    // One factory, 4 hours, 10 timber made: 4 furniture from 8 timber.
    expect(produce(empty, { trees: 2.5, animals: 0, poweredFactories: 1 }, 4)).toEqual({ timber: 2, produce: 0, furniture: 4 })
    expect(produce(empty, { trees: 100, animals: 100, poweredFactories: 0 }, 1000)).toEqual({ timber: STOCK_CAPS.timber, produce: STOCK_CAPS.produce, furniture: 0 })
  })

  it('a ship pays the stock’s value up to the cap, and leaves the rest for the next one', () => {
    expect(exportValue({ furniture: 2, produce: 4, timber: 5 })).toBe(9)
    expect(shipVisit({ furniture: 2, produce: 4, timber: 5 })).toEqual({ payout: 9, left: { furniture: 0, produce: 0, timber: 0 } })
    const big = shipVisit({ furniture: 10, produce: 4, timber: 10 })
    expect(big.payout).toBe(SHIP_MAX_PAYOUT)
    expect(big.left.furniture).toBeCloseTo(10 * (1 - 15 / 34))
    expect(shipVisit({ furniture: 0, produce: 0, timber: 0 }).payout).toBe(0)
  })

  it('the database uses the same numbers', () => {
    expect(SQL).toContain(`v_trees * ${TIMBER_PER_TREE_HOUR} * v_hours, ${STOCK_CAPS.timber})`)
    expect(SQL).toContain(`v_animals * ${PRODUCE_PER_ANIMAL_HOUR} * v_hours, ${STOCK_CAPS.produce})`)
    expect(SQL).toContain(`v_factories * ${FACTORY_FURNITURE_PER_HOUR} * v_hours, v_row.timber / ${FACTORY_TIMBER_PER_FURNITURE}, ${STOCK_CAPS.furniture} - v_row.furniture`)
    expect(SQL).toContain(`interval '${SHIP_INTERVAL_HOURS} hours'`)
    expect(SQL).toContain(`floor(v_row.furniture * ${EXPORT_PRICES.furniture} + v_row.produce * ${EXPORT_PRICES.produce} + v_row.timber * ${EXPORT_PRICES.timber})`)
    expect(SQL).toContain(`least(v_value, ${SHIP_MAX_PAYOUT})`)
    expect(SQL).toContain(`, ${CATCH_UP_HOURS});`)
  })
})

describe('the buildings on the island', () => {
  it('windmills turn their sails; the factory smokes and its gear turns only while powered', () => {
    expect(renderToStaticMarkup(createElement('svg', null, createElement(WindmillSprite, { size: 'large' })))).toMatch(/class="mg-spin"/)
    const on = renderToStaticMarkup(createElement('svg', null, createElement(FactorySprite, { powered: true })))
    const off = renderToStaticMarkup(createElement('svg', null, createElement(FactorySprite, { powered: false })))
    expect(on).toContain('mg-smoke')
    expect(on).toContain('mg-spin-slow')
    expect(off).not.toContain('mg-smoke')
    expect(off).not.toContain('mg-spin-slow')
  })

  it('the seaport has its cranes, crates and bollards, and a cargo ship only while powered', () => {
    const on = renderToStaticMarkup(createElement('svg', null, createElement(SeaportSprite, { shore: 'front', powered: true })))
    expect(on).toContain('data-ship=""')
    expect(on).toContain('class="mg-ship"')
    expect(on).toMatch(/--mg-ox:-56\.0px/)
    expect(renderToStaticMarkup(createElement('svg', null, createElement(SeaportSprite, { shore: 'back', powered: true })))).toMatch(/--mg-ox:56\.0px/)
    expect(renderToStaticMarkup(createElement('svg', null, createElement(SeaportSprite, { powered: false })))).not.toContain('data-ship')
  })

  it('the inspector says what each building is doing, its power and its goods', () => {
    const stock = { timber: 12, produce: 3, furniture: 4.25, fruit: 0, candy: 0, candyShipped: 0, candyPayout: 0, payout: 0, totalCoins: 100, lastExportAt: null }
    expect(buildingStatus('furniture_factory', { powered: false, economy: stock })).toMatchObject({ status: 'Paused: Needs Power', tone: 'off' })
    expect(buildingStatus('furniture_factory', { powered: true, economy: stock })).toMatchObject({ status: '🪑 Making furniture', outputs: [{ value: '4.3' }] })
    expect(buildingStatus('furniture_factory', { powered: true, economy: { ...stock, timber: 1 } })?.status).toBe('Waiting for timber')
    expect(buildingStatus('seaport', { powered: true, economy: stock })?.status).toBe('Exporting Goods...')
    const now = Date.parse('2026-10-14T10:00:00Z')
    expect(buildingStatus('seaport', { powered: true, economy: { ...stock, payout: 12, lastExportAt: '2026-10-14T09:55:00Z' }, now })?.status).toBe('🚢 Cargo Ship Docked')
    expect(buildingStatus('windmill_small', { poweredCount: 2, economy: null })?.power).toBe('Power field: 4×4 around it · powering 2 buildings')
    expect(buildingStatus('woodshop', { economy: null })?.status).toMatch(/Retired building/)
    expect(buildingStatus('rockery', { economy: null })).toBeNull()
  })
})

describe('strict English in the new building code', () => {
  it('has no Vietnamese text in labels, strings or comments', () => {
    const files = ['lib/powerGrid.ts', 'lib/farmEconomy.ts', 'lib/buildingStatus.ts', 'components/PowerBuildings.tsx', 'components/FarmItemDialog.tsx', 'lib/farmCatalog.ts']
    for (const f of files) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/)
    }
    expect(SQL).not.toMatch(/[ăâđêôơưàáảãạ]/)
  })
})
