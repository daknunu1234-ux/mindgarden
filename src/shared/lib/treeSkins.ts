// Tree species catalog (decks.tree_type): shared by the deck form and validation (decks), the
// tree illustrations (garden) and the root network (mindmap), so every view uses the same wood.

import { SEED_PRICE_COINS, SPECIAL_COIN_MULTIPLIER, SURREAL_SEED_PRICE_COINS } from './economy'

// Drawing: each species has its own silhouette (garden TreeStageSvg); colours below decide the look.
export type TreeForm = 'oak' | 'pine' | 'birch' | 'cherry' | 'willow' | 'mystic' | 'palm' | 'citrus' | 'maple' | 'cactus' | 'crystal' | 'nebula' | 'chrono'

// The surreal species: no leaves, bees or falling petals; each has its own light effect instead
// (drifting motes, a turning nebula, falling light-sand), drawn inside its sprite.
export const SURREAL_FORMS: readonly TreeForm[] = ['crystal', 'nebula', 'chrono']
export const isSurrealForm = (form: TreeForm): boolean => SURREAL_FORMS.includes(form)

export type TreeSkin = {
  canopyLight: string
  canopyDark: string
  // Trunk and root wood, and a deeper shade for the underground conduit.
  bark: string
  barkDeep: string
  // Tint a well-mastered root glows with.
  glow: string
  // Lighting (no outlines): the rich, saturated ambient occlusion under foliage clusters, and the
  // sun-kissed rim light along their upper contours.
  occlusion: string
  rim: string
  // Optional accents: fruit (citrus) and flowers / sparkles (cherry, cactus, mystic).
  fruit?: string
  flower?: string
}

// `price`: 🪙 for this species' seed (planting a new tree). Standard species cost SEED_PRICE_COINS,
// the surreal ones SURREAL_SEED_PRICE_COINS; the database charges the same (seed_price()).
export type TreeSpecies = { id: string; label: string; icon: string; form: TreeForm; price: number; skin: TreeSkin }

// Thirteen species, in the order the pickers show them: ten natural ones, then the three surreal
// ones (Crystal Flora, Cosmic Nebula, Chrono Willow). `form` = the species' own drawing.
export const TREE_SPECIES = [
  {
    id: 'oak',
    label: 'Oak',
    icon: '🌳',
    form: 'oak',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#7ee787', canopyDark: '#16a34a', bark: '#9a5b2c', barkDeep: '#5c3417', glow: '#a3e635', occlusion: '#0b5d2e', rim: '#fff3b0' },
  },
  {
    id: 'pine',
    label: 'Pine',
    icon: '🌲',
    form: 'pine',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#4ade80', canopyDark: '#0f7a3a', bark: '#7a4a23', barkDeep: '#3b2615', glow: '#34d399', occlusion: '#053d22', rim: '#c9fbff' },
  },
  {
    id: 'birch',
    label: 'Golden Birch',
    icon: '🍂',
    form: 'birch',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#fde047', canopyDark: '#e3a008', bark: '#f5f1e8', barkDeep: '#8a8175', glow: '#facc15', occlusion: '#9a5a06', rim: '#fffbe0' },
  },
  {
    id: 'cherry',
    label: 'Cherry Blossom',
    icon: '🌸',
    form: 'cherry',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#fbcfe8', canopyDark: '#f472b6', bark: '#7a3e3e', barkDeep: '#4a2323', glow: '#f9a8d4', occlusion: '#8e2a63', rim: '#fff0f8', flower: '#fff1f7' },
  },
  {
    id: 'willow',
    label: 'Weeping Willow',
    icon: '🌿',
    form: 'willow',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#c5f27a', canopyDark: '#5fa82a', bark: '#7b5a36', barkDeep: '#4a331c', glow: '#bef264', occlusion: '#3f6212', rim: '#f7ffc9' },
  },
  {
    id: 'mystic',
    label: 'Mystic Bonsai',
    icon: '🔮',
    form: 'mystic',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#e0a8ff', canopyDark: '#8b3fd9', bark: '#6b4a5e', barkDeep: '#3d2536', glow: '#e879f9', occlusion: '#4c1d95', rim: '#fbe7ff', flower: '#f5d0fe' },
  },
  {
    id: 'palm',
    label: 'Tropical Palm',
    icon: '🌴',
    form: 'palm',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#6ee77a', canopyDark: '#15944a', bark: '#c98a4b', barkDeep: '#7a4b22', glow: '#86efac', occlusion: '#065f46', rim: '#e6fff0', fruit: '#8a4f22' },
  },
  {
    id: 'citrus',
    label: 'Citrus Grove',
    icon: '🍊',
    form: 'citrus',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#8df07a', canopyDark: '#1f9d3a', bark: '#8a5a2b', barkDeep: '#52341a', glow: '#fdba74', occlusion: '#14532d', rim: '#fff3b0', fruit: '#ff8a1f', flower: '#ffffff' },
  },
  {
    id: 'maple',
    label: 'Autumn Maple',
    icon: '🍁',
    form: 'maple',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#ff8a5c', canopyDark: '#d61f2c', bark: '#6e3b22', barkDeep: '#3e1f10', glow: '#fb7185', occlusion: '#7f1d1d', rim: '#ffe3b8' },
  },
  {
    id: 'cactus',
    label: 'Desert Cactus',
    icon: '🌵',
    form: 'cactus',
    price: SEED_PRICE_COINS,
    skin: { canopyLight: '#8fd46f', canopyDark: '#2f8a3e', bark: '#a16207', barkDeep: '#713f12', glow: '#facc15', occlusion: '#1f5f2c', rim: '#f3ffd6', flower: '#ff5fa2' },
  },
  // Surreal species. Their "canopy" colours are light, not leaves: crystal facets (cyan lit, amethyst
  // shaded), nebula gas (magenta over indigo), golden optic threads.
  {
    id: 'crystal_flora',
    label: 'Crystal Flora',
    icon: '💠',
    form: 'crystal',
    price: SURREAL_SEED_PRICE_COINS,
    skin: { canopyLight: '#a5f3fc', canopyDark: '#a855f7', bark: '#c4b5fd', barkDeep: '#6d28d9', glow: '#67e8f9', occlusion: '#3b0f73', rim: '#f0fdff', flower: '#e9d5ff' },
  },
  {
    id: 'cosmic_nebula',
    label: 'Cosmic Nebula',
    icon: '🌌',
    form: 'nebula',
    price: SURREAL_SEED_PRICE_COINS,
    skin: { canopyLight: '#f0abfc', canopyDark: '#4f46e5', bark: '#3a3f52', barkDeep: '#141824', glow: '#818cf8', occlusion: '#1e1b4b', rim: '#e2e8f0', flower: '#fef9c3' },
  },
  {
    id: 'chrono_willow',
    label: 'Chrono Willow',
    icon: '⏳',
    form: 'chrono',
    price: SURREAL_SEED_PRICE_COINS,
    skin: { canopyLight: '#ffe9a0', canopyDark: '#e0a526', bark: '#9c6b3c', barkDeep: '#4a2f17', glow: '#fcd34d', occlusion: '#7a4a0a', rim: '#fff7d6', flower: '#fff3c4' },
  },
] as const satisfies readonly TreeSpecies[]

export type TreeTypeId = (typeof TREE_SPECIES)[number]['id']

// For z.enum and form options.
export const TREE_TYPE_IDS = TREE_SPECIES.map((s) => s.id) as [TreeTypeId, ...TreeTypeId[]]

// Species retired when the catalogue grew to ten, and the one each became. Migration
// 20261001000000_ten_tree_species.sql rewrites stored rows the same way; until it runs, old rows
// still render as their successor. (The three surreal ids are allowed by
// 20261005000000_surreal_tree_species.sql.)
export const LEGACY_TREE_TYPES: Readonly<Record<string, TreeTypeId>> = { sakura: 'cherry', saguaro: 'cactus', apple: 'citrus', bamboo: 'palm' }

const BY_ID = new Map<string, TreeSpecies>(TREE_SPECIES.map((s) => [s.id, s]))

// Unknown values fall back to oak, retired ones to their successor, so old rows always render.
export const getTreeSpecies = (treeType: string): TreeSpecies => BY_ID.get(treeType) ?? BY_ID.get(LEGACY_TREE_TYPES[treeType] ?? 'oak')!

export const getTreeSkin = (treeType: string): TreeSkin => getTreeSpecies(treeType).skin

// 🪙 for a seed of this species (retired and unknown ids price as the species they render as).
export const seedPrice = (treeType: string | null | undefined): number => getTreeSpecies(treeType ?? 'oak').price

// A special (premium) tree: one whose seed costs SURREAL_SEED_PRICE_COINS (180 🪙): Crystal Flora,
// Cosmic Nebula, Chrono Willow. Retired and unknown ids count as the species they render as.
export const isSpecialTree = (treeType: string | null | undefined): boolean => seedPrice(treeType) === SURREAL_SEED_PRICE_COINS

// How many times the mastery coins a tree of this species pays: SPECIAL_COIN_MULTIPLIER (×1.5) for a
// special tree, 1 for the rest. The database pays by the same rule (species_coin_multiplier()).
export const speciesCoinMultiplier = (treeType: string | null | undefined): number => (isSpecialTree(treeType) ? SPECIAL_COIN_MULTIPLIER : 1)

// 🪙 to change a planted tree from one species to another in the Tree Workshop: the price difference
// when the new species costs more, nothing otherwise (no refund for going back to a cheaper one).
export const speciesUpgradeCost = (from: string | null | undefined, to: string | null | undefined): number => Math.max(0, seedPrice(to) - seedPrice(from))

// A stored tree_type as a current species id (the picker's starting value, etc.).
export const toTreeTypeId = (treeType: string | null | undefined): TreeTypeId => getTreeSpecies(treeType ?? 'oak').id as TreeTypeId

// Mighty Root / Golden Ancient Bloom accent.
export const MIGHTY_GOLD = '#eab308'

// Stage 5 (Golden Ancient Bloom) starts here; used for every gold "fully grown" accent.
export const GOLDEN_BLOOM_PERCENT = 90

// ── Size tier: how much a subject holds ──────────────────────────────────────
// Two independent axes describe a tree:
//   • Growth stage (1–5)          = mastery progress (% memorized), from getTreeStage.
//   • Size tier (sm / md / lg / xl) = subject scope, from the deck's knowledge_items count.
// Only statements count: mindmap nodes (including empty sub-branches) never make a tree bigger.

export type TreeSizeTier = 'sm' | 'md' | 'lg' | 'xl'

export type TreeSizeInfo = {
  tier: TreeSizeTier
  // Multiplier for the drawn tree, anchored at the trunk base.
  scale: number
  name: string
  // Short chip text, e.g. "🌿 Standard".
  badge: string
  // Inclusive item range; `max` is null for the open-ended top tier.
  min: number
  max: number | null
}

export const TREE_SIZE_TIERS: readonly TreeSizeInfo[] = [
  { tier: 'sm', scale: 0.85, name: 'Compact Sprout', badge: '🌱 Compact', min: 0, max: 50 },
  { tier: 'md', scale: 1, name: 'Standard Tree', badge: '🌿 Standard', min: 51, max: 120 },
  { tier: 'lg', scale: 1.18, name: 'Sturdy Ancient', badge: '🌳 Sturdy', min: 121, max: 200 },
  { tier: 'xl', scale: 1.35, name: 'Colossal Grand', badge: '👑 Colossal', min: 201, max: null },
]

// Pure. Negative counts clamp to 0, fractions floor, NaN counts as 0 (sm).
export function getTreeSizeTier(itemCount: number): TreeSizeInfo {
  const n = Number.isNaN(itemCount) ? 0 : Math.max(0, Math.floor(itemCount))
  return TREE_SIZE_TIERS.find((t) => t.max === null || n <= t.max) ?? TREE_SIZE_TIERS[0]
}

// Largest size-tier multiplier (layout headroom).
export const MAX_TREE_SCALE = Math.max(...TREE_SIZE_TIERS.map((t) => t.scale))

// Surreal species stand taller and wider than the natural ones: their drawing is scaled by this
// about the trunk base (so the trunk stays on its tile), on top of the size tier.
export const SURREAL_SCALE = 1.18

// A species' own presence multiplier: SURREAL_SCALE for the surreal species, 1 for the rest.
export const speciesScale = (treeType: string | null | undefined): number => (isSurrealForm(getTreeSpecies(treeType ?? 'oak').form) ? SURREAL_SCALE : 1)

// How big a tree is drawn: its size tier (statements) × its species' presence. Layout that follows
// the crown (bubbles, shadows, buff tags, the deck scene's box) uses this.
export const treeScale = (treeType: string | null | undefined, itemCount: number): number => getTreeSizeTier(itemCount).scale * speciesScale(treeType)
