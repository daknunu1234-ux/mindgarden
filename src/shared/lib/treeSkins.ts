// Colors per tree skin (decks.tree_type), shared by the tree illustration (garden) and its
// roots (mindmap) so the trunk and the root network are always the same wood.
export type TreeSkin = {
  canopyLight: string
  canopyDark: string
  // Trunk and root wood, and a deeper shade for the underground conduit.
  bark: string
  barkDeep: string
  // Tint a well-mastered root glows with.
  glow: string
}

const SKINS: Record<string, TreeSkin> = {
  oak: { canopyLight: '#86efac', canopyDark: '#22c55e', bark: '#8b5a2b', barkDeep: '#5c3a1a', glow: '#a3e635' },
  pine: { canopyLight: '#4ade80', canopyDark: '#15803d', bark: '#6b4423', barkDeep: '#3b2615', glow: '#34d399' },
  sakura: { canopyLight: '#fbcfe8', canopyDark: '#f472b6', bark: '#7a3e3e', barkDeep: '#4a2323', glow: '#f9a8d4' },
}

export const getTreeSkin = (treeType: string): TreeSkin => SKINS[treeType] ?? SKINS.oak

// Mighty Root / Blooming Golden Tree accent.
export const MIGHTY_GOLD = '#eab308'
