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
}
