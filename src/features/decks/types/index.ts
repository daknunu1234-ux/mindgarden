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

// A tree's outline lives in one table, public.content_nodes (migration 20261013000000): every row is
// a root or a statement, under any other node (a top-level node is always a root).
export type NodeType = 'root' | 'statement'

// One node of the outline, in outline order (a node, then its branch), with its depth (0 = a
// top-level root). `content` = a root's title or a statement's text.
export type ContentRow = { id: string; parentId: string | null; type: NodeType; content: string; depth: number }

// The mindmap's view: roots nested by their nearest root above; each root's items = the statements
// whose nearest root it is, in outline order. prompt = that root's title. parentId: the statement an
// item sits under (null when it sits right under its root); depth: how many statements are above it
// before its root (0 = right under the root).
export type DeckTreeItem = { id: string; prompt: string; parentId?: string | null; depth?: number }

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

// Editor / reader data (getDeckEditor for the owner, getDeckReader for a shared tree). `rows` = the
// whole outline (the Workshop edits it); `nodes` = the same as roots (depth = how many roots are
// above) with their statements (items, as in DeckTreeItem), for the lists and dialogs.
export type EditorItem = { id: string; statement: string; drillable: boolean; parentId: string | null; depth?: number }
export type EditorNode = { id: string; title: string; depth: number; items: EditorItem[] }
export type DeckEditor = { deckId: string; treeType: string; nodes: EditorNode[]; rows: ContentRow[] }
