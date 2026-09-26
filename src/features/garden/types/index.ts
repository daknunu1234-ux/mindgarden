export type TreeStage = 1 | 2 | 3 | 4

// What a tree card needs to render. Pages map feature data (Deck + DeckProgress) into this shape.
export type DeckCardView = {
  id: string
  slug: string
  title: string
  description: string | null
  treeType: string
  // 0–100, from progress.getProgressByDecks (0 for signed-out players).
  masteryPercent: number
}
