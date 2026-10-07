// The farm shop catalogue (pure). The database charges the same prices and uses the same sizes in
// purchase_and_place_item() (migrations 20260930000000_farm_grid.sql, 20261014000000_power_grid.sql and,
// for today's prices, 20261015000000_rail_logistics.sql and 20261017000000_unified_windmill.sql); tests
// check they match.

export type FarmItemType =
  | 'tree'
  | 'fence'
  | 'stream'
  | 'farmer_house'
  | 'woodshop'
  | 'rockery'
  | 'animal'
  | 'windmill_small'
  | 'furniture_factory'
  | 'seaport'
  | 'candy_factory'
  | 'rail_track'
  | 'freight_train'
export type ShopTab = 'trees' | 'structures' | 'railway' | 'landscape' | 'decorations' | 'animals'
export type AnimalVariant = 'cow' | 'pig'

export type CatalogItem = {
  // Shop id: the item type, or the animal for animals ('cow' / 'pig').
  id:
    | 'farmer_house'
    | 'woodshop'
    | 'windmill_small'
    | 'furniture_factory'
    | 'candy_factory'
    | 'seaport'
    | 'rail_track'
    | 'freight_train'
    | 'stream'
    | 'fence'
    | 'rockery'
    | 'cow'
    | 'pig'
  itemType: Exclude<FarmItemType, 'tree'>
  variant: AnimalVariant | null
  tab: Exclude<ShopTab, 'trees'>
  name: string
  icon: string
  price: number
  width: number
  height: number
  description: string
  // Power grid (lib/powerGrid.ts): a power source's field reaches `powerReach` tiles beyond its
  // footprint on every side; a building that `requiresPower` works only while it touches a field.
  powerReach?: number
  requiresPower?: boolean
  // Seaport: its long edge must lie on the shore (lib/powerGrid.ts validateSeaportPlacement).
  coastal?: boolean
  // Freight Train: stands only on Railroad Track tiles (lib/railway.ts checkTrainPlacement).
  onTracks?: boolean
}

// Retired buildings: no longer sold (the database refuses new ones too), but ones already standing
// on an island keep working, moving and paying their buffs, so no saved island changes.
export const RETIRED_CATALOG: readonly CatalogItem[] = [
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
]

// What the 🏪 Shop sells.
export const FARM_CATALOG: readonly CatalogItem[] = [
  // The island's one Windmill (item type `windmill_small`, kept as the stored id): a 2 × 2 tower whose
  // field reaches 4 tiles all round, a 10 × 10 area.
  {
    id: 'windmill_small',
    itemType: 'windmill_small',
    variant: null,
    tab: 'structures',
    name: 'Windmill',
    icon: '🌬️',
    price: 60,
    width: 2,
    height: 2,
    description: 'Generates power for buildings in a 10×10 area around it.',
    powerReach: 4,
  },
  {
    id: 'furniture_factory',
    itemType: 'furniture_factory',
    variant: null,
    tab: 'structures',
    name: 'Furniture Factory',
    icon: '🪑',
    price: 50,
    width: 2,
    height: 2,
    description: 'Turns timber from your trees into furniture for export. Needs power.',
    requiresPower: true,
  },
  {
    id: 'candy_factory',
    itemType: 'candy_factory',
    variant: null,
    tab: 'structures',
    name: 'Candy Factory',
    icon: '🍬',
    price: 50,
    width: 2,
    height: 2,
    description: 'Turns 10 fruits 🍎 into 1 candy box 🍬. Needs power; a Freight Train carries the boxes to the Seaport.',
    requiresPower: true,
  },
  {
    id: 'seaport',
    itemType: 'seaport',
    variant: null,
    tab: 'structures',
    name: 'Seaport',
    icon: '⚓',
    price: 100,
    width: 6,
    height: 2,
    description: 'A pier on the coast. Cargo ships export candy boxes (15 coins each), furniture, timber and produce. Needs power; coast only.',
    requiresPower: true,
    coastal: true,
  },
  {
    id: 'rail_track',
    itemType: 'rail_track',
    variant: null,
    tab: 'railway',
    name: 'Railroad Track',
    icon: '🛤️',
    price: 1,
    width: 1,
    height: 1,
    description: 'One tile of track. Joins up with the tracks next to it; connect your factories to the Seaport.',
  },
  {
    id: 'freight_train',
    itemType: 'freight_train',
    variant: null,
    tab: 'railway',
    name: 'Freight Train',
    icon: '🚂',
    price: 30,
    width: 1,
    height: 3,
    description: 'Carries candy boxes from the Candy Factory to the Seaport. Place it on three tracks in a row.',
    onTracks: true,
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
  { id: 'structures', label: '🏗️ Buildings' },
  { id: 'railway', label: '🚂 Railway' },
  { id: 'landscape', label: '🌊 Landscape' },
  { id: 'decorations', label: '🪵 Decorations' },
  { id: 'animals', label: '🐮 Animals' },
]

// Something the Shop sells now (retired buildings are not).
export const catalogItem = (id: string): CatalogItem | undefined => FARM_CATALOG.find((i) => i.id === id)

// The catalogue entry a placed item came from (for names, icons and drawings on the farm), retired
// buildings included.
export const catalogFor = (itemType: FarmItemType, variant: string | null): CatalogItem | undefined =>
  [...FARM_CATALOG, ...RETIRED_CATALOG].find((i) => i.itemType === itemType && (i.itemType !== 'animal' || i.variant === variant))

export const isRetired = (itemType: FarmItemType): boolean => RETIRED_CATALOG.some((i) => i.itemType === itemType)
