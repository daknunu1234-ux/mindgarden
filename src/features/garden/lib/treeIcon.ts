const TREE_ICON: Record<string, string> = { oak: '🌳', pine: '🌲', sakura: '🌸' }

// Emoji for a deck's tree skin; unknown skins fall back to an oak.
export const getTreeIcon = (treeType: string): string => TREE_ICON[treeType] ?? '🌳'
