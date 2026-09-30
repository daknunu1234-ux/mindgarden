// The farm shop catalogue (pure). The database charges the same prices and uses the same sizes in
// purchase_and_place_item() (migration 20260930000000_farm_grid.sql); a test checks they match.

export type FarmItemType = 'tree' | 'fence' | 'stream' | 'farmer_house' | 'woodshop' | 'rockery' | 'animal'
export type ShopTab = 'trees' | 'structures' | 'landscape' | 'decorations' | 'animals'
export type AnimalVariant = 'cow' | 'pig'

export type CatalogItem = {
  // Shop id: the item type, or the animal for animals ('cow' / 'pig').
  id: 'farmer_house' | 'woodshop' | 'stream' | 'fence' | 'rockery' | 'cow' | 'pig'
  itemType: Exclude<FarmItemType, 'tree'>
  variant: AnimalVariant | null
  tab: Exclude<ShopTab, 'trees'>
  name: string
  icon: string
  price: number
  width: number
  height: number
  description: string
}

export const FARM_CATALOG: readonly CatalogItem[] = [
  {
    id: 'farmer_house',
    itemType: 'farmer_house',
    variant: null,
    tab: 'structures',
    name: "Farmer's House",
    icon: '🏡',
    price: 50,
    width: 2,
    height: 2,
    description: 'Aura: +50% coins for trees in its 4×4 area (the house and one tile around it).',
  },
  {
    id: 'woodshop',
    itemType: 'woodshop',
    variant: null,
    tab: 'structures',
    name: 'Woodshop',
    icon: '🪚',
    price: 50,
    width: 2,
    height: 2,
    description: 'Chopping a tree refunds 25% of its statements as coins (at most 50).',
  },
  {
    id: 'stream',
    itemType: 'stream',
    variant: null,
    tab: 'landscape',
    name: 'Stream',
    icon: '🌊',
    price: 5,
    width: 1,
    height: 1,
    description: '+20% coins for trees right next to it.',
  },
  {
    id: 'fence',
    itemType: 'fence',
    variant: null,
    tab: 'decorations',
    name: 'Fence',
    icon: '🪵',
    price: 1,
    width: 1,
    height: 1,
    description: 'Joins up with the fences next to it.',
  },
  {
    id: 'rockery',
    itemType: 'rockery',
    variant: null,
    tab: 'decorations',
    name: 'Rockery',
    icon: '🪨',
    price: 2,
    width: 1,
    height: 1,
    description: 'A mossy pile of garden boulders.',
  },
  {
    id: 'cow',
    itemType: 'animal',
    variant: 'cow',
    tab: 'animals',
    name: 'Cow',
    icon: '🐄',
    price: 5,
    width: 1,
    height: 1,
    description: 'Wanders around its pasture tile.',
  },
  {
    id: 'pig',
    itemType: 'animal',
    variant: 'pig',
    tab: 'animals',
    name: 'Pig',
    icon: '🐖',
    price: 5,
    width: 1,
    height: 1,
    description: 'Snuffles about with funny idle animations.',
  },
]

export const SHOP_TABS: readonly { id: ShopTab; label: string }[] = [
  { id: 'trees', label: '🌳 Trees' },
  { id: 'structures', label: '🏗️ Structures' },
  { id: 'landscape', label: '🌊 Landscape' },
  { id: 'decorations', label: '🪵 Decorations' },
  { id: 'animals', label: '🐮 Animals' },
]

export const catalogItem = (id: string): CatalogItem | undefined => FARM_CATALOG.find((i) => i.id === id)

// The catalogue entry a placed item came from (for names, icons and buff text on the farm).
export const catalogFor = (itemType: FarmItemType, variant: string | null): CatalogItem | undefined =>
  FARM_CATALOG.find((i) => i.itemType === itemType && (i.itemType !== 'animal' || i.variant === variant))
