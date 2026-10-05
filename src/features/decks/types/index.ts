// A deck as returned by the decks actions (camelCase, see API SPEC.md §6 getDecks).
export type Deck = {
  id: string
  userId: string
  title: string
  slug: string
  description: string | null
  isPublic: boolean
  treeType: string
  createdAt: string
  // The owner hosts a Mind Tournament on it (only meaningful while isPublic).
  isTournamentOpen: boolean
}

// One shared tree the player has opened (Visited Gardens, getVisitedGardens). ownerId = the tree's gardener.
// statementCount is null when the count couldn't be read.
export type VisitedTree = {
  deckId: string
  ownerId: string
  title: string
  slug: string
  treeType: string
  statementCount: number | null
  visitedAt: string
}

// Items expose only the prompt: correct_stmt stays on the server so answers remain hidden.
// parentId: the statement a sub-statement sits under (same root), null for a statement.
export type DeckTreeItem = { id: string; prompt: string; parentId?: string | null }

export type DeckTreeNode = {
  id: string
  title: string
  sortOrder: number
  items: DeckTreeItem[]
  children: DeckTreeNode[]
}

// getDeckBySlug payload (API SPEC.md §6).
export type DeckDetail = {
  deck: Deck
  tree: DeckTreeNode[]
}

// Owner-only editor data (getDeckEditor). Includes true statements, so never for other players.
// Items are in display order (each statement followed by its sub-statements); parentId as above.
export type EditorItem = { id: string; statement: string; drillable: boolean; parentId: string | null }
export type EditorNode = { id: string; title: string; depth: number; items: EditorItem[] }
export type DeckEditor = { deckId: string; treeType: string; nodes: EditorNode[] }
