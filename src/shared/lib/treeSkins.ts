// Tree species catalog (decks.tree_type): shared by the deck form and validation (decks), the
// tree illustrations (garden) and the root network (mindmap), so every view uses the same wood.

// Drawing family: decides the silhouette; colors below decide the look.
export type TreeForm = 'broadleaf' | 'conifer' | 'bamboo' | 'cactus'

export type TreeSkin = {
  canopyLight: string
  canopyDark: string
  // Trunk and root wood, and a deeper shade for the underground conduit.
  bark: string
  barkDeep: string
  // Tint a well-mastered root glows with.
  glow: string
  // Optional accents: fruit (apple, stages 4–5) and flowers (sakura / saguaro, stage 5).
  fruit?: string
  flower?: string
}

export type TreeSpecies = { id: string; label: string; icon: string; form: TreeForm; skin: TreeSkin }

export const TREE_SPECIES = [
  {
    id: 'oak',
    label: 'Oak',
    icon: '🌳',
    form: 'broadleaf',
    skin: { canopyLight: '#86efac', canopyDark: '#22c55e', bark: '#8b5a2b', barkDeep: '#5c3a1a', glow: '#a3e635' },
  },
  {
    id: 'pine',
    label: 'Pine',
    icon: '🌲',
    form: 'conifer',
    skin: { canopyLight: '#4ade80', canopyDark: '#15803d', bark: '#6b4423', barkDeep: '#3b2615', glow: '#34d399' },
  },
  {
    id: 'sakura',
    label: 'Sakura',
    icon: '🌸',
    form: 'broadleaf',
    skin: {
      canopyLight: '#fbcfe8',
      canopyDark: '#f472b6',
      bark: '#7a3e3e',
      barkDeep: '#4a2323',
      glow: '#f9a8d4',
      flower: '#fdf2f8',
    },
  },
  {
    id: 'bamboo',
    label: 'Zen Bamboo',
    icon: '🎋',
    form: 'bamboo',
    skin: { canopyLight: '#6ee7b7', canopyDark: '#059669', bark: '#65a30d', barkDeep: '#3f6212', glow: '#34d399' },
  },
  {
    id: 'apple',
    label: 'Apple Orchard',
    icon: '🍎',
    form: 'broadleaf',
    skin: {
      canopyLight: '#a3e635',
      canopyDark: '#4d7c0f',
      bark: '#7c4a21',
      barkDeep: '#4b2c13',
      glow: '#bef264',
      fruit: '#ef4444',
      flower: '#fff1f2',
    },
  },
  {
    id: 'saguaro',
    label: 'Desert Saguaro',
    icon: '🌵',
    form: 'cactus',
    skin: {
      canopyLight: '#86c77a',
      canopyDark: '#3f7d45',
      bark: '#a16207',
      barkDeep: '#713f12',
      glow: '#facc15',
      flower: '#f472b6',
    },
  },
] as const satisfies readonly TreeSpecies[]

export type TreeTypeId = (typeof TREE_SPECIES)[number]['id']

// For z.enum and form options.
export const TREE_TYPE_IDS = TREE_SPECIES.map((s) => s.id) as [TreeTypeId, ...TreeTypeId[]]

const BY_ID = new Map<string, TreeSpecies>(TREE_SPECIES.map((s) => [s.id, s]))

// Unknown or legacy values fall back to oak, so old rows always render.
export const getTreeSpecies = (treeType: string): TreeSpecies => BY_ID.get(treeType) ?? BY_ID.get('oak')!

export const getTreeSkin = (treeType: string): TreeSkin => getTreeSpecies(treeType).skin

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
