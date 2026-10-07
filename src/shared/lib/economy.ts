// 🪙 Seed & coin economy (pure, unit-tested). The database enforces the same numbers
// (migration 20260928000500_seed_economy.sql): keep them in sync.

// Every new gardener's purse: 3 tree seeds.
export const STARTING_COINS = 300
// Price of one tree seed (planting a new deck) of a standard species.
export const SEED_PRICE_COINS = 100
// Price of a surreal species' seed (Crystal Flora, Cosmic Nebula, Chrono Willow). Which species
// costs what is in the catalogue (shared/lib/treeSkins.ts `price`, `seedPrice`); the database charges
// the same through seed_price() (migration 20261006000000_species_seed_prices.sql; a test checks).
export const SURREAL_SEED_PRICE_COINS = 180
// A special tree (a species whose seed costs SURREAL_SEED_PRICE_COINS) pays this many times the
// mastery coins of a standard tree, on every statement mastered on it. The database pays the same
// through species_coin_multiplier() (migration 20261009000000_special_tree_coin_bonus.sql; a test
// checks). Which species are special: shared/lib/treeSkins.ts `isSpecialTree`.
export const SPECIAL_COIN_MULTIPLIER = 1.5
// What mastering a statement pays before any multiplier.
export const MASTERY_COIN = 1

// The coins one mastered statement pays, as the database computes it (award_mastery_coin()):
// 1 × the farm buff × the species bonus, plus the fraction carried from earlier payouts; whole coins
// are paid and the rest is carried on (always under one coin). So ×1.5 pays 1, 2, 1, 2, …: exactly
// one and a half coins a statement over time, never rounded away and never rounded up.
export function masteryCoinPayout(farmBuff: number, speciesBonus: number, carry = 0): { coins: number; carry: number } {
  const safe = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback)
  const amount = MASTERY_COIN * safe(farmBuff, 1) * safe(speciesBonus, 1) + Math.min(Math.max(0, Number.isFinite(carry) ? carry : 0), 0.999)
  const coins = Math.floor(amount + 1e-9)
  return { coins, carry: Math.max(0, +(amount - coins).toFixed(3)) }
}

// How a coin bonus reads on a tag: "1.5x Coins".
export const coinBonusLabel = (multiplier: number): string => `${+multiplier.toFixed(2)}x Coins`
// The same bonus as a percentage: "+50%".
export const coinBonusPercent = (multiplier: number): string => `+${Math.round((multiplier - 1) * 100)}%`

// A tree you drilled yesterday bears fruit at your midnight: harvest it once that day for this many
// 🍎 (fruit for the island's Candy Factory; until migration 20261015000000 a harvest paid this many
// coins instead). harvest_tree_fruit() gives the same; a test checks.
export const FRUIT_PER_HARVEST = 2

// Cloning someone else's shared tree: the seed of its species plus 1 🪙 per statement, at most 50
// statements' worth. A standard tree: 100–150 (CLONE_COST_CAP); a surreal one: 180–230.
export const CLONE_STATEMENT_CAP = 50
export const CLONE_COST_CAP = SEED_PRICE_COINS + CLONE_STATEMENT_CAP
export const cloneCost = (statementCount: number, seedPrice: number = SEED_PRICE_COINS): number =>
  seedPrice + Math.min(Math.max(0, Math.floor(Number.isFinite(statementCount) ? statementCount : 0)), CLONE_STATEMENT_CAP)

// `price`: the seed of the species being planted (treeSkins seedPrice); a standard seed by default.
export const canAffordSeed = (coins: number | null | undefined, price: number = SEED_PRICE_COINS): boolean => coins != null && coins >= price

// A price tag for a seed card: how it reads and whether the purse covers it. An unknown purse
// (signed out, unreadable) never shows as short: the server decides at purchase.
export type SeedPriceTag = { price: number; label: string; short: boolean; title: string }
export function seedPriceTag(price: number, coins: number | null | undefined): SeedPriceTag {
  const short = coins != null && coins < price
  return {
    price,
    label: `🪙 ${price}`,
    short,
    title: short ? `Not enough coins: you need ${price - coins!} more 🪙` : `Seed price: ${price} coins`,
  }
}

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
