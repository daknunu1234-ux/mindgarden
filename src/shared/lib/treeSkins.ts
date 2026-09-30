// Tree species catalog (decks.tree_type): shared by the deck form and validation (decks), the
// tree illustrations (garden) and the root network (mindmap), so every view uses the same wood.

// Drawing: each species has its own silhouette (garden TreeStageSvg); colours below decide the look.
export type TreeForm = 'oak' | 'pine' | 'birch' | 'cherry' | 'willow' | 'mystic' | 'palm' | 'citrus' | 'maple' | 'cactus'

export type TreeSkin = {
  canopyLight: string
  canopyDark: string
  // Trunk and root wood, and a deeper shade for the underground conduit.
  bark: string
  barkDeep: string
  // Tint a well-mastered root glows with.
  glow: string
  // Optional accents: fruit (citrus) and flowers / sparkles (cherry, cactus, mystic).
  fruit?: string
  flower?: string
}

export type TreeSpecies = { id: string; label: string; icon: string; form: TreeForm; skin: TreeSkin }

// Ten species, in the order the pickers show them. `form` = the species' own drawing.
export const TREE_SPECIES = [
  {
    id: 'oak',
    label: 'Oak',
    icon: '🌳',
    form: 'oak',
    skin: { canopyLight: '#7ee787', canopyDark: '#16a34a', bark: '#9a5b2c', barkDeep: '#5c3417', glow: '#a3e635' },
  },
  {
    id: 'pine',
    label: 'Pine',
    icon: '🌲',
    form: 'pine',
    skin: { canopyLight: '#4ade80', canopyDark: '#0f7a3a', bark: '#7a4a23', barkDeep: '#3b2615', glow: '#34d399' },
  },
  {
    id: 'birch',
    label: 'Golden Birch',
    icon: '🍂',
    form: 'birch',
    skin: { canopyLight: '#fde047', canopyDark: '#e3a008', bark: '#f5f1e8', barkDeep: '#8a8175', glow: '#facc15' },
  },
  {
    id: 'cherry',
    label: 'Cherry Blossom',
    icon: '🌸',
    form: 'cherry',
    skin: { canopyLight: '#fbcfe8', canopyDark: '#f472b6', bark: '#7a3e3e', barkDeep: '#4a2323', glow: '#f9a8d4', flower: '#fff1f7' },
  },
  {
    id: 'willow',
    label: 'Weeping Willow',
    icon: '🌿',
    form: 'willow',
    skin: { canopyLight: '#c5f27a', canopyDark: '#5fa82a', bark: '#7b5a36', barkDeep: '#4a331c', glow: '#bef264' },
  },
  {
    id: 'mystic',
    label: 'Mystic Bonsai',
    icon: '🔮',
    form: 'mystic',
    skin: { canopyLight: '#e0a8ff', canopyDark: '#8b3fd9', bark: '#6b4a5e', barkDeep: '#3d2536', glow: '#e879f9', flower: '#f5d0fe' },
  },
  {
    id: 'palm',
    label: 'Tropical Palm',
    icon: '🌴',
    form: 'palm',
    skin: { canopyLight: '#6ee77a', canopyDark: '#15944a', bark: '#c98a4b', barkDeep: '#7a4b22', glow: '#86efac', fruit: '#8a4f22' },
  },
  {
    id: 'citrus',
    label: 'Citrus Grove',
    icon: '🍊',
    form: 'citrus',
    skin: { canopyLight: '#8df07a', canopyDark: '#1f9d3a', bark: '#8a5a2b', barkDeep: '#52341a', glow: '#fdba74', fruit: '#ff8a1f', flower: '#ffffff' },
  },
  {
    id: 'maple',
    label: 'Autumn Maple',
    icon: '🍁',
    form: 'maple',
    skin: { canopyLight: '#ff8a5c', canopyDark: '#d61f2c', bark: '#6e3b22', barkDeep: '#3e1f10', glow: '#fb7185' },
  },
  {
    id: 'cactus',
    label: 'Desert Cactus',
    icon: '🌵',
    form: 'cactus',
    skin: { canopyLight: '#8fd46f', canopyDark: '#2f8a3e', bark: '#a16207', barkDeep: '#713f12', glow: '#facc15', flower: '#ff5fa2' },
  },
] as const satisfies readonly TreeSpecies[]

export type TreeTypeId = (typeof TREE_SPECIES)[number]['id']

// For z.enum and form options.
export const TREE_TYPE_IDS = TREE_SPECIES.map((s) => s.id) as [TreeTypeId, ...TreeTypeId[]]

// Species retired when the catalogue grew to ten, and the one each became. Migration
// 20261001000000_ten_tree_species.sql rewrites stored rows the same way; until it runs, old rows
// still render as their successor.
export const LEGACY_TREE_TYPES: Readonly<Record<string, TreeTypeId>> = { sakura: 'cherry', saguaro: 'cactus', apple: 'citrus', bamboo: 'palm' }

const BY_ID = new Map<string, TreeSpecies>(TREE_SPECIES.map((s) => [s.id, s]))

// Unknown values fall back to oak, retired ones to their successor, so old rows always render.
export const getTreeSpecies = (treeType: string): TreeSpecies => BY_ID.get(treeType) ?? BY_ID.get(LEGACY_TREE_TYPES[treeType] ?? 'oak')!

export const getTreeSkin = (treeType: string): TreeSkin => getTreeSpecies(treeType).skin

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

// Largest multiplier any tree can reach (layout headroom).
export const MAX_TREE_SCALE = Math.max(...TREE_SIZE_TIERS.map((t) => t.scale))
