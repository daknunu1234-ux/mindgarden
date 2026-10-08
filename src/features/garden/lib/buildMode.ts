// Continuous placement (pure, unit-tested): the 1 × 1 tiles that join up with their neighbours (Road,
// Water, Fence) are laid like paint. Placing one keeps the tool in hand, so the next click lays the
// next tile, until the player is done (Esc, the Done button, a click off the island, the tab hidden)
// or can't pay for another. Everything else leaves placement mode once it is put down.
import type { CatalogItem, FarmItemType } from './farmCatalog'

// The item types laid tile after tile.
export const CONTINUOUS_TYPES: readonly FarmItemType[] = ['road', 'stream', 'fence']

type Item = Pick<CatalogItem, 'itemType' | 'width' | 'height'>

export const isContinuous = (item: Item): boolean => item.width === 1 && item.height === 1 && CONTINUOUS_TYPES.includes(item.itemType)

// Whether the purse pays for one (an unknown purse: let the server decide).
export const canAfford = (price: number, coins: number | null): boolean => coins === null || coins >= price

// What happens once a tile is put down, given the coins left after paying for it: keep placing, or
// leave (a one-off item; or out of coins for another tile).
export type AfterPlace = { keep: true } | { keep: false; reason: 'single' | 'out-of-coins' }
export function afterPlace(item: Item & Pick<CatalogItem, 'price'>, coinsLeft: number | null): AfterPlace {
  if (!isContinuous(item)) return { keep: false, reason: 'single' }
  return canAfford(item.price, coinsLeft) ? { keep: true } : { keep: false, reason: 'out-of-coins' }
}

// The key that ends placement mode.
export const isExitKey = (key: string): boolean => key === 'Escape' || key === 'Esc'

// The banner while laying tiles.
export const continuousHint = (name: string): string => `Placing ${name} • Click to place • Press ESC when done`

// The toast when the purse runs dry mid-way.
export const outOfCoinsMessage = (name: string, price: number): string => `Out of coins: another ${name} costs ${price} 🪙`
