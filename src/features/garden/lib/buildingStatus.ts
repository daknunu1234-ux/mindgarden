// What a building's inspector says (pure, tested): its operational status, its power state, and its
// inputs and outputs. All strings in English.
import { catalogFor, isRetired, type FarmItemType } from './farmCatalog'
import { CANDY_EXPORT_COINS, FRUIT_PER_CANDY, SHIP_INTERVAL_HOURS, SHIP_MAX_PAYOUT, type FarmEconomyView } from './farmEconomy'

export type StatusTone = 'ok' | 'warn' | 'off'
export type BuildingStatus = {
  // One line: what it is doing now.
  status: string
  tone: StatusTone
  // Power line (null for things that neither make nor need power).
  power: string | null
  inputs: { label: string; value: string }[]
  outputs: { label: string; value: string }[]
}

const units = (n: number) => (Math.round(n * 10) / 10).toString()
// A recent departure counts as "docked" for the status line (the ship loads, then leaves).
const DOCKED_MS = 10 * 60 * 1000

export function buildingStatus(
  itemType: FarmItemType,
  {
    powered,
    poweredCount = 0,
    economy,
    linked = false,
    now = Date.now(),
  }: {
    powered?: boolean
    poweredCount?: number
    economy: FarmEconomyView | null
    // Candy Factory / Seaport / train: a Freight Train runs between them on connected track.
    linked?: boolean
    now?: number
  },
): BuildingStatus | null {
  const entry = catalogFor(itemType, null)
  if (!entry) return null
  if (isRetired(itemType)) {
    return { status: 'Retired building: no longer sold, still working', tone: 'ok', power: null, inputs: [], outputs: [] }
  }
  const stock = economy
  switch (itemType) {
    case 'windmill_small':
    case 'windmill_large': {
      const side = entry.width + 2 * (entry.powerReach ?? 0)
      return {
        status: '⚡ Generating power',
        tone: 'ok',
        power: `Power field: ${side}×${side} around it · powering ${poweredCount} ${poweredCount === 1 ? 'building' : 'buildings'}`,
        inputs: [{ label: 'Wind', value: 'Always blowing' }],
        outputs: [{ label: 'Power', value: `${side}×${side} area` }],
      }
    }
    case 'furniture_factory': {
      const timber = stock?.timber ?? 0
      return {
        status: !powered ? 'Paused: Needs Power' : timber < 2 ? 'Waiting for timber' : '🪑 Making furniture',
        tone: !powered ? 'off' : timber < 2 ? 'warn' : 'ok',
        power: powered ? '⚡ Powered' : '⚡ No Power: place a Windmill nearby',
        inputs: [{ label: '🪵 Timber (from your trees)', value: stock ? units(timber) : '–' }],
        outputs: [{ label: '🪑 Furniture', value: stock ? units(stock.furniture) : '–' }],
      }
    }
    case 'candy_factory': {
      const fruit = stock?.fruit ?? 0
      return {
        status: !powered ? 'Paused: Needs Power' : fruit < FRUIT_PER_CANDY ? `Waiting for fruit (${FRUIT_PER_CANDY} make a box)` : '🍬 Making candy',
        tone: !powered ? 'off' : fruit < FRUIT_PER_CANDY ? 'warn' : 'ok',
        power: powered ? '⚡ Powered' : '⚡ No Power: place a Windmill nearby',
        inputs: [{ label: '🍎 Fruit (from your harvests)', value: stock ? units(fruit) : '–' }],
        outputs: [
          { label: '🍬 Candy boxes', value: stock ? units(stock.candy) : '–' },
          { label: '🚂 Railway pickup', value: linked ? 'Connected to the Seaport' : 'Not connected: lay track to the Seaport and add a Freight Train' },
        ],
      }
    }
    case 'rail_track':
      return {
        status: linked ? '🛤️ Part of a freight line' : 'Railroad Track',
        tone: 'ok',
        power: null,
        inputs: [],
        outputs: [],
      }
    case 'freight_train':
      return {
        status: linked ? '🚂 Carrying candy boxes to the Seaport' : 'Idle: no Candy Factory and Seaport on its line',
        tone: linked ? 'ok' : 'warn',
        power: null,
        inputs: [{ label: '🍬 Candy boxes waiting', value: stock ? units(stock.candy) : '–' }],
        outputs: [{ label: '🪙 Each box at the Seaport', value: `${CANDY_EXPORT_COINS} coins` }],
      }
    case 'seaport': {
      const docked = stock?.lastExportAt ? now - new Date(stock.lastExportAt).getTime() < DOCKED_MS && stock.payout > 0 : false
      return {
        status: !powered ? 'Paused: Needs Power' : docked ? '🚢 Cargo Ship Docked' : 'Exporting Goods...',
        tone: powered ? 'ok' : 'off',
        power: powered ? '⚡ Powered' : '⚡ No Power: place a Windmill nearby',
        inputs: [
          { label: '🪑 Furniture', value: stock ? units(stock.furniture) : '–' },
          { label: '🪵 Timber', value: stock ? units(stock.timber) : '–' },
          { label: '🥛 Produce', value: stock ? units(stock.produce) : '–' },
          { label: '🍬 Candy boxes (by train)', value: linked ? 'Arriving by Freight Train' : 'No train line yet' },
        ],
        outputs: [
          { label: '🪙 Each candy box', value: `${CANDY_EXPORT_COINS} coins` },
          { label: '🪙 Other goods', value: `A cargo ship calls every ${SHIP_INTERVAL_HOURS} hours and pays up to ${SHIP_MAX_PAYOUT}` },
        ],
      }
    }
    default:
      return null
  }
}
