// 🪙 Seed & coin economy (pure, unit-tested). The database enforces the same numbers
// (migration 20260928000500_seed_economy.sql): keep them in sync.

// Every new gardener's purse: 3 tree seeds.
export const STARTING_COINS = 300
// Price of one tree seed (planting a new deck).
export const SEED_PRICE_COINS = 100
// A tree you drilled yesterday bears fruit at your midnight: harvest it once that day for this much
// (migration 20261003000000 harvest_tree_fruit() pays the same; a test checks).
export const FRUIT_COINS = 2

// Cloning someone else's shared tree: a seed plus 1 🪙 per statement, capped at 150.
export const CLONE_COST_CAP = 150
export const cloneCost = (statementCount: number): number =>
  Math.min(SEED_PRICE_COINS + Math.max(0, Math.floor(Number.isFinite(statementCount) ? statementCount : 0)), CLONE_COST_CAP)

export const canAffordSeed =(coins: number | null | undefined): boolean => coins != null && coins >= SEED_PRICE_COINS

// How many seeds a purse buys.
export const seedsAffordable = (coins: number | null | undefined): number => (coins == null || coins < 0 ? 0 : Math.floor(coins / SEED_PRICE_COINS))

// Coin Shop packages. Prices in VND; the base rate is 1,000 VND per coin.
// Real payments come later: for now the shop only simulates top-ups in development.
export const VND_PER_COIN = 1_000

export type CoinPackage = {
  id: 'coins-10' | 'coins-20' | 'coins-50' | 'coins-100'
  coins: number
  priceVnd: number
  // Extra label, e.g. "1 Tree Seed 🌱".
  bonus?: string
  bestValue?: boolean
}

export const COIN_PACKAGES: readonly CoinPackage[] = [
  { id: 'coins-10', coins: 10, priceVnd: 10_000 },
  { id: 'coins-20', coins: 20, priceVnd: 18_000 },
  { id: 'coins-50', coins: 50, priceVnd: 40_000 },
  { id: 'coins-100', coins: 100, priceVnd: 68_000, bonus: '1 Tree Seed 🌱', bestValue: true },
]

export const COIN_PACKAGE_IDS = COIN_PACKAGES.map((p) => p.id) as [CoinPackage['id'], ...CoinPackage['id'][]]

export const findCoinPackage = (id: string): CoinPackage | undefined => COIN_PACKAGES.find((p) => p.id === id)

// Whole-percent saving against the base rate (0 for the base package).
export const packageSavingsPercent = (p: Pick<CoinPackage, 'coins' | 'priceVnd'>): number =>
  Math.max(0, Math.round((1 - p.priceVnd / (p.coins * VND_PER_COIN)) * 100))

// "68.000 ₫" (Vietnamese grouping, same output on server and client).
export const formatVnd = (amount: number): string => `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`
