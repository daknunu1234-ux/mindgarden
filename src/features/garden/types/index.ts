// What a tree card needs to render. Pages map feature data (e.g. a Deck) into this shape.
export type DeckCardView = {
  id: string
  slug: string
  title: string
  description: string | null
  treeType: string
}
