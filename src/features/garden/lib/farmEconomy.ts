// The island's production and export loop (pure, unit-tested). The database does the real work,
// from timestamps, in settle_farm_economy() (migration 20261014000000_power_grid.sql): the client
// never decides what was made or what a ship pays. The same numbers live in the SQL; a test checks
// they match.
//
//   Trees    → timber   (TIMBER_PER_TREE_HOUR each)
//   Animals  → produce  (PRODUCE_PER_ANIMAL_HOUR each)
//   Furniture Factory (powered) → turns FACTORY_TIMBER_PER_FURNITURE timber into 1 furniture,
//                                 FACTORY_FURNITURE_PER_HOUR each
//   Seaport (powered) → a cargo ship calls every SHIP_INTERVAL_HOURS, buys the stock at EXPORT_PRICES
//                       and pays up to SHIP_MAX_PAYOUT coins (what it can't pay for stays in stock)
//   Harvest  → fruit    (FRUIT_PER_HARVEST 🍎 per ripe tree, shared/lib/economy; harvest_tree_fruit())
//   Candy Factory (powered) → turns FRUIT_PER_CANDY fruit into 1 candy box, CANDY_PER_FACTORY_HOUR each
//   A Road linking a powered Candy Factory to a powered Seaport (lib/roads.ts candyLinked; a Delivery
//                       Truck runs it) → every whole candy box is exported at CANDY_EXPORT_COINS coins
// Stocks are capped (STOCK_CAPS); a long absence counts at most CATCH_UP_HOURS.

export const TIMBER_PER_TREE_HOUR = 1
export const PRODUCE_PER_ANIMAL_HOUR = 1
export const FACTORY_TIMBER_PER_FURNITURE = 2
export const FACTORY_FURNITURE_PER_HOUR = 1
export const SHIP_INTERVAL_HOURS = 4
export const SHIP_MAX_PAYOUT = 15
export const CATCH_UP_HOURS = 48
export const STOCK_CAPS = { timber: 60, produce: 40, furniture: 30, candy: 20 } as const
export const FRUIT_PER_CANDY = 10
export const CANDY_PER_FACTORY_HOUR = 1
export const CANDY_EXPORT_COINS = 15
// Coins per unit of each good.
export const EXPORT_PRICES = { furniture: 3, produce: 0.5, timber: 0.2 } as const

export type FarmStock = { timber: number; produce: number; furniture: number }
// The island's inventory beyond the ship's goods: harvested fruit and candy boxes.
export type CandyStock = { fruit: number; candy: number }

// What the farm shows: the stock after the last settlement, and what the last ship paid.
export type FarmEconomyView = FarmStock &
  CandyStock & {
  // Candy boxes the Delivery Truck brought to the dock on this settlement, and the coins they fetched.
  candyShipped: number
  candyPayout: number
  // Coins the ship that just left paid (0 when none left on this settlement).
  payout: number
  // The purse after it.
  totalCoins: number | null
  lastExportAt: string | null
}

// What a ship would pay for this stock (whole coins, before the per-ship cap).
export function exportValue(stock: FarmStock): number {
  return Math.floor(stock.furniture * EXPORT_PRICES.furniture + stock.produce * EXPORT_PRICES.produce + stock.timber * EXPORT_PRICES.timber)
}

// A ship's visit: the payout (capped) and the stock it leaves behind. When the stock is worth more
// than the cap, the ship takes the same share of every good and the rest waits for the next one.
export function shipVisit(stock: FarmStock): { payout: number; left: FarmStock } {
  const value = exportValue(stock)
  if (value <= 0) return { payout: 0, left: stock }
  const payout = Math.min(value, SHIP_MAX_PAYOUT)
  const keep = 1 - payout / value
  return {
    payout,
    left: { timber: stock.timber * keep, produce: stock.produce * keep, furniture: stock.furniture * keep },
  }
}

// Production over `hours` (capped at CATCH_UP_HOURS) for these counts; poweredFactories only.
export function produce(stock: FarmStock, counts: { trees: number; animals: number; poweredFactories: number }, hours: number): FarmStock {
  const h = Math.min(Math.max(0, hours), CATCH_UP_HOURS)
  const timber = Math.min(stock.timber + counts.trees * TIMBER_PER_TREE_HOUR * h, STOCK_CAPS.timber)
  const produced = Math.min(stock.produce + counts.animals * PRODUCE_PER_ANIMAL_HOUR * h, STOCK_CAPS.produce)
  const made = Math.max(0, Math.min(counts.poweredFactories * FACTORY_FURNITURE_PER_HOUR * h, timber / FACTORY_TIMBER_PER_FURNITURE, STOCK_CAPS.furniture - stock.furniture))
  return { timber: timber - made * FACTORY_TIMBER_PER_FURNITURE, produce: produced, furniture: stock.furniture + made }
}

// The Candy Factories at work for `hours` (capped at CATCH_UP_HOURS): each makes up to
// CANDY_PER_FACTORY_HOUR boxes an hour from FRUIT_PER_CANDY fruit each, as far as the fruit and the
// store (STOCK_CAPS.candy) allow. Fractional, so frequent visits lose nothing.
export function makeCandy(stock: CandyStock, poweredFactories: number, hours: number): CandyStock {
  const h = Math.min(Math.max(0, hours), CATCH_UP_HOURS)
  const made = Math.max(0, Math.min(poweredFactories * CANDY_PER_FACTORY_HOUR * h, stock.fruit / FRUIT_PER_CANDY, STOCK_CAPS.candy - stock.candy))
  return { fruit: stock.fruit - made * FRUIT_PER_CANDY, candy: stock.candy + made }
}

// The Delivery Truck's run to the Seaport: every whole candy box is exported for CANDY_EXPORT_COINS.
export function deliverCandy(candy: number): { shipped: number; payout: number; left: number } {
  const shipped = Math.max(0, Math.floor(candy + 1e-9))
  return { shipped, payout: shipped * CANDY_EXPORT_COINS, left: candy - shipped }
}
